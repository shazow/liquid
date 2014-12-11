var util = require('util'),
    async = require('async'),
    BitstampRequest = require('bitstamp-request'),
    PusherClient = require('pusher-client'),
    RateLimiter = require('limiter').RateLimiter;

var order = require('../order.js'),
    logger = require('../logger.js'),
    BaseExchange = require('./base.js').BaseExchange;


/**
 * Liquid trading interface to Bitstamp.
 *
 * @param {BitstampRequest} client
 * @param {events.EventEmitter} stream Event stream emitting 'trade' events.
 * @param {boolean} pretend Don't execute any trades, just watch.
 */
var BitstampExchange = module.exports.BitstampExchange = function(client, stream, pretend, delay) {
    BitstampExchange.super_.call(this, pretend, delay);

    this.client = client;
    this.stream = stream;
    this.pretend = pretend;

    // Use this rate limiter whenever using client.
    this.rateLimiter = new RateLimiter(55, 'minute'); // Actually 60 but we'll be careful.

    // Use async.mapSeries if nonce must be strictly-incrementing, async.map otherwise.
    this.requestMap = async.mapSeries;
};

util.inherits(BitstampExchange, BaseExchange);

BitstampExchange.id = 'bitstamp';
BitstampExchange.configKeys = ['BITSTAMP_CLIENT_ID', 'BITSTAMP_KEY', 'BITSTAMP_SECRET'];


/**
 * Instantiate necessary clients based on configuration and return a
 * {@code BitcoinExchange} instance.
 *
 * @param {{BITSTAMP_CLIENT_ID: string, BITSTAMP_KEY: string, BITSTAMP_SECRET: string}}
 * @return {BitstampExchange}
 */
BitstampExchange.fromConfig = function(config) {
    var stream = new PusherClient('de504dc5763aeef9ff52');
    var client = new BitstampRequest(config.apiKeys.BITSTAMP_CLIENT_ID, config.apiKeys.BITSTAMP_KEY, config.apiKeys.BITSTAMP_SECRET);

    // Bitstamp ticks are only informative, so we make them less frequent.
    var delay = (config.tickDelay || 1000) * 5;

    var exchange = new BitstampExchange(client, stream, config.pretend, delay);

    return exchange;
};


/**
 * Execute a unit of polling.
 *
 * Assumed to be run inside of the requestLock, must be released on completion.
 */
BitstampExchange.prototype.tick = function() {
    var exchange = this;

    exchange.requestLock.release();
    exchange.loadOrders(function(err) {
        if (!exchange.getOrders().length) {
            // Slow down polling when there are no orders we're aware of.
            exchange.ticker.pause(5);
        }
    }, true /* emitTrades */);

};


BitstampExchange.prototype.ready = function(callback) {
    this.debug('Preparing.');
    var exchange = this;

    // Load order state.
    async.series([
        function loadOrders(callback) {
            exchange.loadOrders(function(err) {
                var placedOrders = exchange.getOrders();
                if (placedOrders.length) {
                    exchange.debug('Loaded placed orders:', placedOrders.length);
                }

                callback(err);
            });
        },
        function checkBalance(callback) {
            // We don't really care what the minimums are at this point, we just
            // want to update the internal balance values.
            var minQuantity, minValue;
            exchange.checkBalance(minQuantity, minValue, callback);
        },
        function subscribeStream(callback) {
            exchange.debug('Subscribing to orderbook stream.');
            exchange.stream.subscribe('order_book').bind('data', function(data) {
                exchange.emit('orderbook', toOrderbook(data));
            });
            callback();
        },
        function ready(callback) {
            BitstampExchange.super_.prototype.ready.call(exchange, callback);
        }
    ], callback);
};


/**
 * Stop stream subscription.
 *
 * @param {function=} callback Function called upon completion.
 */
BitstampExchange.prototype.cleanup = function(callback) {
    this.stream.unsubscribe('order_book');
    this.stream.disconnect();

    BitstampExchange.super_.prototype.cleanup.call(this, callback);
};


