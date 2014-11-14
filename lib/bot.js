var async = require('async'),
    BigNumber = require('bignumber.js');

var behaviors = require('./exchanges/dummy.js').behaviors,
    logger = require('./logger.js'),
    order = require('./order.js'),
    util = require('./util.js'),
    BitmeExchange = require('./exchanges/bitme.js').BitmeExchange,
    BitstampExchange = require('./exchanges/bitstamp.js').BitstampExchange,
    DummyExchange = require('./exchanges/dummy.js').DummyExchange;


/**
 * Controller which glues all the pieces together.
 *
 * @param {BaseExchange} originExchange Exchange that we're providing liquidity for.
 * @param {BaseExchange} remoteExchange Exchange where we're pulling the orderbook from.
 * @param {object} options Additional configuration (premium, resetOnly, minValue)
 */
var Bot = module.exports.Bot = function(originExchange, remoteExchange, options) {
    this.state = 'idle';
    this.originExchange = originExchange;
    this.remoteExchange = remoteExchange;

    if (options===undefined) {
        options = {};
    }

    this.premium = options.premium;
    this.tolerance = options.tolerance;
    this.resetOnly = options.resetOnly;
    this.minValue = options.minValue;
    this.maxOrders = options.maxOrders;
    this.stopAfter = options.stopAfter;
    this.progressInterval = options.progressInterval;
    this.maxVolatility = options.maxVolatility;

    this.stats = {
        numMatched: 0,
        numPending: 0,
        valueMatched: BigNumber(0),
        valuePending: BigNumber(0),
        premiumProfit: BigNumber(0)
    };

    // Spread history
    this.spreadHistory = new SampleHistory(
        180     /* num length of history (180 at 10s = 30 min) **/,
        1000*10 /* interval, add sample once every n ms (1000*10 = 10s) */,
        12      /* rollingNum, look at rolling avg of oldest n entries (12 at 10s = first 2 min)*/
    );

    this.eventHandlers = {
        'origin': {'trade': this.handleOriginTrade.bind(this)},
        'remote': {'trade': this.handleRemoteTrade.bind(this), 'orderbook': this.handleRemoteOrderbook.bind(this)}
    };

    // Keep track of alerts that we don't want to spam.
    this.alertLast = {};
    this.alertInterval = 1000 * 60 * 60; // Once per hour

    logger.debug('[bot] init values:', this.toObject());
};


/**
 * Create a new Bot instance based on configuration options.
 *
 * @param {object} config
 * @return {Bot}
 */
Bot.fromConfig = function(config) {
    if (config.reset) {
        logger.info('Reset mode set, will shutdown after reset without trading.');
    }

    if (config.LIVE !== true) {
        logger.info('Bot created in dummy mode. All trades will be fake using a DummyExchange.');

        var tickDelay = 1000;
        var originExchange = new DummyExchange('DummyOrigin', tickDelay, behaviors.randomOrigin);
        var remoteExchange = new DummyExchange('DummyRemote', tickDelay, behaviors.randomRemote);

        // Add something to the orderbook to avoid volatility skip debug messages.
        remoteExchange.orderbook.push(new order.Order('DUMMY1234', 'BID', '1', '500'));

        return new Bot(originExchange, remoteExchange, config);
    }

    var allConfigKeys = util.mergeArrays(BitstampExchange.configKeys, BitmeExchange.configKeys);
    var missingKeys = util.missingStringValues(config.apiKeys, allConfigKeys);
    if (config.pretend) {
        logger.info('Bot created in PRETEND mode. Orderbook will be watched but no trades will be placed.', missingKeys);
    } else if (!missingKeys.length) {
        logger.info('Bot created in LIVE mode. Real trades will occur on real exchanges.');
    } else {
        logger.info('Bot created in PRETEND mode due to missing API keys (%j). Orderbook will be watched but no trades will be placed.', missingKeys.join(', '));
        config.pretend = true;
    }

    var originExchange = BitmeExchange.fromConfig(config);
    var remoteExchange = BitstampExchange.fromConfig(config);
    return new Bot(originExchange, remoteExchange, config);
};


/**
 * Return an object describing the bot. Used for logging.
 * @return {object}
 */
Bot.prototype.toObject = function() {
    return {
        'origin': this.originExchange.id,
        'remote': this.remoteExchange.id,
        'premium': this.premium,
        'tolerance': this.tolerance,
        'resetOnly': this.resetOnly,
        'minValue': this.minValue,
        'maxOrders': this.maxOrders,
        'stopAfter': this.stopAfter
    };
};


/**
 * Return an object describing the state of the order bot, used for alerts.
 * @return {object}
 */
