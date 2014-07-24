var util = require('util'),
    BaseExchange = require('./base.js').BaseExchange,
    logger = require('../logger.js');

/**
 * Dummy liquid trading interface for testing.
 *
 * It should be usable as a fake replacement for both Bitme (origin)
 * and Bitstamp (remote) exchanges.
 */
var DummyExchange = module.exports.DummyExchange = function(id, delay) {
    DummyExchange.super_.call(this);
    this.id = id;

    // We keep a fake count here for testing.
    this.idCounter = 0;

    this.tickDelay = delay;
    this.tickLoop = null;
};

util.inherits(DummyExchange, BaseExchange);


/**
 * Execute a unit of pretending to do work.
 */
DummyExchange.prototype.tick = function() {
    this.debug('Tick.');
    this.emit('orderbook', this.orders);
};


/**
 * Start pretending to do work and emit events.
 */
DummyExchange.prototype.ready = function(callback) {
    this.cleanup();

    if (!this.tickDelay) {
        // Event loop disabled, skip it.
        callback && callback.call(this);
        return;
    }

    this.tickLoop = setInterval(this.tick.bind(this), this.tickDelay);
};


/**
 * Stop pretending to do work.
 */
DummyExchange.prototype.cleanup = function(callback) {
    if (this.tickLoop) { clearInterval(this.tickLoop); }

    callback && callback.call(this);
};


/**
 * Helper for merging orders into an array (list of bids or asks).
 */
DummyExchange.prototype.mergeOrders = function(src, dst) {
    if (src === undefined) return;

    src.forEach(function(order) {
        if (!order.id) order.id = String(++this.idCounter);

        if (order.id in this.ordersById) {
            console.log("Warning: Duplicate order detected, skipping: " + order.id);
            return;
        }
        this.ordersById[order.id] = order;
        dst.push(order);
    }.bind(this));
}

/**
 * Delete and reset order state.
 */
DummyExchange.prototype.clearOrders = function() {
    this.orders = {'asks': [], 'bids': []};
    this.ordersById = {};
};

/**
 * Place an instruction of orders for this exchange.
 */
DummyExchange.prototype.placeOrders = function(orders) {
    this.mergeOrders(orders.bids, this.orders.bids);
    this.mergeOrders(orders.asks, this.orders.asks);
};

/**
* Remove all existing orders and replace with new orders.
 */
DummyExchange.prototype.replaceOrders = function(orders) {
    this.clearOrders();
    this.placeOrders(orders);
};

/**
 * Return our orders for this exchange.
 *
 * FIXME: Is this the correct API? Should it be a callback? Or something else?
 */
DummyExchange.prototype.getOrders = function() {
    return this.orders;
};
