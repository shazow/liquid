var async = require('async'),
    util = require('util'),
    BitmeClient = require('bitme');

var logger = require('../logger.js'),
    order = require('../order.js'),
    transaction = require('../transaction.js'),
    BaseExchange = require('./base.js').BaseExchange;


/**
 * Liquid trading interface to Bitme.
 *
 * @param {BitmeClient} client
 * @param {number} delay Number of milliseconds to delay between ticks (default: 1000)
 * @param {boolean} pretend Don't execute any trades, just watch.
 */
var BitmeExchange = module.exports.BitmeExchange = function(client, delay, pretend) {
    BitmeExchange.super_.call(this, pretend);
    this.id = 'bitme';

    this.client = client;
    this.tickDelay = delay;
    this.tickLoop = null;
    this.tickCount = 0;

    this.pendingOrders = 0;

    // This can be switched to async.map if nonce doesn't need to be strictly-incremental.
    // Use async.mapSeries if nonce must be strictly-incrementing, async.map otherwise.
    this.requestMap = async.map;
};

util.inherits(BitmeExchange, BaseExchange);

BitmeExchange.configKeys = ['BITME_KEY', 'BITME_SECRET'];


/**
 * Instantiate necessary clients based on configuration and return a
 * {@code BitmeExchange} instance.
 *
 * @static
 * @param {{BITME_KEY: string, BITME_SECRET: string}}
 * @return {BitmeExchange}
 */
BitmeExchange.fromConfig = function(config) {
    var client = new BitmeClient(config.apiKeys.BITME_KEY, config.apiKeys.BITME_SECRET);
    return new BitmeExchange(client, config.tickDelay || 1000, config.pretend);
};


/**
 * Execute a unit of polling.
 */
BitmeExchange.prototype.tick = function() {
    var exchange = this;
    var tickCount = exchange.tickCount++;

    var hasOrders = exchange.getOrders().length > 0;
    if (!hasOrders && tickCount % 5 != 0) {
        // Poll 1/5 as often when there are no orders we're aware of.
        return;
    }

    exchange.client.ordersOpen(function(err, response) {
        // We only care about our orders.
        if (err) return logger.error('Failure during BitmeExchange polling:', err);
        if (exchange.tickCount < tickCount) return logger.warn('Out-of-order tick (%d steps) in BitmeExchange polling, skipping.', exchange.tickCount-tickCount);

        var responseOrders = response.orders.map(toOrder);
        if (exchange.pretend) {
            // Inject our pretend-saved orders.
            responseOrders = responseOrders.concat(exchange.getOrders());
        }

        var trades = order.diffOrders(exchange.getOrders(), responseOrders, /* onlyMissing */ true);
        if (!trades.length) {
            // No new trades.
            return;
        }

        // TODO: Save these to a persistent storage first.
        trades.forEach(function(order) {
            // TODO: Set 'trade' state rather than delete?
            exchange.deleteOrder(order);
            exchange.emit('trade', order);
        });
    });
};


/**
 * Authenticate to the API and start polling loop.
 *
 * @param {function=} callback Function called upon completion.
 */
