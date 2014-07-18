var util = require('util');


var NotImplemented = function() { throw new Error("Not implemented."); }


/**
 * Base class with an interface to implement for a trading exchange.
 */

var BaseExchange = module.exports.BaseExchange = function() {
    this.orders = {'bids': [], 'asks': []};
    this.ordersById = {};
};

BaseExchange.prototype.loadState = function(orders) {
    var ordersById = {};
    orders.forEach(function(order) {
        ordersById[order.id] = order;
    });

    this.orders = orders;
    this.ordersById = ordersById;
};

BaseExchange.prototype.getOrders = NotImplemented;
BaseExchange.prototype.placeOrders = NotImplemented;
BaseExchange.prototype.clearOrders = NotImplemented;
BaseExchange.prototype.replaceOrders = NotImplemented;
BaseExchange.prototype.watchOrders = NotImplemented;
