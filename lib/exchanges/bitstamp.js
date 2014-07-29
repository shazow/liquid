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
    var client = new BitstampRequest(config.api_keys.BITSTAMP_CLIENT_ID, config.api_keys.BITSTAMP_KEY, config.api_keys.BITSTAMP_SECRET);

    return new BitstampExchange(client, stream, config.pretend);
};


BitstampExchange.prototype.ready = function(callback) {
    this.debug('Preparing.');
    var exchange = this;

    // Load order state.
    async.series([
        function rateLimit(callback) {
            exchange.rateLimiter.removeTokens(1, callback);
        },
        function loadOrders(callback) {
            exchange.client.post('https://www.bitstamp.net/api/open_orders/', function(err, response, body) {
                if (err) {
                    logger.error('Failed to load placed orders:', err);
                    callback && callback.call(exchange, err);
                    return;
                }

                var placedOrders = JSON.parse(body).map(toOrder);
                placedOrders.forEach(function(order) {
                    exchange.saveOrder(order);
                });

                // XXX: Sync this with persistent storage. Resolve changes.

                exchange.debug('Loaded placed orders:', placedOrders.length);
                callback && callback.call(exchange, err);
            });
        },
        function checkBalance(callback) {
            exchange.checkBalance(callback);
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
 * @param {function=} callback Function called upon completion.
 */
BitstampExchange.prototype.checkBalance = function(callback) {
    var exchange = this;
    exchange.rateLimiter.removeTokens(1, function() {
        exchange.client.post('https://www.bitstamp.net/api/balance/', function(err, response, body) {
            if (err) {
                logger.error('Failed to load balance for Bitstamp:', err);
                callback(err, response, body);
                return;
            }

            var balance = JSON.parse(body);
            exchange.debug('Loaded balance:', balance);

            // XXX: Fill this in.
            // if (balance.usd_available < foo || balance.btc_available < bar) {
            //     err = new Error('Insufficient balance in Bitstamp account.');
            //  }

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
            logger.info('[exchange:bitme] Pretend placeOrder: %s', order);
            // TODO: exchange.saveOrder?
            callback();
            return;
        };

        logger.error('[exchange:bitstamp] Live placeOrder not activated yet.');
        callback();
        return;

        // XXX: Use this when ready:
        var endpoint = {
            'ASK': 'https://www.bitstamp.net/api/sell/',
            'BID': 'https://www.bitstamp.net/api/buy/'
        }[order.type];

        exchange.rateLimiter.removeTokens(1, function() {
            var params = {
                'amount': order.quantity.toFixed(),
                'price': order.rate.toFixed()
            };
            exchange.client.post(endpoint, params, function(err, response) {
                if (err) {
                    callback(err, response);
                    return;
                }

                var newOrder = toOrder(JSON.parse(response.body));
                exchange.debug('Placed %s (from: %s)', newOrder, order);
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
            logger.info('[exchange:bitme] Pretend cancelOrder: %s', order);
            // TODO: exchange.deleteOrder?
            callback();
            return;
        };

        logger.error('[exchange:bitstamp] Live cancelOrder not activated yet.');
        callback();
        return;

        // XXX: Use this when ready:
        exchange.rateLimiter.removeTokens(1, function() {
            var params = {
                'id': order.id
            };
            exchange.client.post('https://www.bitstamp.net/api/cancel_order/', params, function(err, response) {
                if (err) {
                    callback(err, response);
                    return;
                }

                var isSuccess = JSON.parse(response.body);
                // TODO: Do something with this?
                exchange.debug('Cancelled %s (from: %s)', isSuccess, order);
                callback(err, order);
            });
        });

    });
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
    return new Order(d.id, type, d.amount, d.price, null, 'bitstamp');
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
