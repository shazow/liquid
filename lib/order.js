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
        throw new Error('Order type must be one of "BID" or "ASK".');
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
}