Bot.prototype.dumpState = function() {
    return {
        'origin': this.originExchange.toObject(),
        'remote': this.remoteExchange.toObject(),
        'stats': {
            'numMatched': this.stats.numMatched,
            'numPending': this.stats.numPending,
            'valueMatched': this.stats.valueMatched.toFixed(4),
            'valuePending': this.stats.valuePending.toFixed(4),
            'premiumProfit': this.stats.premiumProfit.toFixed(4)
        },
        'spread': {
            'mean': Number(this.spreadHistory.history.slice(-1)[0]).toFixed(2),
            'delayedRollingAvg': Number(this.spreadHistory.getRollingAvg()).toFixed(2)
        }
    };
};


/**
 * Start trading. Will call {@code this.reset()} before commencing.
 *
 * Origin exchange:
 * 1. On 'trade' event, sync orders to remote exchange.
 *
 * Remote exchange:
 * 1. On 'trade' event, log them.
 * 2. On 'orderbook' event, sync orders to origin exchange.
 *
 * @param {function=} callback Function called upon completion.
 */
Bot.prototype.start = function(callback) {
    var bot = this;
    if (bot.state !== 'idle') {
        callback(new Error('Bot must be idle before starting.'));
        return;
    }
    bot.state = 'start';

    var ops = [
        function prepareOrigin(callback) { bot.originExchange.ready(callback); },
        function prepareRemote(callback) { bot.remoteExchange.ready(callback); },
    ];

    if (bot.resetOnly===true) {
        ops.push(function stop(callback) {
            bot.stop(callback);
        });
    } else {
        ops.push(
            function reset(callback) { bot.reset(callback); },
            function start(callback) {
                logger.debug('[bot] Binding to exchange events.');

                util.addListeners(bot.originExchange, bot.eventHandlers.origin);
                util.addListeners(bot.remoteExchange, bot.eventHandlers.remote);

                bot.state = 'ready';
                logger.info('Bot started.');
                callback();
            }
        );
    }
    async.series(ops, function resultHandler(err, result) {
        if (err) {
            bot.abort(err, function(abortErr) {
                if (abortErr) {
                    logger.warn('Failed to abort:', abortErr.toString());
                }

                callback && callback.call(bot, err);
            });
            return;
        }

        // Start progress loop
        if (bot.progressInterval !== undefined) {
            if(bot.progressLoop) clearInterval(bot.progressLoop);

            // Progress printing is disabled when progressInterval == 0.
            bot.progressLoop = bot.progressInterval!==0 && setInterval(function() {
                logger.info('Progress:', bot.dumpState().stats);
            }, bot.progressInterval);
        }

        callback && callback.call(bot, err, result);
    });
};


/**
 * Gracefully shut down the bot by entering into a safe state.
 *
 * @param {function=} callback Function called upon completion.
 */
Bot.prototype.stop = function(callback) {
    if (this.state == 'idle') {
        callback && callback(new Error('Bot already stopped.'));
        return;
    }

    logger.debug('Pre-stop Origin balance:', this.originExchange.toObject().balance);
    logger.debug('Pre-stop Remote balance:', this.remoteExchange.toObject().balance);
    logger.info('Bot stopping:', this.dumpState().stats);

    var bot = this;

    // Stop listening to remote updates immediately.
    util.removeListeners(bot.remoteExchange, bot.eventHandlers.remote);

    async.parallel([
        function cleanupOrigin(callback) { bot.originExchange.cleanup(callback); },
        function cleanupRemote(callback) { bot.remoteExchange.cleanup(callback); },
    ], function(cleanupErr) {
        // Stop progress loop
        if (bot.progressLoop) clearInterval(bot.progressLoop);

        if (cleanupErr) {
            logger.warn('Failed to cleanup during stop, attempting reset anyways:', cleanupErr.toString());
        }

        bot.reset(function(err) {
            // Stop listening to origin updates once reset is complete. This is
            // necessary to catch partial matches during cancels and relay them
            // back before shutting down.
            util.removeListeners(bot.originExchange, bot.eventHandlers.origin);
            bot.state = 'idle';

            callback && callback.call(bot, err || cleanupErr);
        });
    });
};


/**
 * Handle sudden aborts when things go wrong. Similar to stop but takes an error.
 *
 * @param {Error} err Reason for aborting.
 * @param {function=} callback Function called upon completion.
 */
Bot.prototype.abort = function(err, callback) {
    logger.alert("Aborting bot:", err.toString(), this.dumpState());

    this.stop(callback);
};


