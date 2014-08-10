var util = require('util'),
    events = require('events'),
    BigNumber = require('bignumber.js');

var logger = require('../logger.js');


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
 *
 * @param {boolean} pretend Don't save trades to persistent storage.
 */
var BaseExchange = module.exports.BaseExchange = function(pretend) {
    // Override this when inheriting.
    this.id = undefined;

    BaseExchange.super_.call(this);

    this.ordersById = {};
    this.pretend = pretend;
    this.lastTransactions = [];

    this.balance = {
        quantity: BigNumber(0),
        value: BigNumber(0)
    }

    // Pretend counter for fake orders.
    var pretendCounter = 0;
    this.nextPretendId = function() {
        return this.id + ':pretend:' + String(pretendCounter++);
    };
};

util.inherits(BaseExchange, events.EventEmitter);


BaseExchange.prototype.toObject = function() {
    return {
        'placedOrders': this.getOrders().map(String),
        'balance': {
            quantity: this.balance.quantity.toNumber(),
            value: this.balance.value.toNumber()
        }
    };
};


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
 * Update the balance of this exchange.
 *
 * @param {number|string} quantity Number of Bitcoins available to trade.
 * @param {number|string} value Value available to trade (fiat currency) 
 * @return {object} New balance.
 */
BaseExchange.prototype.setBalance = function(quantity, value) {
    var balance = this.balance = {
        quantity: BigNumber(quantity),
        value: BigNumber(value)
    }

    this.debug('Set balance:', {
        quantity: balance.quantity.toNumber(),
        value: balance.value.toNumber()
    });

    return balance;
};


/**
 * Save a placed order in our internal storage.
 *
 * @param {Order}
 */
BaseExchange.prototype.saveOrder = function(order) {
    if (order.id === null) {
        if (!this.pretend) {
            logger.error("Tried to place an order without an id, skipping:", order.toString());
            return;
        }
        order.id = this.nextPretendId();
    }
    if (order.id in this.ordersById) {
        logger.warn("Duplicate order detected, replacing:", order.toString());
    }
    this.ordersById[order.id] = order;

    // Deduct from balance.
    if (order.type == 'ASK') {
        this.balance.quantity = this.balance.quantity.minus(order.quantity);
    } else {
        this.balance.value = this.balance.value.minus(order.getValue());
    }

    return order;
};


/**
 * Delete a placed order from our internal storage.
 *
 * @param {Order}
 */
BaseExchange.prototype.deleteOrder = function(order) {
    if (order.id === null) {
        logger.error("Tried to delete an order without an id, skipping:", order.toString());
        return;
    }
    delete this.ordersById[order.id];

    // Add to balance.
    if (order.type == 'ASK') {
        this.balance.quantity = this.balance.quantity.plus(order.quantity);
    } else {
        this.balance.value = this.balance.value.plus(order.getValue());
    }

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


/**
 * Load transactions that were performed until now.
 *
 * @param {Array.<Transaction>} transactions
 */
BaseExchange.prototype.setTransactions = function(transactions) {
    this.lastTransactions = transactions;
};
