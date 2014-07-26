var util = require('util'),
    BaseExchange = require('./base.js').BaseExchange,
    logger = require('../logger.js');

/**
 * Dummy liquid trading interface for testing.
 *
 * It should be usable as a fake replacement for both Bitme (origin)
 * and Bitstamp (remote) exchanges.
 */
var DummyExchange = module.exports.DummyExchange = function(id, delay) {
    DummyExchange.super_.call(this);
    this.id = id;

    // We keep a fake count here for testing.
    this.idCounter = 0;

    this.tickDelay = delay;
    this.tickLoop = null;

    // Fake orderbook that we can manipulate.
    this.orderbook = {
        'asks': [],
        'bids': []
    };
};

util.inherits(DummyExchange, BaseExchange);


/**
 * Execute a unit of pretending to do work.
 */
DummyExchange.prototype.tick = function() {
    this.emit('orderbook', this.orderbook);
};


/**
 * Start pretending to do work and emit events.
 */
DummyExchange.prototype.ready = function(callback) {
    this.cleanup();

    if (!this.tickDelay) {
        // Event loop disabled, skip it.
        callback && callback.call(this);
        return;
    }

    this.tickLoop = setInterval(this.tick.bind(this), this.tickDelay);

    callback && callback.call(this);
};


/**
 * Stop pretending to do work.
 */
DummyExchange.prototype.cleanup = function(callback) {
    if (this.tickLoop) { clearInterval(this.tickLoop); }

    callback && callback.call(this);
};


/**
 * Delete and reset order state.
 */
DummyExchange.prototype.clearOrders = function() {
    this.ordersById = {};
};


/**
 * Place an instruction of orders for this exchange.
 */
DummyExchange.prototype.placeOrders = function(orders) {
    var exchange = this;
    orders.forEach(function(order) {
        // Inject ID.
        if (!order.id) order.id = String(++exchange.idCounter);
        exchange.saveOrder(order);
    });
};

/**
* Remove all existing orders and replace with new orders.
 */
DummyExchange.prototype.replaceOrders = function(orders) {
    this.clearOrders();
    this.placeOrders(orders);
};