/**
 * Load order state and emit any missing orders as trades.
 *
 * @param {function=} callback Function called upon completion.
 * @param {boolean} diffOrders Perform diffOrders and emit changes.
 */
BitstampExchange.prototype.loadOrders = function(callback, emitTrades) {
    var exchange = this;
    exchange.rateLimiter.removeTokens(1, function() {
        exchange.requestLock.acquire(true /* exclusive */, function() {
            exchange.client.post('https://www.bitstamp.net/api/open_orders/', function(err, response, body) {
                exchange.requestLock.release();

                var r = toResponse(response, err);
                var err = r.err, data = r.data;

                if (err) {
                    logger.error('Failed to load Bitstamp placed orders:', err);
                    callback && callback.call(exchange, err);
                    return;
                }

                var placedOrders = data.map(toOrder);
                if (exchange.pretend) {
                    // Inject our pretend-saved orders.
                    placedOrders = placedOrders.concat(exchange.getOrders());
                }

                var trades = order.diffOrders(exchange.getOrders(), placedOrders);
                exchange.debug('Loaded placed orders: %d open, %d new trades.', placedOrders.length, trades.length);
                if (!trades.length) {
                    // No new trades.
                    callback && callback.call(exchange, err);
                    return;
                }

                placedOrders.forEach(function(order) {
                    exchange.saveOrder(order, true /* isUpdate */);
                });

                trades.forEach(function(order) {
                    if (order.id !== null) {
                        exchange.deleteOrder(order);
                    }
                    emitTrades && exchange.emit('trade', order);
                });

                callback && callback.call(exchange, err);
            });
        });
    });
};


/**
 * Check whether there is sufficient balance. Callback with err if not.
 *
 * @param {number=} minQuantity Minimum BTC to expect in balance.
 * @param {number=} minValue Minimum USD to expect in balance.
 * @param {function=} callback Function called upon completion.
 */
BitstampExchange.prototype.checkBalance = function(minQuantity, minValue, callback) {
    var exchange = this;
    exchange.rateLimiter.removeTokens(1, function() {
        exchange.requestLock.acquire(true /* exclusive */, function() {
            exchange.client.post('https://www.bitstamp.net/api/balance/', function(err, response, body) {
                exchange.requestLock.release();

                var r = toResponse(response, err);
                var err = r.err, data = r.data;

                if (err) {
                    logger.error('Failed to load balance for Bitstamp:', err);
                    callback(err, response, body);
                    return;
                }

                // Convert returned values to our balance representation params.
                var balance = toBalance(data);
                exchange.setBalance(balance.quantity, balance.value);

                if (minQuantity && exchange.balance.quantity.lt(minQuantity)) {
                    err = new Error('Insufficient BTC balance on Bitstamp: ' + exchange.balance.quantity.toString());
                } else if (minValue && exchange.balance.value.lt(minValue)) {
                    err = new Error('Insufficient USD balance on Bitstamp: ' + exchange.balance.quantity.toString());
                }

                callback && callback.call(exchange, err, balance);
            });
        });
    });
};

/**
 * Place an instruction of orders for this exchange.
 *
 * @param {Array.<Order>} orders List of orders to place concurrently.
 * @param {function} callback
 */
