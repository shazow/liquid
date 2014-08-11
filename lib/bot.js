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
    this.resetOnly = options.resetOnly;
    this.minValue = options.minValue;
    this.maxOrders = options.maxOrders;
    this.stopAfter = options.stopAfter;

    this.stats = {
        numMatched: 0,
        numPending: 0,
        valueMatched: BigNumber(0),
        valuePending: BigNumber(0),
        premiumProfit: BigNumber(0)
    };

    this.eventHandlers = {
        'origin': {'trade': this.handleOriginTrade.bind(this)},
        'remote': {'trade': this.handleRemoteTrade.bind(this), 'orderbook': this.handleRemoteOrderbook.bind(this)}
    };

    // Keep track of alerts that we don't want to spam.
    this.alertLast = {};
    this.alertInterval = 1000 * 60; // Once per hour

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
            'valueMatched': this.stats.valueMatched.toNumber(),
            'valuePending': this.stats.valuePending.toNumber(),
            'premiumProfit': this.stats.premiumProfit.toNumber()
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

                bot.state = 'start';
                util.addListeners(bot.originExchange, bot.eventHandlers.origin);
                util.addListeners(bot.remoteExchange, bot.eventHandlers.remote);

                logger.info('Bot started.');
                callback();
            }
        );
    }

    async.series(ops, function resultHandler(err, result) {
        if (err) {
            bot.abort(err, callback);
            return;
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
    if (this.state == 'stopping') {
        logger.debug('Called stop when bot already stopping, ignored.');
        return;
    }
    this.state = 'stopping';

    logger.debug('Pre-stop Origin balance:', this.originExchange.toObject().balance);
    logger.debug('Pre-stop Remote balance:', this.remoteExchange.toObject().balance);
    logger.info('Bot stopping:', this.dumpState().stats);

    var bot = this;
    async.parallel([
        function cleanupOrigin(callback) { bot.originExchange.cleanup(callback); },
        function cleanupRemote(callback) { bot.remoteExchange.cleanup(callback); },
    ], function() {
        util.removeListeners(bot.originExchange, bot.eventHandlers.origin);
        util.removeListeners(bot.remoteExchange, bot.eventHandlers.remote);

        bot.state = 'idle';
        bot.reset(callback);
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
    logger.info('Resetting exchanges into a safe state.');
    var bot = this;

    async.series([
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
    var value = originOrder.getValue();
    var profit = value.minus(order.getValue()).abs();

    this.stats.numMatched++;
    this.stats.numPending--;
    this.stats.valueMatched = this.stats.valueMatched.plus(value);
    this.stats.valuePending = this.stats.valuePending.minus(order.getValue());
    this.stats.premiumProfit = this.stats.premiumProfit.plus(profit);

    callback && callback.call(this);
};


/**
 * Handler for [remote -> orderbook] event.
 *
 * Synchronize origin with the new remote orderbook.
 */
Bot.prototype.handleRemoteOrderbook = function(orders, callback) {
    var bot = this;

    if (!Array.isArray(orders)) {
        orders = orders.asks.concat(orders.bids);
    }

    var spread = order.getSpread(orders);
    logger.debug('[bot:remote] Orderbook:', spread);

    order.sortOrders(orders, spread.mean);

    var budget = order.getBudget(this.originExchange.balance, this.remoteExchange.balance, this.premium);
    var newOrders = order.aggregateOrders(orders, this.minValue, this.premium);
    var budgetOrders = order.budgetOrders(newOrders, budget, this.minValue || 0).slice(0, this.maxOrders || undefined);
    var originOrders = this.originExchange.getOrders();
    var patch = order.patchOrders(originOrders, budgetOrders);

    // FIXME: budgetOrders are being pruned not accounting for outstanding originOrders
    // that will get replaced during patchOrders. This is overly conservative and requires
    // an excessive outstanding budget.
    var numPruned = newOrders.length - budgetOrders.length;
    if (numPruned > 0 && budgetOrders.length !== this.maxOrders) {
        logger.debug('[bot:remote] Pruned %d of %d aggregated orders due to low budget: [ASK: %d BTC, %d USD] [BID: %d BTC, %d USD]',
            numPruned, newOrders.length,
            budget['ASK'].quantity.toNumber(), budget['ASK'].value.toNumber(), budget['BID'].quantity.toNumber(), budget['BID'].value.toNumber());

        var now = +new Date();
        if (budgetOrders.length==0 && (bot.alertLast['budget'] || 0) < (now - bot.alertInterval)) {
            // No orders are being traded, send an alert every alertInterval.
            bot.alertLast['budget'] = now;
            logger.alert("Balance too low to make any of %d aggregated trades. Cheapest trade:", newOrders.length, newOrders[0].toString(), bot.dumpState());
        }
    }

    async.series([
        function cancelOrders(callback) {
            bot.originExchange.cancelOrders(patch.cancel, callback);
        },
        function placeOrders(callback) {
            bot.originExchange.placeOrders(patch.place, callback);
        }
    ], function(err, results) {
        if (err) {
            logger.error('Failed to sync origin orderbook, aborting:', err.message);
            // TODO: Recover gracefully and continue.
            bot.abort(err, callback);
            return;
        }
        callback && callback.call(bot, err, results);
    });
};

/**/
