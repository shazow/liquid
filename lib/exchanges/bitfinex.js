var async = require('async'),
    crypto = require('crypto'),
    request = require('request'),
    RateLimiter = require('limiter').RateLimiter;
    util = require('util');

var logger = require('../logger.js'),
    order = require('../order.js'),
    transaction = require('../transaction.js'),
    counter = require('../util.js').counter,
    mergeObjects = require('../util.js').mergeObjects,
    BaseExchange = require('./base.js').BaseExchange;


var BitfinexClient = module.exports.BitfinexClient = function(key, secret) {
    this.version = 'v1'
    this.url = 'https://api.bitfinex.com/' + this.version;
    this.key = key;
    this.secret = secret;
    this.getNonce = counter(+new Date());
};

/**
 * Implement Bitfinex's strange header-based payloads.
 *
 * See: https://www.bitfinex.com/pages/api
 */
BitfinexClient.prototype.encode = function(params) {
    var payload = new Buffer(JSON.stringify(params)).toString('base64');
    var signature = crypto.createHmac('sha384', this.secret).update(payload).digest('hex');
    var headers = {
        'X-BFX-APIKEY': this.key,
        'X-BFX-PAYLOAD': payload,
        'X-BFX-SIGNATURE': signature
    };

    // We discard the form params, because they live in headers now. ¯\_(ツ)_/¯
    return headers;
};

BitfinexClient.prototype.call = function(method, resource, params, cb) {
    if (cb === undefined && typeof(params) == 'function') {
        cb = params;
        params = {};
    }

    var req = {
        'url': this.url + resource,
        'json': true
    };

    if (method == 'GET') {
        req['qs'] = params;
    } else {
        params['request'] = '/' + this.version + resource;
        params['nonce'] = this.getNonce();
        req['headers'] = this.encode(params);
    }

    return request(req, cb);
};


/**
 * Liquid trading interface to Bitfinex.
 *
 * @param {BitfinexClient} client
 * @param {number} delay Number of milliseconds to delay between ticks (default: 1000)
 * @param {boolean} pretend Don't execute any trades, just watch.
 */
var BitfinexExchange = module.exports.BitfinexExchange = function(client, delay, pretend) {
    BitfinexExchange.super_.call(this, pretend);

    this.client = client;
    this.tickDelay = delay;
    this.tickLoop = null;
    this.tickCount = 0;
    this.tickCompleted = 0;
    this.tickSkipAlert = 60; // Log alert if we skip this many ticks in a row.

    // Use this rate limiter whenever using client.
    this.rateLimiter = new RateLimiter(55, 'minute'); // Actually 60 but we'll be careful.

    // This can be switched to async.map if nonce doesn't need to be strictly-incremental.
    // Use async.mapSeries if nonce must be strictly-incrementing, async.map otherwise.
    this.requestMap = async.mapSeries;
};

util.inherits(BitfinexExchange, BaseExchange);

BitfinexExchange.id = 'bitfinex';
BitfinexExchange.configKeys = ['BITFINEX_KEY', 'BITFINEX_SECRET'];


/**
 * Instantiate necessary clients based on configuration and return a
 * {@code BitfinexExchange} instance.
 *
 * @static
 * @param {{BITFINEX_KEY: string, BITFINEX_SECRET: string}}
 * @return {BitfinexExchange}
 */
BitfinexExchange.fromConfig = function(config) {
    var client = new BitfinexClient(config.apiKeys.BITFINEX_KEY, config.apiKeys.BITFINEX_SECRET);

    return new BitfinexExchange(client, config.tickDelay || 1000, config.pretend);
};


/**
 * Execute a unit of polling.
 */
BitfinexExchange.prototype.tick = function() {
    var exchange = this;
    var tickCount = exchange.tickCount++;
    var tickSkipStreak = tickCount - exchange.tickCompleted;

    var hasOrders = exchange.getOrders().length > 0;
    if (!hasOrders && exchange.tickDelay && tickCount % 5 != 0) {
        // Poll 1/5 as often when there are no orders we're aware of.
        return;
    }

    if (!exchange.requestLock.acquire(true /* exclusive */)) {
        // Discard tick while we're still processing changes.

        if (tickSkipStreak == exchange.tickSkipAlert) {
            // This should not happen.
            logger.alert("BitfinexExchange stopped ticking", {
                tickCount: tickCount,
                tickCompleted: exchange.tickCompleted,
                pendingRequests: exchange.resources.using('requests'),
                placedOrders: exchange.getOrders().map(String)
            });
        }

        return;
    }

    var params = {
        // By default, the API returns ~1600 results.
        'limit_bids': 20,
        'limit_asks': 20
    };
    exchange.client.call('GET', '/book/btcusd', params, function(err, response, data) {
        exchange.requestLock.release();

        // We only care about our orders.
        var err = err || toError(data);
        if (err) {
            logger.error('Failure during BitfinexExchange polling:', err.message);
            return;
        }

        exchange.emit('orderbook', toOrderbook(data));

        if (tickSkipStreak >= exchange.tickSkipAlert) {
            logger.info("BitmeExchange resumed ticking after %d skipped ticks.", tickSkipStreak);
        }

        exchange.tickCompleted = tickCount;
    });
};


/**
 * Authenticate to the API and start polling loop.
 *
 * @param {function=} callback Function called upon completion.
 */
