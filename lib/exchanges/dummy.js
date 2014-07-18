var Emitter = require('events').EventEmitter,
    util = require('util'),
    BaseExchange = require('./base.js').BaseExchange;

/**
 * Dummy liquid trading interface for testing.
 */

var DummyExchange = module.exports.DummyExchange = function() {
    DummyExchange.super_.call(this);
};

util.inherits(DummyExchange, BaseExchange);


DummyExchange.prototype.clearOrders = function() {
    this.orders = {'asks': [], 'bids': []};
    this.ordersById = {};
};

/**
 * Place an instruction of orders for this exchange.
 */
DummyExchange.prototype.placeOrders = function(orders) {
    if ('bids' in orders) { this.orders.bids = this.orders.bids.concat(orders.bids); }
    if ('asks' in orders) { this.orders.asks = this.orders.asks.concat(orders.asks); }
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
 */
DummyExchange.prototype.getOrders = function() {
    return this.orders;
};
