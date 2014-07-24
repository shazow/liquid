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

    this.orders = {'bids': [], 'asks': []};
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
    var args = ['[exchange:' + this.id + ']'];
    Array.prototype.push.apply(args, arguments);
    logger.debug.apply(null, args);
};


/**
 * Register orders made by us for this exchange. This replaces any current state.
 *
 * @param {Array.<Order>} List of orders for this exchange.
 */
BaseExchange.prototype.loadState = function(orders) {
    var ordersById = {};
    var orders = {'bids': [], 'asks': []};

    orders.forEach(function(order) {
        if (order.id !== null) {
            ordersById[order.id] = order;
        }

        if (order.type == 'BID') {
            orders.bids.push(order);
        } else  if (order.type=='ASK') {
            orders.asks.push(order);
        } else {
            logger.warn("Skipping loading state for order of invalid type: %j (id: %j)", order.type, order.id);
        }
    });

    this.orders = orders;
    this.ordersById = ordersById;
};


BaseExchange.prototype.getOrders = NotImplemented;
BaseExchange.prototype.placeOrders = NotImplemented;
BaseExchange.prototype.clearOrders = NotImplemented;
BaseExchange.prototype.replaceOrders = NotImplemented;
BaseExchange.prototype.watchOrders = NotImplemented;
