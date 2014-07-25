var util = require('util'),
    BaseExchange = require('./base.js').BaseExchange,
    async = require('async'),
    Order = require('../order.js').Order,
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
    var client = new BitmeClient(config.BITME_KEY, config.BITME_SECRET);
    return new BitmeExchange(client, config.tickDelay || 1000, config.pretend);
};


/**
 * Execute a unit of polling.
 */
BitmeExchange.prototype.tick = function() {
    var exchange = this;

    // FIXME: Do we need to worry about tick callbacks getting out of sync due to lag?
    var tickCount = exchange.tickCount++;
    this.client.ordersOpen('BTCUSD', function(err, res) {
        if (err) return logger.error('Failure during BitmeExchange polling: %j', err);
        if (exchange.tickCount < tickCount) return logger.warn('Out-of-order tick (%d steps) in BitmeExchange polling, skipping.', exchange.tickCount-tickCount);

        exchange.emit('orderbook', res.orderbook);
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

    // XXX: Load order state.

    var exchange = this;
    var series = [];

    if (!this.pretend) {
        series.push(function authenticate(callback) {
            exchange.debug('Verifying credentials.');
            exchange.client.verifyCredentials(callback);
        })
    }
    series.push(function startPolling(callback) {
        exchange.debug('Starting tick loop.');
        exchange.tickLoop = setInterval(exchange.tick.bind(exchange), exchange.tickDelay);
        callback && callback.call(this);
    });

    async.series(series, callback);
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


/**
 * Given a list of old and new Bitme orders (as returned by the API), return
 * any quantity changes as a list of {@code Order} objects.
 *
 * Will not check for new newOrders, only missing oldOrders.
 *
 * @param {Array.<object>} oldOrders
 * @param {Array.<object>} newOrders
 * @return {Array.<Order>}
 */
var diffOrders = BitmeExchange.diffOrders = function(oldOrders, newOrders) {
    // Index by uuid.
    var newOrderIdx = {};
    newOrders.forEach(function(o) {
        var order = toOrder(o);
        newOrderIdx[order.id] = order;
    });

    var changed = [];

    oldOrders.forEach(function(o) {
        var order = toOrder(o);

        var newOrder = newOrderIdx[order.id];
        if (newOrder === undefined) {
            // Missing.
            changed.push(order);
            return;
        }

        if (!order.quantity.eq(newOrder.quantity)) {
            // Changed.
            changed.push(newOrder.clone({
                'quantity': order.quantity.minus(newOrder.quantity)
            }));
            return;
        }
    });

    return changed;
};
