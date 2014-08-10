var BigNumber = require('bignumber.js'),
    util = require('util'),
    abs = Math.abs;

var logger = require('./logger.js');


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


Order.prototype.toString = function() {
    return util.format('[Order #%s: %s %s @ $%s]', this.id, this.type, this.quantity.toFixed(), this.rate.toFixed(2));
};


Order.prototype.comparedTo = function(other) {
    var cmp = this.rate.comparedTo(other.rate);
    if (cmp == 0) cmp = this.quantity.comparedTo(other.quantity);
    if (cmp == 0 && this.type !== other.type) cmp = this.type === 'ASK' ? 1 : -1;
    return cmp;
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

    if (invertType===true) {
        o.type = o.type == 'BID' ? 'ASK' : 'BID';
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
 * Return the total value of this order (race * quantity).
 * @return {BigNumber} Order value.
 */
Order.prototype.getValue = function() {
    return this.rate.times(this.quantity);
};


/** Helpers: */

/**
 * Given a list of old and new orders, return any quantity changes as a list of
 * {@code Order} objects.
 *
 * Will not check for new newOrders, only missing oldOrders.
 *
 * @param {Array.<Order>} oldOrders
 * @param {Array.<Order>} newOrders
 * @param {boolean} Only report missing orders, not new orders.
 * @return {Array.<Order>}
 */
var diffOrders = module.exports.diffOrders = function(oldOrders, newOrders, onlyMissing) {
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

        if (onlyMissing) {
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
* Combine sorted orders (by spread from the mean price) into a subset of total
* value being at least minValue (including premium). Discard any remaining
* orders.
*
* @param {Array.<Order>} orders Orders to aggregate.
* @param {number=} minValue Minimum {@code rate*quantity} value of returned orders.
* @param {number=} premium Premium to apply to aggregated orders.
* @param {number=} maxOrders Maximum number of orders to return.
* @return {Array.<Order>} Sorted aggregated orders representing a subset of input orders with premium applied.
*/
var aggregateOrders = module.exports.aggregateOrders = function(orders, minValue, premium, maxOrders) {
    var aggregated = {
        'ASK': {
            value: BigNumber(0),
            quantity: BigNumber(0)
        },
        'BID': {
            value: BigNumber(0),
            quantity: BigNumber(0)
        }
    };

    var r = [];

    orders.every(function(order, i) {
        if (i > maxOrders) {
            // Reached maxOrders, stop.
            return false;
        }
        var rate = order.getPremiumRate(premium);
        var agg = aggregated[order.type];

        agg.value = agg.value.plus(rate.times(order.quantity));
        agg.quantity = agg.quantity.plus(order.quantity);

        if (agg.value < minValue) {
            // Haven't reached minValue, keep accumulating.
            return true;
        }

        r.push(new Order(null, order.type, agg.quantity, agg.value.dividedBy(agg.quantity)));
        agg.value = BigNumber(0);
        agg.quantity = BigNumber(0);
        return true;
    });

    return r;
};


/**
 * Given a sorted list of orders destined for the origin exchange, return a
 * subset of orders which fit within our budget.
 *
 * @param {Array.<Order>} orders
 * @param {{quantity: BigNumber, value: BigNumber}} budget
 * @param {number=} premium
 * @return {Array.<Order>}
 */
var budgetOrders = module.exports.budgetOrders = function(orders, budget, premium) {
    if (budget===undefined) return orders;

    var totals = {
        'ASK': {
            value: BigNumber(0),
            quantity: BigNumber(0)
        },
        'BID': {
            value: BigNumber(0),
            quantity: BigNumber(0)
        }
    };

    var r = [];

    orders.forEach(function(order, i) {
        var t = totals[order.type];
        var b = budget[order.type];
        var value = t.value.plus(order.getValue());
        var quantity = t.quantity.plus(order.quantity);

        if (value.gt(b.value) || quantity.gt(b.quantity)) {
            // TODO: Add support for partial orders here?
            return;
        }

        t.value = value;
        t.quantity = quantity;
        r.push(order);
    });

    return r;
};


/**
 * Given a list of placed orders and a list of desired orders, return
 * instructions for modifying the placed orders such that it matches the
 * desires orders, without regard to the order id.
 *
 * Will re-order the given parameters.
 *
 * @param {Array.<Order>} placedOrders Currently placed orders.
 * @param {Array.<Order>} newOrders New desired state of placedOrders.
 * @return {{cancel: Array.<Order>, place: Array.<Order>}}
 */
var patchOrders = module.exports.patchOrders = function(placedOrders, newOrders) {
    // TODO: Add tolerance value to skip replacing orders that only changed slightly?
    // TODO: This is not the most efficient implementation, could do a better job if it matters.
    sortOrders(placedOrders);
    sortOrders(newOrders);

    var patch = {
        'cancel': [],
        'place': []
    };

    var p = 0, n = 0;
    while (true) {
        if (p >= placedOrders.length) {
            // The rest must be new.
            patch.place = patch.place.concat(newOrders.slice(n));
            break;
        }
        if (n >= newOrders.length) {
            // The rest must be old.
            patch.cancel = patch.cancel.concat(placedOrders.slice(p));
            break;
        }

        var placedOrder = placedOrders[p], newOrder = newOrders[n];
        var cmp = placedOrder.comparedTo(newOrder);

        if (cmp < 0) {
            // placedOrder is smaller, cancel it and continue.
            p++;
            patch.cancel.push(placedOrder);
            continue
        } else if (cmp > 0) {
            // newOrder is smaller, place it and continue.
            n++;
            patch.place.push(newOrder);
            continue;
        }

        // Same order, skip.
        p++;
        n++;
    }

    return patch;
};


/**
 * Sort orders by (spread from mean, rate, quantity, type).
 *
 * If meanRate is not given, then it's treated as 0, so orders will be sorted
 * by rate ascending.
 */
var sortOrders = module.exports.sortOrders = function(orders, meanRate) {
    if (meanRate === undefined) meanRate = 0;
    return orders.sort(function(a, b) {
        var cmp = abs(meanRate-a.rate) - abs(meanRate-b.rate);
        if (cmp == 0) cmp = a.comparedTo(b);
        return cmp;
    });
};


/**
 * Given a list of orders, return the combined value of all the asks and bids.
 *
 * Rounded to a Number, not precise.
 *
 * @param {Array.<Order>}
 * @return {{asks: number, bids: number}}
 */
var totalValue = module.exports.totalValue = function(orders) {
    var r = {
        'ASK': BigNumber(0),
        'BID': BigNumber(0)
    };
    orders.forEach(function(o) {
        r[o.type] = r[o.type].plus(o.quantity.times(o.rate));
    });
    return {
        'asks': r['ASK'].toNumber(),
        'bids': r['BID'].toNumber()
    };
};


/**
 * Given a list of orders, return the spread calculations.
 *
 * @param {Array.<Order>} orders
 * return {object}
 */
var getSpread = module.exports.getSpread = function(orders) {
    var rates = {'ASK': [], 'BID': []};

    var totalQuantity = BigNumber(0);
    var totalValue = BigNumber(0);
    orders.forEach(function(o) {
        totalQuantity = totalQuantity.plus(o.quantity);
        totalValue = totalValue.plus(o.quantity.times(o.rate));
        rates[o.type].push(o.rate);
    });

    var bid = Math.max.apply(null, rates['BID']);
    var ask = Math.min.apply(null, rates['ASK']);
    var amount, percent, mean;

    if (bid === -Infinity) {
        bid = null;
        mean = ask;
    } else if (ask === Infinity) {
        ask = null;
        mean = bid;
    } else {
        amount = ask - bid;
        percent = (amount / ask) * 100.0;
        mean = (bid + ask) / 2.0;
    }

    if (ask === bid === null) {
        mean = undefined;
    }

    return {
        bid: bid,
        ask: ask,
        numBids: rates['BID'].length,
        numAsks: rates['ASK'].length,
        amount: amount,
        percent: percent,
        mean: mean,
        totalQuantity: totalQuantity.toNumber(),
        totalValue: totalValue.toNumber()
    }
};


/**
 * Given exchange balances, return a budget to be used with aggregateOrders.
 *
 * @param {object} originBalance
 * @param {object} remoteBalance
 * @param {number} premium
 * @return {{quantity: BigNumber, value: BigNumber}}
 */
var getBudget = module.exports.getBudget = function(originBalance, remoteBalance, premium) {
    if (premium===undefined) premium = 1.0;

    var budget = {
        'ASK': {
            // Remote: I want to sell 1 BTC @ $1000 ->
            // Origin: I want to sell 1 BTC @ $2000 ->
            // Remote: I want to buy 1 BTC @ $1000 ->
            // Effective rate is x2, but we're not buying with value so we don't care.
            value: BigNumber(remoteBalance.value),
            quantity: BigNumber(originBalance.quantity)
        },
        'BID': {
            // Remote: I want to buy 1 BTC @ $1000 -> 
            // Origin: I want to buy 1 BTC @ $500 ->
            // Remote: I want to sell 1 BTC @ $1000 ->
            // Effective rate is x2, which doubles our potential value budget for origin sales.
            value: BigNumber(originBalance.value).times(premium),
            quantity: BigNumber(remoteBalance.quantity)
        }
    };

    return budget;
};
