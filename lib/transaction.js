// NOTE: This module is currently unused, but may be useful later.
var BigNumber = require('bignumber.js');

var order = require('./order.js');


/**
 * Model object representing a Transaction. Basically a subset instruction of
 * an Order.
 *
 * This is intentionally vague, only used to match transactions we missed
 * during downtime.
 *
 * @param {string} type One of 'BID' or 'ASK'.
 * @param {string|BigNumber} quantity Quantity of order (number of BTC).
 * @param {Date} timestamp
 */
var Transaction = module.exports.Transaction = function(type, quantity, timestamp) {
    if (type !== 'BID' && type !== 'ASK') {
        throw new Error('Transaction type must be one of "BID" or "ASK", not "'+ type +'"');
    }
    this.type = type;
    this.quantity = BigNumber(quantity);
    this.timestamp = new Date(timestamp);
};


/**
 * Compare transaction to another transaction or order. Only considers type and
 * quantity.
 */
Transaction.prototype.comparedTo = function(other) {
    var cmp = this.quantity.comparedTo(other.quantity);
    if (cmp == 0 && this.type !== other.type) cmp = this.type === 'ASK' ? 1 : -1;
    return cmp;
};


/**
 * Convert transaction to an order that will be filled by the given spread.
 *
 * @param {object} spread Market spread as returned by getSpread.
 * @param {boolean=} invertType Invert transaction type for order (BID <-> ASK).
 * @return {Order}
 */
Transaction.prototype.toOrder = function(spread, invertType) {
    var o = {
        'id': null,
        'type': this.type,
        'quantity': this.quantity,
    };

    if (invertType===true) {
        o.type = o.type == 'BID' ? 'ASK' : 'BID';
    }

    // FIXME: Technically just looking at the best spread rate is not sufficient
    // to guarantee that we'll be able to fill the entire quantity of this order.
    // We'd need to look at the aggregated spread up to some desired quantity to
    // do this correctly. Probably not super high priority, though.
    var rate = spread[o.type.toLowerCase()];
    if (rate===null) {
        throw new Error('Incomplete spread, can\'t determine order rate for transaction.');
    }

    return new order.Order(o.id, o.type, o.quantity, rate);
};