BitstampExchange.prototype.placeOrders = function(orders, callback) {
    var exchange = this;

    exchange.requestMap(orders, function(order, callback) {
        if (exchange.pretend) {
            logger.info('[exchange:bitstamp] Pretend placeOrder:', order.toString());
            exchange.saveOrder(order);
            callback();
            return;
        };

        var endpoint = {
            'ASK': 'https://www.bitstamp.net/api/sell/',
            'BID': 'https://www.bitstamp.net/api/buy/'
        }[order.type];

        // TODO: Rewrite this to use async.serial or something?
        exchange.rateLimiter.removeTokens(1, function() {
            var params = {
                'amount': order.quantity.toFixed(),
                // Bitstamp wants 2 decimal places, max 7 digits total. Will
                // need to add precision truncating if price reaches $100,000.
                // #goodproblemstohave
                'price': order.rate.toFixed(2)
            };
            exchange.requestLock.acquire(true /* exclusive */, function() {
                exchange.client.post(endpoint, params, function(err, response, body) {
                    exchange.requestLock.release();

                    var r = toResponse(response, err);
                    var err = r.err, data = r.data;

                    if (err) {
                        callback(err, response, body);
                        return;
                    }

                    var newOrder = toOrder(data);
                    exchange.debug('Placed %s (from: %s)', newOrder.toString(), order.toString());
                    exchange.saveOrder(newOrder);
                    callback(err, newOrder);
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
BitstampExchange.prototype.cancelOrders = function(orders, callback) {
    var exchange = this;
    exchange.requestMap(orders, function(order, callback) {
        if (exchange.pretend) {
            logger.info('[exchange:bitstamp] Pretend cancelOrder: %s', order);
            exchange.deleteOrder(order);
            callback();
            return;
        };

        // TODO: Rewrite this to use async.serial or something?
        exchange.rateLimiter.removeTokens(1, function() {
            var params = {
                'id': order.id
            };
            exchange.requestLock.acquire(true /* exclusive */, function() {
                exchange.client.post('https://www.bitstamp.net/api/cancel_order/', params, function(err, response, body) {
                    exchange.requestLock.release();

                    var r = toResponse(response, err);
                    var err = r.err, data = r.data;

                    if (err) {
                        callback(err, response);
                        return;
                    }

                    // TODO: Do something with this?
                    exchange.debug('Cancelled %s (from: %s)', data, order.toString());
                    callback(err, order);
                });
            });
        });

    });
};


/**
 * Given a Bitstamp response, handle all possible error scenarios and
 * return an object describing the parsed data and errors.
 *
 * @static
 * @param {object} response Response object
 * @param {object=} err Possible error object
 * @return {object}
 */
var toResponse = BitstampExchange.toResponse = function(response, err) {
    var err, data;
    try {
        data = !err && JSON.parse(response.body);
        err = err || toError(data);
    } catch (e) {
        err = e;
        err.resp = response;
    }
    return {
        err: err,
        data: data,
    }
};


/**
 * Given a Bitstamp response body as parsed JSON, return an {@code Error}
 * instace if it contains an error, or null otherwise.
 *
 * @static
 * @param {object}
 * @return {Error|null}
 */
var toError = BitstampExchange.toError = function(r) {
    if (!r || !r.error) return null;

    if (typeof r.error === 'string') {
        return new Error(r.error);
    }

    var reasons = [];
    for (var key in r.error) {
        var s = key + ': ' + r.error[key].join(' ');
        reasons.push(s);
    };

    if (reasons.length) {
        return new Error(reasons.join('\n'));
    }

    return null;
};


/**
 * Given a Bitstamp order (as returned by the API), return a corresponding
 * {@code Order} object.
 *
 * @static
 * @param {object} d
 * @return {Order}
 */
var toOrder = BitstampExchange.toOrder = function(d) {
    var type = ['BID', 'ASK'][d.type];
    try {
        return new order.Order(d.id, type, d.amount, d.price, null, 'bitstamp');
    } catch (e) {
        logger.warn('Failed to convert Bitstamp order:', d);
        throw e;
    }
};


/**
 * Given a Bitstamp balance dict (as returned by the API), return normalized
 * parameters for {@code BaseExchange.prototype.setBalance}.
 *
 * @static
 * @param {object} balance
 * @return {{value: string, quantity: string}}
 */
var toBalance = BitstampExchange.toBalance = function(balance) {
    return {
        'value': balance['usd_available'],
        'quantity': balance['btc_available']
    };
};


/**
 * Given a Bitstamp orderbook (as returned by the API), return a corresponding
 * orderbook.
 *
 * @static
 * @param {object} d
 * @return {{asks: Array.<Order>, bids: Array.<Order>}}
 */
var toOrderbook = BitstampExchange.toOrderbook = function(d) {
    return {
        'asks': d.asks.map(function(o) {
            return new order.Order(null, 'ASK', o[1], o[0], null, 'bitstamp');
        }),
        'bids': d.bids.map(function(o) {
            return new order.Order(null, 'BID', o[1], o[0], null, 'bitstamp');
        })
    };
};
