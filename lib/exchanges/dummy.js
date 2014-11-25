var util = require('util');

var order = require('../order.js'),
    logger = require('../logger.js'),
    BaseExchange = require('./base.js').BaseExchange;


/**
 * Dummy liquid trading interface for testing.
 *
 * It should be usable as a fake replacement for both Bitme (origin)
 * and Bitstamp (remote) exchanges.
 */
var DummyExchange = module.exports.DummyExchange = function(id, delay, behavior) {
    var pretend = false;
    DummyExchange.super_.call(this, pretend, delay);

    // We keep a fake count here for testing.
    this.idCounter = 0;

    // Fake orderbook that we can manipulate.
    this.orderbook = [];
    this.behavior = behavior;
    this.setBalance(Infinity, Infinity);
};

util.inherits(DummyExchange, BaseExchange);


DummyExchange.id = 'dummy';
DummyExchange.forcePretend = true;

/**
 * Setup reasonable defaults for a DummyExchange based on configuration.
 *
 * @static
 * @param {object} config
 * @param {string} role One of 'origin' or 'remote'.
 * @return {BitmeExchange}
 */
DummyExchange.fromConfig = function(config, role) {
    var id = 'dummy:' + role;
    var tickDelay = 1000;
    var behavior = {
        'origin': behaviors.randomOrigin,
        'remote': behaviors.randomRemote
    }[role];

    var exchange = new DummyExchange(id, tickDelay, behavior);

    if (role==='remote') {
        // Add something to the orderbook to avoid volatility skip debug messages.
        exchange.orderbook.push(new order.Order('DUMMY1234', 'BID', '1', '500'));
    }

    return exchange;
};


/**
 * Execute a unit of pretending to do work.
 */
DummyExchange.prototype.tick = function() {
    this.behavior && this.behavior(this);
    this.emit('orderbook', this.orderbook);
    this.requestLock.release();
};


/**
 * Delete and reset order state.
 */
DummyExchange.prototype.clearOrders = function(callback) {
    this.ordersById = {};

    callback && callback.call(this);
};


/**
 * Cancel orders.
 */
DummyExchange.prototype.cancelOrders = function(orders, callback) {
    var exchange = this;
    orders.forEach(function(order) {
        exchange.deleteOrder(order);
        exchange.debug('Cancelled %s', order.toString());
    });
    callback && callback.call(this);
};


/**
 * Place an instruction of orders for this exchange.
 */
DummyExchange.prototype.placeOrders = function(orders, callback) {
    var exchange = this;
    orders.forEach(function(order) {
        // Inject ID.
        if (!order.id) order.id = String(++exchange.idCounter);
        exchange.saveOrder(order);
        exchange.debug('Placed %s', order.toString());
    });
    callback && callback.call(this);
};


/**
 * Collections of behaviors to pretend-run against.
 *
 * Mostly for our amusement.
 */
var behaviors = module.exports.behaviors = {
    randomRemote: function(exchange) {
        var meanOrder = new order.Order(null, 'ASK', '1', '500');

        // Add, remove, change orders randomly.
        var book = ['asks', 'bids'][(Math.random() > 0.5)+0];
        var orders = exchange.orderbook[book] || [];
        var roll = Math.random();
        if (orders.length==0 || roll < 0.3) {
            // Add
            var id = 'gen:' + String(++exchange.idCounter);
            var quantity = Math.random().toFixed(3);
            var premium = (1.0 + Math.random() * 0.1).toFixed(3);
            var newOrder = meanOrder.clone({'id': id, 'quantity': quantity}, premium, book == 'bids');
            orders.push(newOrder);
            logger.debug('{randomRemote} Added: %s', newOrder.toString());

        } else if (roll < 0.6) {
            // Remove
            var oldOrder = orders.pop();

            logger.debug('{randomRemote} Removed: %s', oldOrder.toString());
        } else {
            // Change (halve)
            var oldOrder = orders.pop();
            var mult = Math.random().toFixed(1);
            mult = 0.1;
            var newOrder = oldOrder.clone({'id': oldOrder.id, 'quantity': oldOrder.quantity.times(mult)});

            if (newOrder.quantity > 0) orders.push(newOrder);

            logger.debug('{randomRemote} Changed: %s -> %s', oldOrder.toString(), newOrder.toString());
        }

        // Complete order match sometimes.
        for(var id in exchange.ordersById) {
            if (Math.random() < 0.2) {
                exchange.emit('trade', exchange.ordersById[id]);
                delete exchange.ordersById[id];
            }
        }
    },
    randomOrigin: function(exchange) {
        // Rarely pop a placed order, but more often when the placedOrders start
        // to fill up.
        for(var id in exchange.ordersById) {
            if (Math.random() < 0.1) {
                exchange.emit('trade', exchange.ordersById[id]);
                delete exchange.ordersById[id];
            }
        }

    }
};