/**
 * Reset the exchanges into a safe state for starting or stopping.
 *
 * This function should be safe to call multiple times without risk of conflict.
 *
 * Origin exchange:
 * 1. Get trades since last state sync and clear orders. (Race condition risk?)
 * 2. Match trades on remote exchange.
 *
 * Remote exchange:
 * 1. Get outstanding orders and log them, send alerts if necessary.
 *
 * Note that outstanding orders on remote exchanges will remain, as these are
 * orders which already had proxy-orders fulfilled in the origin exchange and
 * are supposed to be matched.
 *
 * @param {function=} callback Function called upon completion.
 */
Bot.prototype.reset = function(callback) {
    logger.info('Resetting exchanges into a safe state. Currently:', {'state': this.state});
    var bot = this;

    async.series([
        function checkBotState(callback) { 
            if (bot.state !== 'idle') {
                // All is good, continue.
                callback();
                return;
            }

            callback(new Error('Bot not started.'));
        },
        function clearOriginOrders(callback) {
            var orders = bot.originExchange.getOrders();
            if (orders.length === 0) {
                callback();
                return;
            };

            logger.debug('[bot] Cancelling %d stale origin orders.', orders.length);
            bot.originExchange.cancelOrders(orders, callback);
            // TODO: Confirm cleanup was successful?
        },
        function checkRemoteOrders(callback) {
            var orders = bot.remoteExchange.getOrders();
            if (orders.length === 0) {
                callback();
                return;
            };

            orders.forEach(function(order) {
                bot.stats.valuePending = bot.stats.valuePending.plus(order.getValue());
            });

            logger.warn('Found %d outstanding remote placed orders, value:', orders.length, bot.stats.valuePending.toNumber());
            callback();
        }
    ], function(err, result) {
        if (err) {
            logger.alert('Failed to reset bot into a safe state:', err.message, bot.dumpState());
        }
        callback && callback.call(bot, err, result);
    });
};


/** Trade event handlers. */


/**
 * Handler for [origin -> trade] event.
 *
 * Place the inverted order on the remote exchange.
 */
Bot.prototype.handleOriginTrade = function(order, callback) {
    logger.debug('[bot:origin] Trade:', order.toString());

    var bot = this;
    var newOrder = order.clone({}, bot.premium, /* invertType */ true);

    this.remoteExchange.placeOrders([newOrder], function(err, result) {
        if (err) {
            logger.error('Failed to sync remote orderbook, aborting:', err.message);
            bot.abort(err, callback);
            return;
        }

        bot.stats.numPending++;
        bot.stats.valuePending = bot.stats.valuePending.plus(newOrder.getValue());

        var num = bot.stats.numPending + bot.stats.numMatched;
        if (bot.stopAfter <= num) {
            logger.info('Bot reached stopAfter=%d value, initiating stop.', num);
            bot.stop(callback);
            return;
        };

        callback && callback.call(bot, err, result);
    });
};


/**
 * Handler for [remote -> trade] event.
 *
 * No-op. Update stats and continue.
 */
Bot.prototype.handleRemoteTrade = function(order, callback) {
    logger.debug('[bot:remote] Matched and completed:', order.toString());

    // NOTE: This assumes the order premium is symmetric and not dynamic.
    var originOrder = order.clone({}, this.premium, true); 
    var profit = 0;
    if (this.premium) {
        profit = order.getValue().times(this.premium).minus(order.getValue());
    }

    this.stats.numMatched++;
    this.stats.numPending--;
    this.stats.valueMatched = this.stats.valueMatched.plus(originOrder.getValue());
    this.stats.valuePending = this.stats.valuePending.minus(order.getValue());
    this.stats.premiumProfit = this.stats.premiumProfit.plus(profit);

    if (this.progressLoop === undefined) {
        // We print the progress with every trade only if we're not printing it
        // in an interval.
        logger.info('Progress:', this.dumpState().stats);
    }

    callback && callback.call(this);
};


/**
 * Handler for [remote -> orderbook] event.
 *
 * Synchronize origin with the new remote orderbook.
 */
