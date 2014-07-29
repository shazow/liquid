var util = require('util'),
    events = require('events'),
    logger = require('../logger.js');


/**
 * Placeholder for unimplemented abstract class methods.
 */
var NotImplemented = function() { throw new Error("Not implemented."); }


/**
 * Base class with an interface to implement for a trading exchange.
 *
 * Emits the following events:
 * - "trade" when an owned order is changed.
 * - "orderbook" when the orderbook for the exchange is changed.
 */
var BaseExchange = module.exports.BaseExchange = function() {
    BaseExchange.super_.call(this);

    this.ordersById = {};
};

util.inherits(BaseExchange, events.EventEmitter);


/**
 * String identifier of the exchange. Used as a prefix for order ids.
 */
BaseExchange.id;


/**
 * Perform any necessary authentication and start event loops.
 *
 * @param {function} callback Function called upon completion.
 */
BaseExchange.prototype.ready = function(callback) {
    callback && callback.call(this);
};


/**
 * Clean up the bot into a shutdown-friendly state, such as clearing any event
 * loops.
 *
 * @param {function} callback Function called upon completion.
 */
BaseExchange.prototype.cleanup = function(callback) {
    callback && callback.call(this);
};


/**
 * Arguments passed to {@code logger.debug} but prefixed with exchange info.
 */
BaseExchange.prototype.debug = function() {
    var args = [];
    Array.prototype.push.apply(args, arguments);
    args[0] = '[exchange:' + this.id + '] ' + args[0];
    logger.debug.apply(null, args);
};


/**
 * Register orders made by us for this exchange. This replaces any current state.
 *
 * @param {Array.<Order>} List of orders for this exchange.
 */
BaseExchange.prototype.loadState = function(orders) {
    orders.map(this.saveOrder);
};


/**
 * Save a placed order in our internal storage.
 *
 * @param {Order}
 */
BaseExchange.prototype.saveOrder = function(order) {
    if (order.id === null) {
        logger.error("Tried to place an order without an id, skipping: ", order);
        return;
    }
    if (order.id in this.ordersById) {
        logger.warn("Duplicate order detected, replacing: ", order);
    }
    this.ordersById[order.id] = order;
    return order;
};


/**
 * Delete a placed order from our internal storage.
 *
 * @param {Order}
 */
BaseExchange.prototype.deleteOrder = function(order) {
    if (order.id === null) {
        logger.error("Tried to delete an order without an id, skipping: ", order);
        return;
    }
    delete this.ordersById[order.id];
    return order;
};


/**
 * Get a list of placed orders that we're aware of.
 *
 * @return {Array.<Order>}
 */
BaseExchange.prototype.getOrders = function() {
    var orders = [];
    for (var key in this.ordersById) {
        orders.push(this.ordersById[key]);
    };
    return orders;
};


BaseExchange.prototype.placeOrders = NotImplemented;
BaseExchange.prototype.clearOrders = NotImplemented;
BaseExchange.prototype.replaceOrders = NotImplemented;
BaseExchange.prototype.watchOrders = NotImplemented;