BitmeExchange.prototype.ready = function(callback) {
    this.debug('Preparing.');
    this.cleanup();

    var exchange = this;
    async.series([
        function authenticate(callback) {
            exchange.debug('Verifying credentials.');
            exchange.client.verifyCredentials(callback);
        },
        function loadOrders(callback) {
            exchange.client.ordersOpen(function(err, response) {
                if (err) {
                    logger.error('Failed to load placed orders:', err);
                    callback && callback.call(exchange, err);
                    return;
                }

                var placedOrders = response.orders.map(toOrder);
                placedOrders.map(exchange.saveOrder.bind(exchange));

                if (placedOrders.length) {
                    exchange.debug('Loaded placed orders:', placedOrders.length);
                }
                callback && callback.call(exchange, err);
            });
        },
        function checkBalance(callback) {
            // We don't really care what the minimums are at this point, we just
            // want to update the internal balance values.
            var minQuantity, minValue;
            exchange.checkBalance(minQuantity, minValue, callback);
        },
        function startPolling(callback) {
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
BitmeExchange.prototype.cleanup = function(callback) {
    if (this.tickLoop) { clearInterval(this.tickLoop); }
    if (this.pendingOrders==0) {
        callback && callback.call(this);
        return;
    }

    this.debug('Cleanup waiting for %d pendingOrders.', this.pendingOrders);

    var exchange = this;
    var cleanupWait = setInterval(function() {
        if (exchange.pendingOrders > 0) return; // Keep waiting
        clearInterval(cleanupWait);
        callback && callback.call(exchange);
    }, 100);
};


/**
 * Check whether there is sufficient balance. Callback with err if not.
 *
 * @param {number=} minQuantity Minimum BTC to expect in balance.
 * @param {number=} minValue Minimum USD to expect in balance.
 * @param {function=} callback Function called upon completion.
 */
BitmeExchange.prototype.checkBalance = function(minQuantity, minValue, callback) {
    var exchange = this;
    exchange.client.accounts(function(err, response) {
        if (err) {
            logger.error('Failed to load balance for Bitme:', err);
            callback(err, response);
            return;
        }

        // Convert returned values to our balance representation params.
        var balance = toBalance(response.accounts);
        exchange.setBalance(balance.quantity, balance.value);

        if (minQuantity && exchange.balance.quantity.lt(minQuantity)) {
            err = new Error('Insufficient BTC balance on Bitme: ' + exchange.balance.quantity.toString());
        } else if (minValue && exchange.balance.value.lt(minValue)) {
            err = new Error('Insufficient USD balance on Bitme: ' + exchange.balance.quantity.toString());
        }

        callback && callback.call(exchange, err, balance);
    });
};


/**
 * Place an instruction of orders for this exchange.
 *
 * @param {Array.<Order>} orders List of orders to place concurrently.
 * @param {function} callback
 */
BitmeExchange.prototype.placeOrders = function(orders, callback) {
    var exchange = this;

    this.requestMap(orders, function(order, callback) {
        if (exchange.pretend) {
            logger.info('[exchange:bitme] Pretend placeOrder:', order.toString());
            exchange.saveOrder(order);
            callback();
            return;
        };

        exchange.pendingOrders++;
        exchange.client.orderCreate('BTCUSD', order.type, order.quantity.toFixed(8), order.rate.toFixed(3), function(err, result) {
            exchange.pendingOrders--;
            if (err) {
                callback(err, result);
                return;
            }
            var newOrder = toOrder(result.order, /* skipExecuted */ true);
            exchange.debug('Placed %s (from: %s)', newOrder.toString(), order.toString());

            if (newOrder.comparedTo(order) !== 0) {
                logger.warn('Original order not equal to placed order: %s != %s', order.toString(), newOrder.toString());
            }

            exchange.saveOrder(newOrder);
            callback(err, newOrder);
        });

    }, callback);
};


/**
 * Cancel orders.
 *
 * @param {Array.<Order>} orders List of orders to cancel concurrently.
 * @param {function} callback
 */
BitmeExchange.prototype.cancelOrders = function(orders, callback) {
    var exchange = this;

    this.requestMap(orders, function(order, callback) {
        if (exchange.pretend) {
            logger.info('[exchange:bitme] Pretend cancelOrder:', order.toString());
            exchange.deleteOrder(order);
            callback();
            return;
        };

        exchange.client.orderCancel(order.id, function(err, result) {
             if (err) {
                callback(err, result);
                return;
             }
             // TODO: Confirm that returned result order is equivalent to input order?
             var newOrder = toOrder(result.order);
             exchange.debug('Cancelled %s (from: %s)', newOrder.toString(), order.toString());
             exchange.deleteOrder(newOrder);
             callback(err, newOrder);
        });

    }, callback);
};


/**
 * Given a Bitme order (as returned by the API), return a corresponding
 * {@code Order} object.
 *
 * @static
 * @param {object} d
 * @param {boolean=} skipExecuted Don't count executed amount.
 * @return {Order}
 */
var toOrder = BitmeExchange.toOrder = function(d, skipExecuted) {
    try{
        var o = new order.Order(d.uuid, d.order_type_cd, d.quantity, d.rate, null, 'bitme');

        if (!skipExecuted) {
            o.quantity = o.quantity.minus(d.executed);
        }
    } catch (e) {
        logger.warn('Failed to convert Bitme order:', d);
        throw e;
    }
    return o;
};


/**
 * Given a Bitme accounts list (as returned by the API), return normalized
 * parameters for {@code BaseExchange.prototype.setBalance}.
 *
 * @static
 * @param {object} accounts
 * @return {{value: string, quantity: string}}
 */
var toBalance = BitmeExchange.toBalance = function(accounts) {
    var args = {};
    accounts.forEach(function(account) {
        var currency = account['currency_cd'];
        var key = {'USD': 'value', 'BTC': 'quantity'}[currency];
        if (!key) return; // Skip unknown currencies.
        args[key] = account['available'];
    });
    return args;
};


// FIXME: This part is unused. We could cut it, or keep it for later.
/**
 * Given a Bitme transaction (as returned by the API), return a corresponding
 * {@code Transaction} object, or undefined if it's not relevant to us.
 *
 * @static
 * @param {object} d
 * @param {Array.<Order>=} placedOrders Orders to compare transactions against.
 * @return {Transaction}
 */
var toTransaction = BitmeExchange.toTransaction = function(t, placedOrders) {
    // FIXME: This part is tricky, will need extra review.

    // "If you have a PENDING DEBIT, you can deduce from that
    // fact that it represents the unexecuted quantity of an
    // open order. If you have a PENDING CREDIT, that means
    // that the execution already occurred and is just waiting
    // to be released by the escrow agent."

    // Discard transactions we don't care about.
    if (t['transaction_category_cd'] != 'ORDER_ESCROW') return;
    if (t['transaction_status_cd'] != 'CLEARED' && t['transaction_status_cd'] != 'PENDING') return;
    if (t['transaction_type_cd'] == 'CREDIT' && t['transaction_status_cd'] != 'PENDING') return;

    var type = {
        'DEBIT': 'ASK',
        'CREDIT': 'BID'
    }[t['transaction_type_cd']];

    var o = {
        'type': type,
        'quantity': t['amount'],
        'timestamp': t['cleared'] || t['created']
    };

    if (t['transaction_status_cd'] == 'PENDING' && placedOrders!==undefined) {
        // Is this transaction in the orderbook?
        for (var i in placedOrders) {
            var order = placedOrders[i];
            if (order.type == o.type && order.quantity.eq(o.quantity)) return;
        }
    }

    return new transaction.Transaction(o.type, o.quantity, o.timestamp);
};
