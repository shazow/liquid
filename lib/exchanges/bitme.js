var util = require('util'),
    BaseExchange = require('./base.js').BaseExchange,
    async = require('async'),
    Order = require('../order.js').Order,
    diffOrders = require('../order.js').diffOrders,
    logger = require('../logger.js');
    BitmeClient = require('bitme');


/**
 * Liquid trading interface to Bitme.
 *
 * @param {BitmeClient} client
 * @param {number} delay Number of milliseconds to delay between ticks (default: 1000)
 * @param {boolean} pretend Don't execute any trades, just watch.
 */
var BitmeExchange = module.exports.BitmeExchange = function(client, delay, pretend) {
    BitmeExchange.super_.call(this);
    this.id = 'bitme';

    this.client = client;
    this.tickDelay = delay;
    this.tickLoop = null;
    this.tickCount = 0;
    this.pretend = pretend;

    this.openOrdersById = {};
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
    var client = new BitmeClient(config.api_keys.BITME_KEY, config.api_keys.BITME_SECRET);
    return new BitmeExchange(client, config.tickDelay || 1000, config.pretend);
};


/**
 * Execute a unit of polling.
 */
BitmeExchange.prototype.tick = function() {
    var exchange = this;

    var tickCount = exchange.tickCount++;
    exchange.client.ordersOpen(function(err, response) {
        // We only care about our orders.
        if (err) return logger.error('Failure during BitmeExchange polling:', err);
        if (exchange.tickCount < tickCount) return logger.warn('Out-of-order tick (%d steps) in BitmeExchange polling, skipping.', exchange.tickCount-tickCount);

        var responseOrders = response.orders.map(toOrder);
        var trades = diffOrders(exchange.getOrders(), responseOrders);
        if (!trades.length) {
            // No new trades.
            return;
        }

        // TODO: Save these to a persistent storage first.
        trades.forEach(function(order) {
            exchange.saveOrder(order);
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
                placedOrders.map(exchange.saveOrder);
                // XXX: Sync this with persistent storage. Resolve changes.

                exchange.debug('Loaded placed orders:', placedOrders.length);
                callback && callback.call(exchange, err);
            });
        },
        function checkBalance(callback) {
            exchange.checkBalance(callback);
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

    callback && callback.call(this);
};


/**
 * Check whether there is sufficient balance. Callback with err if not.
 *
 * @param {function=} callback Function called upon completion.
 */
BitmeExchange.prototype.checkBalance = function(callback) {
    var exchange = this;
    exchange.client.accounts(function(err, response) {
        if (err) {
            logger.error('Failed to load balance for Bitme:', err);
            callback(err, response);
            return;
        }

        var balance = response.accounts;
        exchange.debug('Loaded balance:', balance);

        // XXX: Fill this in.
        // if (not enough balance) {
        //     err = new Error('Insufficient balance in Bitme account.');
        //  }

        callback && callback.call(exchange, err, balance);
    });
};

/**
 * Given a Bitme order (as returned by the API), return a corresponding
 * {@code Order} object.
 *
 * @static
 * @param {object}
 * @return {Order}
 */
var toOrder = BitmeExchange.toOrder = function(order) {
    var o = new Order(
        order.uuid,
        order.order_type_cd,
        order.quantity,
        order.rate,
        null,
        'bitme');

    o.quantity = o.quantity.minus(order.executed);

    return o;
};
