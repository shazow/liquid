var Emitter = require('events').EventEmitter;

/**
 * Dummy liquid trading interface for testing.
 */

var DummyExchange = module.exports.DummyExchange = function() {
    this.bids = [];
    this.asks = [];
    this.events = new Emitter();
};


/**
 * Notify callback when trades change.
 */
DummyExchange.prototype.watchTrades = function(fn) {
};


/**
 * Replace all of our placed orders in this exchange with the new set of orders.
 */
DummyExchange.prototype.replaceOrders = function(orders) {
    var bids = [];
    var asks = [];

    if ("bids" in orders) { bids = bids.concat(orders.bids); }
    if ("asks" in orders) { asks = asks.concat(orders.asks); }

    this.bids = bids;
    this.asks = asks;
};


/**
 * Return the orderbook for this exchange.
 */
DummyExchange.prototype.getOrders = function() {
    return {
        'bids': this.bids,
        'asks': this.asks
    }
};