BitfinexExchange.prototype.ready = function(callback) {
    this.debug('Preparing.');
    this.cleanup();

    var exchange = this;
    async.series([
        function rateLimit(callback) {
            exchange.rateLimiter.removeTokens(2, callback);
        },
        function loadOrders(callback) {
            logger.warn('XXX: Skipping loadOrders pending account activation.)');
            return callback.call(exchange);

            exchange.client.call('POST', '/orders', function(err, response, data) {
                var err = err || toError(data);
                if (err) {
                    logger.error('Failed to load BitfinexExchange placed orders:', err.message);
                    callback.call(exchange, err);
                    return;
                }

                var placedOrders = data.map(toOrder);
                placedOrders.forEach(function(order) {
                    exchange.saveOrder(order);
                });

                if (placedOrders.length) {
                    exchange.debug('Loaded placed orders:', placedOrders.length);
                }
                callback.call(exchange, err);
            });
        },
        function checkBalance(callback) {
            logger.warn('XXX: Skipping checkBalance pending account activation.');
            return callback.call(exchange);

            // We don't really care what the minimums are at this point, we just
            // want to update the internal balance values.
            var minQuantity, minValue;
            exchange.checkBalance(minQuantity, minValue, callback);
        },
        function startPolling(callback) {
            if (!exchange.tickDelay) {
                exchange.debug('Skipping tick loop.');
                callback && callback.call(exchange);
                return;
            }

            exchange.debug('Starting tick loop.');
            exchange.tickLoop = setInterval(exchange.tick.bind(exchange), exchange.tickDelay);
            callback && callback.call(exchange);
        }
    ], callback);
};


/**
 * Clear polling loop.
 *
 * @param {function=} callback Function called upon completion.
 */
BitfinexExchange.prototype.cleanup = function(callback) {
    if (this.tickLoop) { clearInterval(this.tickLoop); }

    BitfinexExchange.super_.prototype.cleanup.call(this, callback);
};


/**
 * Check whether there is sufficient balance. Callback with err if not.
 *
 * @param {number=} minQuantity Minimum BTC to expect in balance.
 * @param {number=} minValue Minimum USD to expect in balance.
 * @param {function=} callback Function called upon completion.
 */
BitfinexExchange.prototype.checkBalance = function(minQuantity, minValue, callback) {
    var exchange = this;
    exchange.client.call('POST', '/balances', function(err, response, data) {
        var err = err || toError(data);
        if (err) {
            logger.error('Failed to load BitfinexExchange balance:', err);
            callback && callback.call(exchange, err);
            return;
        }

        var balance = toBalance(data); // XXX: Fill this in.
        exchange.setBalance(balance.quantity, balance.value);

        if (minQuantity && exchange.balance.quantity.lt(minQuantity)) {
            err = new Error('Insufficient BTC balance on Bitfinex: ' + exchange.balance.quantity.toString());
        } else if (minValue && exchange.balance.value.lt(minValue)) {
            err = new Error('Insufficient USD balance on Bitfinex: ' + exchange.balance.quantity.toString());
        }

        callback && callback.call(exchange, err);
    });
};


/**
 * Place an instruction of orders for this exchange.
 *
 * @param {Array.<Order>} orders List of orders to place concurrently.
 * @param {function} callback
 */
BitfinexExchange.prototype.placeOrders = function(orders, callback) {
    // TODO: Unstub.
};


/**
 * Cancel orders.
 *
 * @param {Array.<Order>} orders List of orders to cancel concurrently.
 * @param {function} callback
 */
BitfinexExchange.prototype.cancelOrders = function(orders, callback) {
    // TODO: Unstub.
};


/**
 * Given a Bitfinex order (as returned by the API), return a corresponding
 * {@code Order} object.
 *
 * @static
 * @param {object} d
 * @param {boolean=} skipExecuted Don't count executed amount.
 * @return {Order}
 */
var toOrder = BitfinexExchange.toOrder = function(d, skipExecuted) {
    try{
        var amount = d.original_amount;
        if (!skipExecuted) amount = d.remaining_amount;
        var o = new order.Order(d.order_id, d.side.toUpperCase(), d.quantity, d.price, null, 'bitfinex');
    } catch (e) {
        logger.warn('Failed to convert Bitfinex order:', d);
        throw e;
    }
    return o;
};


/**
 * Given a Bitfinex orderbook (as returned by the API), return a corresponding
 * orderbook.
 *
 * @static
 * @param {object} d
 * @return {{asks: Array.<Order>, bids: Array.<Order>}}
 */
var toOrderbook = BitfinexExchange.toOrderbook = function(d) {
    return {
        'asks': d.asks.map(function(o) {
            return new order.Order(null, 'ASK', o.amount, o.price, null, 'bitfinex');
        }),
        'bids': d.bids.map(function(o) {
            return new order.Order(null, 'BID', o.amount, o.price, null, 'bitfinex');
        })
    };
};


/**
 * Given a Bitfinex accounts list (as returned by the API), return normalized
 * parameters for {@code BaseExchange.prototype.setBalance}.
 *
 * @static
 * @param {object} accounts
 * @return {{value: string, quantity: string}}
 */
var toBalance = BitfinexExchange.toBalance = function(accounts) {
    // TODO: Unstub.
};


/**
 * Given a Bitfinex response body as parsed JSON, return an {@code Error}
 * instace if it contains an error, or null otherwise.
 *
 * @static
 * @param {object}
 * @return {Error|null}
 */
var toError = BitfinexExchange.toError = function(r) {
    if (!r || !r.message) return null;

    return new Error(r.message);
};
