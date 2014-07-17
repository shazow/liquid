var BigNumber = require('bignumber.js'); 


/**
 * Model object representing an Order.
 *
 * Similar to types defined here: https://bitme.github.io/#js-orders
 *
 * @param {string} id Global unique identifier for this order, usually provided
 *     by the exchange inwhich the order lives.
 * @param {string} type One of 'BID' or 'ASK'.
 * @param {string|BigNumber} quantity Quantity of order (e.g. number of BTC).
 * @param {string|BigNumber} rate Price per unit (e.g. number of USD).
 */

var Order = module.exports.Order = function(id, type, quantity, rate, state) {
    this.id = id;
    this.type = type;
    this.quantity = BigNumber(quantity);
    this.rate = BigNumber(rate);
    this.state = state;
};


/**
 * Return a copy of the Order object but with with some properties overridden.
 *
 * @param {Object} override Object containing properties to override in the clone.
 * @return A new Order object.
 */
Order.prototype.clone = function(override) {
    var o = {
        'id': this.id,
        'type': this.type,
        'quantity': this.quantity,
        'rate': this.rate,
        'state': this.state
    };

    for (var key in override) {
        o[key] = override[key];
    }

    return new Order(o.id, o.type, o.quantity, o.rate, o.state);
}
