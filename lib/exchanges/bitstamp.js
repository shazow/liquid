var BitstampRequest = require('bitstamp-request'),
    BaseExchange = require('./base.js').BaseExchange,
    PusherClient = require('pusher-client'),
    RateLimiter = require('limiter').RateLimiter,
    async = require('async'),
    Order = require('../order.js').Order,
    logger = require('../logger.js');
    util = require('util');


/**
 * Liquid trading interface to Bitstamp.
 *
 * @param {BitstampRequest} client
 * @param {events.EventEmitter} stream Event stream emitting 'trade' events.
 * @param {boolean} pretend Don't execute any trades, just watch.
 */
var BitstampExchange = module.exports.BitstampExchange = function(client, stream, pretend) {
    BitstampExchange.super_.call(this);
    this.id = 'bitstamp';

    this.client = client;
    this.stream = stream;
    this.orders = [];
    this.ordersById = {};
    this.pretend = pretend;

    // Use this rate limiter whenever using client.
    this.rateLimiter = new RateLimiter(55, 'minute'); // Actually 60 but we'll be careful.

    // Use async.mapSeries if nonce must be strictly-incrementing, async.map otherwise.
    this.requestMap = async.mapSeries;
};

util.inherits(BitstampExchange, BaseExchange);

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

    return new BitstampExchange(client, stream, config.pretend);
};


BitstampExchange.prototype.ready = function(callback) {
    this.debug('Preparing.');
    var exchange = this;

    // Load order state.
    async.series([
        function rateLimit(callback) {
            exchange.rateLimiter.removeTokens(2, callback);
        },
        function loadOrders(callback) {
            exchange.client.post('https://www.bitstamp.net/api/open_orders/', function(err, response, body) {
                var data = !err && JSON.parse(body);
                var err = err || toError(data);

                if (err) {
                    logger.error('Failed to load placed orders:', err);
                    callback && callback.call(exchange, err);
                    return;
                }

                var placedOrders = data.map(toOrder);
                placedOrders.forEach(function(order) {
                    exchange.saveOrder(order);
                });

                if (placedOrders.length) {
                    exchange.debug('Loaded placed orders:', placedOrders.length);
                }
                callback && callback.call(exchange, err);
            });
        },
        /* XXX: Cut this?
        function loadTransactions(callback) {
            exchange.client.post('https://www.bitstamp.net/api/user_transactions/', function(err, response, body) {
                var data = !err && JSON.parse(body);
                var err = err || toError(data);

                if (err) {
                    logger.error('Failed to load transactions:', err);
                    callback && callback.call(exchange, err);
                    return;
                }

                // Get the first (latest) transaction we care about.
                var transactions = [];
                for (var i in data) {
                    var t = toTransaction(data[i]);
                    if (!t) continue;

                    transactions.push(t);
                    break;
                };

                if (transactions.length) {
                    exchange.setTransactions(transactions);
                    exchange.debug('Loaded last transaction from previous run:', transactions[0]);
                };

                callback && callback.call(exchange, err);
            });
        },
        */
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

    callback && callback.call(this);
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
        exchange.client.post('https://www.bitstamp.net/api/balance/', function(err, response, body) {
            var data = !err && JSON.parse(body);
            var err = err || toError(data);

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
};

/**
 * Place an instruction of orders for this exchange.
 *
 * @param {Array.<Order>} orders List of orders to place concurrently.
 * @param {function} callback
 */
BitstampExchange.prototype.placeOrders = function(orders, callback) {
    var exchange = this;
    async.map(orders, function(order, callback) {
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

        exchange.rateLimiter.removeTokens(1, function() {
            var params = {
                'amount': order.quantity.toFixed(),
                // Bitstamp wants 2 decimal places, max 7 digits total. Will
                // need to add precision truncating if price reaches $100,000.
                // #goodproblemstohave
                'price': order.rate.toFixed(2)
            };
            exchange.client.post(endpoint, params, function(err, response, body) {
                var data = !err && JSON.parse(body);
                var err = err || toError(data);

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
};


/**
 * Cancel orders.
 *
 * @param {Array.<Order>} orders List of orders to cancel concurrently.
 * @param {function} callback
 */
BitstampExchange.prototype.cancelOrders = function(orders, callback) {
    var exchange = this;
    async.map(orders, function(order, callback) {
        if (exchange.pretend) {
            logger.info('[exchange:bitstamp] Pretend cancelOrder: %s', order);
            exchange.deleteOrder(order);
            callback();
            return;
        };

        exchange.rateLimiter.removeTokens(1, function() {
            var params = {
                'id': order.id
            };
            exchange.client.post('https://www.bitstamp.net/api/cancel_order/', params, function(err, response, body) {
                var data = !err && JSON.parse(body);
                var err = err || toError(data);

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
        return new Order(d.id, type, d.amount, d.price, null, 'bitstamp');
    } catch (e) {
        logger.warn('Failed to convert Bitstamp order:', d);
        throw e;
    }
};


/**
 * Given a Bitstamp transaction (as returned by the API), return a corresponding
 * {@code Transaction} object, or undefined if it's not relevant to us.
 *
 * @static
 * @param {object} d
 * @return {Transaction}
 */
var toTransaction = BitstampExchange.toTransaction = function(t) {
    if (t.type != 2) return;

    console.log('XXX: Bitstamp transaction:', t);
    // XXX: What's the correct parsing here?

    return;
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
            return new Order(null, 'ASK', o[1], o[0], null, 'bitstamp');
        }),
        'bids': d.bids.map(function(o) {
            return new Order(null, 'BID', o[1], o[0], null, 'bitstamp');
        })
    };
};