Bot.prototype.handleRemoteOrderbook = function(orders, callback) {
    var bot = this;

    if (!bot.originExchange.requestLock.acquire(true /* exclusive */)) {
        // Discard orderbook changes while we're still processing changes.
        return;
    }

    if (!Array.isArray(orders)) {
        orders = orders.asks.concat(orders.bids);
    }

    // Check market volatility
    var history = bot.spreadHistory;
    var spread = order.getSpread(orders);
    spread.variance = history.getVariance(spread.mean);
    logger.debug('[bot:remote] Orderbook:', spread);

    if (spread.mean === null) {
        logger.debug('[bot:remote] Empty orderbook detected, skipping volatility check.');
    } else if (spread.variance > this.maxVolatility) {
        logger.error('Spread variance %d exceeded maxVolatility %d: %d USD (vs %d delayed rolling avg)', spread.variance.toFixed(2), this.maxVolatility, spread.mean, history.getRollingAvg());
        bot.abort(new Error('Market volatility detected.'), callback);
    } else {
        history.push(spread.mean);
    }

    // Prepare order changes
    order.sortOrders(orders, spread.mean);
    var budgetPadding = 1.03;
    var originOrders = bot.originExchange.getOrders();
    var newOrders = order.aggregateOrders(orders, bot.minValue, bot.premium);
    var budget = order.getBudget(bot.originExchange.balance, bot.remoteExchange.balance, bot.premium, budgetPadding);
    var budgetOrders = order.budgetOrders(newOrders, budget, bot.minValue || 0).slice(0, bot.maxOrders || undefined);
    var patch = order.patchOrders(originOrders, budgetOrders, bot.tolerance);

    // FIXME: budgetOrders are being pruned not accounting for outstanding originOrders
    // that will get replaced during patchOrders. This is overly conservative and requires
    // an excessive outstanding budget.
    var numPruned = newOrders.length - budgetOrders.length;
    if (numPruned > 0 && budgetOrders.length !== bot.maxOrders) {
        logger.debug('[bot:remote] Pruned %d of %d aggregated orders due to low budget: [ASK: %d BTC, %d USD] [BID: %d BTC, %d USD]',
            numPruned, newOrders.length,
            budget['ASK'].quantity.toNumber(), budget['ASK'].value.toNumber(), budget['BID'].quantity.toNumber(), budget['BID'].value.toNumber());

        var now = +new Date();
        if (originOrders.length==0 && budgetOrders.length==0 && (bot.alertLast['budget'] || 0) < (now - bot.alertInterval)) {
            // No orders are being traded, send an alert every alertInterval.
            bot.alertLast['budget'] = now;
            logger.alert("Balance too low to make any of %d aggregated trades.", newOrders.length, {
                'remoteOrderbook': spread,
                'newOrders': newOrders.map(String),
                'bot': bot.dumpState()
            });
        }
    }

    var using = bot.originExchange.requestLock.using();
    if (using > 1) {
        // Discard orderbook udpate mid-completion because there are changes in-progress.
        bot.originExchange.debug('Skipping orderbook update due to %d pending requests.', using);
        bot.originExchange.requestLock.release();
        return;
    }

    async.series([
        function cancelOrders(callback) {
            bot.originExchange.cancelOrders(patch.cancel, callback);
        },
        function placeOrders(callback) {
            bot.originExchange.placeOrders(patch.place, callback);
        }
    ], function(err, results) {
        bot.originExchange.requestLock.release();

        if (err) {
            logger.error('Failed to sync origin orderbook, aborting:', err.message);
            bot.abort(err, callback);
            return;
        }
        callback && callback.call(bot, err, results);
    });
};

/**/



/**
 * Track sample history of a value and query for deviations from a rolling
 * average.
 *
 * @param {number} num Number of samples to remember.
 * @param {number} interval Only record new samples after this interval in ms.
 * @param {number=} rollingNum Subset to keep a rolling average of to compare against.
 */
var SampleHistory = module.exports.SampleHistory = function(num, interval, rollingNum) {
    this.history = [];
    this.timestamp = null;
    this.num = num;
    this.interval = interval;

    // Keep a rolling average of the earliest subset.
    this.rollingNum = Math.max(1, rollingNum === undefined ? Math.floor(num/4) : rollingNum);
    this.rollingSum = 0;
};


/**
 * Add value to sample history (if interval time is elapsed).
 *
 * @param {number} value Sample value to record.
 */
SampleHistory.prototype.push = function(value) {
    if (this.timestamp && this.interval && new Date() - this.timestamp < this.interval) {
        return; // Skip, too soon.
    }

    this.timestamp = new Date();
    this.history.push(value);

    if (this.history.length > this.num) {
        this.shift();
    } else if (this.history.length <= this.rollingNum) {
        this.rollingSum += value;
    }
};


/**
 * Remove and return the oldest value from the sample history.
 */
SampleHistory.prototype.shift = function() {
    var removed = this.history.shift();
    this.rollingSum -= removed;

    if (this.history.length >= this.rollingNum) {
        this.rollingSum += this.history[this.rollingNum-1];
    }

    return removed;
};


SampleHistory.prototype.getRollingAvg = function() {
    return this.rollingSum / Math.min(this.history.length, this.rollingNum);
};


/**
 * Compare relative change of value against delayed rolling average.
 *
 * @param {number} value Value to query.
 * @return {boolean} Is the value a deviant?
 */
SampleHistory.prototype.getVariance = function(value) {
    var avg = this.getRollingAvg();
    return Math.abs((value - avg) / avg);
};
