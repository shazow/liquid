var BigNumber = require('bignumber.js'); 


/**
 * Model object representing an Order.
 *
 * Similar to types defined here: https://bitme.github.io/#js-orders
 *
 * @param {string|null} id  Global unique identifier for this order, usually
 *     provided by the exchange inwhich the order lives. If {@code null} then it
 *     should be filled in later.
 * @param {string} type One of 'BID' or 'ASK'.
 * @param {string|BigNumber} quantity Quantity of order (e.g. number of BTC).
 * @param {string|BigNumber} rate Price per unit (e.g. number of USD).
 * @param {string=} state Indicate if the order is in a transition state, such as
 *     in the process of being fulfilled.
 * @param {string=} exchange Where this order currently lives, if anywhere.
 */

var Order = module.exports.Order = function(id, type, quantity, rate, state, exchange) {
    if (id === undefined) {
        throw new Error('Order id must be defined.');
    }
    if (type !== 'BID' && type !== 'ASK') {
        throw new Error('Order type must be one of "BID" or "ASK", not "'+ type +'"');
    }

    this.id = id;
    this.type = type;
    this.quantity = BigNumber(quantity);
    this.rate = BigNumber(rate);
    this.state = state;
    this.exchange = exchange;
};


/**
 * Return a copy of the Order object but with with some properties overridden.
 *
 * @param {object} override Object containing properties to override in the clone.
 * @return {Order} A new Order object.
 */
Order.prototype.clone = function(override) {
    var o = {
        'id': this.id,
        'type': this.type,
        'quantity': this.quantity,
        'rate': this.rate,
        'state': this.state,
        'exchange': this.exchange
    };

    for (var key in override) {
        o[key] = override[key];
    }

    return new Order(o.id, o.type, o.quantity, o.rate, o.state, o.exchange);
};


/**
 * Return a copy of the Order object but with the type swapped, premium applied
 * to the price, and the exchange/id nullified.
 *
 * @param {number=} premium Price multiplier inversed by the Order type.
 * @return {Order} A new Order object.
 */
Order.prototype.exchange = function(premium) {
    if (premium === undefined) premium = 1.0;

    var type, rate;
    if (order.type === 'BID') {
        type = 'ASK';
        rate = order.rate.times(premium);
    } else {
        type = 'BID';
        rate = order.rate.dividedBy(premium);
    }

    return order.clone({
        'id': null,
        'type': type,
        'rate': rate,
        'exchange': null
    });
};


/**
 * Given a list of old and new orders, return any quantity changes as a list of
 * {@code Order} objects.
 *
 * Will not check for new newOrders, only missing oldOrders.
 *
 * @param {Array.<Order>} oldOrders
 * @param {Array.<Order>} newOrders
 * @return {Array.<Order>}
 */
var diffOrders = module.exports.diffOrders = function(oldOrders, newOrders) {
    var newOrderIdx = {};
    newOrders.forEach(function(order) {
        newOrderIdx[order.id] = order;
    });

    var changed = [];

    oldOrders.forEach(function(order) {
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
