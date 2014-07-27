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
    if (quantity===undefined || rate===undefined) {
        throw new Error('Order must have a defined quantity and rate.');
    };

    this.id = id;
    this.type = type;
    this.quantity = BigNumber(quantity);
    this.rate = BigNumber(rate);
    this.state = state;
    this.exchange = exchange;
};


/**
 * Return a plain object representing this Order. Used for testing.
 * @return {object}
 */
Order.prototype.toObject = function() {
    return {
        'id': this.id,
        'type': this.type,
        'quantity': this.quantity.toFixed(),
        'rate': this.rate.toFixed(),
        'state': this.state,
        'exchange': this.exchange
    }
};


/**
 * Return a copy of the Order object but with with some properties overridden.
 *
 * The id, state, and exchange will not be copied.
 *
 * @param {object} override Object containing properties to override in the clone.
 * @param {number=} premium Price multiplier to apply on rate, inverted by type.
 * @param {boolean=} invertType If true, the type will be inverted pre-override.
 * @return {Order} A new Order object.
 */
Order.prototype.clone = function(override, premium, invertType) {
    var o = {
        'id': null,
        'type': this.type,
        'quantity': this.quantity,
        'rate': this.rate
    };

    if (invertType) {
        otype = o.type == 'BID' ? 'ASK' : 'BID';
    }

    for (var key in override) {
        o[key] = override[key];
    }

    var newOrder = new Order(o.id, o.type, o.quantity, o.rate, o.state, o.exchange);
    newOrder.rate = newOrder.getPremiumRate(premium);
    return newOrder;
};


/**
 * @param {number=} premium Price multiplier to apply on rate, inverted by type.
 * @return {BigNumber} Rate with premium applied.
 */
Order.prototype.getPremiumRate = function(premium) {
    if (premium==undefined) {
        return this.rate;
    }
    if (this.type == 'ASK') {
        return this.rate.times(premium);
    }
    if (this.type == 'BID') {
        return this.rate.dividedBy(premium);
    }
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


/**
* Combine sorted orders (by rate, per type) into a subset of total value being
* at least minValue (including premium). Discard any remaining orders.
*
* @param {Array.<Order>} orders Orders to aggregate.
* @param {number=} minValue Minimum {@code rate*quantity} value of returned orders.
* @param {number=} premium Premium to apply to aggregated orders.
* @return {Array.<Order>} Aggregated orders representing a subset of input orders with premium applied.
*/
var aggregateOrders = module.exports.aggregateOrders = function(orders, minValue, premium) {
    var aggregated = {
        'ASK': {
            orders: [],
            value: BigNumber(0),
            quantity: BigNumber(0)
        },
        'BID': {
            orders: [],
            value: BigNumber(0),
            quantity: BigNumber(0)
        }
    };

    orders.forEach(function(order) {
        var rate = order.getPremiumRate(premium);
        var agg = aggregated[order.type];

        agg.value = agg.value.plus(rate.times(order.quantity));
        agg.quantity = agg.quantity.plus(order.quantity);

        if (agg.value < minValue) {
            // Keep accumulating.
            return;
        }

        agg.orders.push(new Order(null, order.type, agg.quantity, agg.value.dividedBy(agg.quantity)));
        agg.value = BigNumber(0);
        agg.quantity = BigNumber(0);
    });

    return aggregated['ASK'].orders.concat(aggregated['BID'].orders);
};


/**
* Get order instructions to keep our origin exchange in sync with the remote
* exchange, taking into account already-placed orders.
*
* @param {{Object.<string, Order>}} originPlacedOrders -
*        Orders the remote exchange has already placed.
* @param {{bids: Array.<Order>, asks: Array.<Order>}} remoteOrderbook -
*        orderbook for a remote exchange (might not have ids).
* @param {number} premium Price multiplier.
* @return {Array.<Order>} Orders to execute on the origin exchange.
*/
var originSync = module.exports.originSync = function(originPlacedOrders, remoteOrderbook, premium) {
    // XXX: Fill this in.
};
