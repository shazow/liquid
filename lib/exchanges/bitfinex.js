var async = require('async'),
    crypto = require('crypto'),
    request = require('request'),
    RateLimiter = require('limiter').RateLimiter;
    util = require('util');

var logger = require('../logger.js'),
    order = require('../order.js'),
    transaction = require('../transaction.js'),
    counter = require('../util.js').counter,
    pager = require('../util.js').pager,
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
    BitfinexExchange.super_.call(this, pretend, delay);

    this.client = client;

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

    throw new Error('Bitfinex implementation is not ready for use yet.');

    return new BitfinexExchange(client, config.tickDelay || 1000, config.pretend);
};


/**
 * Execute a unit of polling.
 */
BitfinexExchange.prototype.tick = function() {
    var exchange = this;

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
        function ready(callback) {
            BitfinexExchange.super_.prototype.ready.call(exchange, callback);
        }
    ], callback);
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
    var exchange = this;

    if (exchange.pretend) {
        orders.map(function(order) {
            logger.info('[exchange:bitfinex] Pretend placeOrder:', order.toString());
            exchange.saveOrder(order);
        });
        return;
    }

    var side = {
        'ASK': 'sell',
        'BID': 'buy'
    }[order.type];

    // Bitfinex API limits multi operations to 10 orders.
    var pagedOrders = pager(orders, 10);
    exchange.requestMap(pagedOrders, function(page, callback) {
        var params = page.map(function(order) {
            return {
                'symbol': 'btcusd',     // symbol (string): The name of the symbol (see `/symbols`).
                'amount': order.quantity.toFixed(), // amount (decimal): Order size: how much to buy or sell.
                'price': order.rate.toFixed(3),     // price (price): Price to buy or sell at. May omit if a market order.
                'exchange': 'all',      // exchange (string): "bitfinex", "bitstamp", "all" (for no routing).
                'side': side,           // side (string): Either "buy" or "sell".
                'type': 'limit',        // type (string): Either "market" / "limit" / "stop" / "trailing-stop" / "fill-or-kill".
            };
        });

        exchange.rateLimiter.removeTokens(1, function() {
            exchange.requestLock.acquire(true /* exclusive */, function() {
                exchange.client.call('POST', '/order/new/multi', params, function(err, response, data) {
                    var err = err || toError(data);
                    if (err) {
                        callback(err, response, body);
                        return;
                    }

                    if (data.length !== page.length) {
                        // Bitfinex only returns order ids, so we assume they're the same. :/
                        callback(new Error('Bitfinex returned incorrect number of placed orders: ' + data.length + ' of ' + page.length));
                    }

                    page.map(function(order, i) {
                        var newOrder = order.clone({id: data[i]});
                        exchange.debug('Placed %s (from: %s)', newOrder.toString(), order.toString());
                        exchange.saveOrder(newOrder);
                    });

                    callback();
                });
            });
        });
    }, callback);
};


/**
 * Cancel orders.
 *
 * @param {Array.<Order>} orders List of orders to cancel concurrently.
 * @param {function} callback
 */
BitfinexExchange.prototype.cancelOrders = function(orders, callback) {
    var exchange = this;

    if (exchange.pretend) {
        orders.map(function(order) {
            logger.info('[exchange:bitfinex] Pretend cancelOrder:', order.toString());
            exchange.deleteOrder(order);
        });
        return;
    }

    // Bitfinex API limits multi operations to 10 orders.
    var pagedOrders = pager(orders, 10);
    exchange.requestMap(pagedOrders, function(page, callback) {
        var params = {
            'order_ids': page.map(function(order) {
                return order.id
            })
        };

        exchange.rateLimiter.removeTokens(1, function() {
            exchange.requestLock.acquire(true /* exclusive */, function() {
                exchange.client.call('POST', '/order/cancel/multi', params, function(err, response, data) {
                    var err = err || toError(data);
                    if (err) {
                        callback(err, response, body);
                        return;
                    }

                    // XXX: Not clear what this is supposed to return.

                    callback();
                });
            });
        });
    }, callback);

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
