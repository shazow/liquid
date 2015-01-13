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
 * @param {number} delay Number of milliseconds to delay between ticks (default: 1000)
 */
var BaseExchange = module.exports.BaseExchange = function(pretend, delay) {
    BaseExchange.super_.call(this);

    this.id = this.constructor.id;
    this.ordersById = {};
    this.pretend = pretend;
    this.lastTransactions = [];
    this.requestLock = new Resource();

    this.balance = {
        quantity: BigNumber(0),
        value: BigNumber(0)
    }

    // Pretend counter for fake orders.
    var pretendCounter = 0;
    this.nextPretendId = function() {
        return this.id + ':pretend:' + String(pretendCounter++);
    };

    if (this.tick && delay) {
        this.ticker = this.createTicker(this.tick.bind(this), this.id, delay);
    }
};

util.inherits(BaseExchange, events.EventEmitter);

// Override this when inheriting.
BaseExchange.id = undefined;

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
 * Construct a Ticker for the current exchange context.
 *
 * @param {function} fn Function to tick (usually this.tick).
 * @param {string} name Label for ticker (usually class name).
 * @return {Ticker}
 */
BaseExchange.prototype.createTicker = function(fn, name, delay) {
    var exchange = this;
    var ticker = new Ticker(fn, delay, this.requestLock);

    ticker.on('stuck', function(t) {
        logger.alert("%s stopped ticking", name, {
            tickCount: t.count,
            tickCompleted: t.completed,
            pendingCallbacks: t.resource.callbacks.length,
            pendingRequests: t.resource.using(),
            placedOrders: exchange.getOrders().map(String)
        });
    });

    ticker.on('resume', function(t) {
        logger.info("%s resumed ticking after %d skipped ticks.", name, t.skipStreak);
    });

    return ticker;
};


/**
 * Perform any necessary authentication and start event loops.
 *
 * @param {function} callback Function called upon completion.
 */
BaseExchange.prototype.ready = function(callback) {
    if (this.ticker) {
        this.debug('Starting tick loop with delay:', this.ticker.delay);
        this.ticker.start();
    }

    callback && callback.call(this);
};


/**
 * Clean up the bot into a shutdown-friendly state, such as clearing any event
 * loops.
 *
 * @param {function} callback Function called upon completion.
 */
BaseExchange.prototype.cleanup = function(callback) {
    if (this.ticker) this.ticker.stop();

    var exchange = this;

    var using = exchange.requestLock.using();
    if (using) {
        exchange.debug('Cleanup waiting for pending requests: %d', using);
    }

    exchange.requestLock.acquire(true /* exclusive */, function() {
        callback && callback.call(exchange);
        exchange.requestLock.release();
    });
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
        quantity: balance.quantity.toString(),
        value: balance.value.toString()
    });

    return balance;
};


/**
 * Save a placed order in our internal storage.
 *
 * @param {Order}
 * @param {boolean=} isUpdate Don't warn if it's a duplicate, just update.
 */
BaseExchange.prototype.saveOrder = function(order, isUpdate) {
    if (order.id === null) {
        if (!this.pretend) {
            throw Error("Tried to place an order without an id:", order.toString());
            return;
        }
        order.id = this.nextPretendId();
    }

    var duplicateOrder = this.ordersById[order.id];
    if (isUpdate && duplicateOrder) {
        this.deleteOrder(duplicateOrder);
    } else if (duplicateOrder) {
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


/**
 * Resource counter to be used as a simple lock.
 */
var Resource = module.exports.Resource = function() {
    this.count = 0;
    this.callbacks = [];
};


/**
 * Acquire a resource.
 *
 * @param {boolean} exclusive Succeed when resource count is 0.
 * @param {function=} callback Function to execute when acquired. Must release in callback.
 * @return {boolean|number} Returns either false if exclusive acquire failed, or truthy number of users.
 */
Resource.prototype.acquire = function(exclusive, callback) {
    if (exclusive && this.count > 0) {
        if (callback) this.callbacks.push(callback);
        return false;
    }
    callback && callback();
    return ++this.count;
};


/**
 * Release a resource. If count is 0, call the next pending callback.
 *
 * @return {number}
 */
Resource.prototype.release = function() {
    var c = --this.count;
    if (c === 0) {
        var fn = this.callbacks.shift();
        fn && fn();
    }
    return c;
}


/**
 * Return count of usage. Will be truthy if it's not unused.
 *
 * @return {number}
 */
Resource.prototype.using = function() {
    return this.count;
};


/**
 * Tick manager with some extra sugar for detecting stalls. No-op if no function
 * is provided.
 *
 * @param {function} fn Context-bound function to tick every {@code delay}.
 * @param {number=} delay Milliseconds to wait before ticks. (Default: 1000)
 * @param {Resource=} resource Resource to lock before ticking. (Optional)
 * @param {number=} numAlerts Emit 'stuck' if this many ticks are missed due to no exclusive lock. (Default: 120)
 */
var Ticker = module.exports.Ticker = function(fn, delay, resource, numAlert) {
    this.fn = fn;
    this.delay = delay || 1000;
    this.resource = resource;
    this.count = 0;
    this.completed = 0;
    this.throttle = 0;
    this.skipStreak = 0;
    this.skipAlert = numAlert || 120; // Emit 'stuck' if we skip this many ticks in a row.
    this.loop = null;
};

util.inherits(Ticker, events.EventEmitter);


Ticker.prototype.tick = function() {
    if (this.throttle) {
        this.throttle--;
        return;
    };

    var count = this.count++;
    var skipStreak = this.skipStreak = count - this.completed;

    // TODO: Instead of emitting stuck, maybe acquire with callback after some attempts?
    if (this.resource && !this.resource.acquire(true /* exclusive */)) {
        if (skipStreak % this.skipAlert == 0) {
            this.emit('stuck', this);
        }

        return;
    }

    this.fn();

    this.completed = count;
    if (skipStreak >= this.skipAlert) {
        this.emit('resume', this);
    }

    this.emit('tick', this);
};


Ticker.prototype.start = function() {
    if (this.loop) this.stop();

    this.loop = setInterval(this.tick.bind(this), this.delay);
};


Ticker.prototype.stop = function() {
    if (!this.loop) return;

    clearInterval(this.loop);
};


/**
 * Throttle ticker temporarily.
 *
 * @param {number} num Pause ticker for this many ticks.
 */
Ticker.prototype.pause = function(num) {
    this.throttle = num;
};
