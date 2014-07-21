var util = require('util'),
    BaseExchange = require('./base.js').BaseExchange;

/**
 * Dummy liquid trading interface for testing.
 *
 * It should be usable as a fake replacement for both Bitme (origin)
 * and Bitstamp (remote) exchanges.
 */
var DummyExchange = module.exports.DummyExchange = function() {
    DummyExchange.super_.call(this);

    // We keep a fake count here for testing.
    this.idCounter = 0;
};

util.inherits(DummyExchange, BaseExchange);


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
