var DummyExchange = require('./exchanges/dummy.js').DummyExchange,
    BitmeExchange = require('./exchanges/bitme.js').BitmeExchange,
    BitstampExchange = require('./exchanges/bitstamp.js').BitstampExchange,
    async = require('async'),
    util = require('./util.js'),
    order = require('./order.js'),
    logger = require('./logger.js');



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

    this.premium = options.premium;
    this.resetOnly = options.resetOnly;
    this.minValue = options.minValue;
    this.maxOrders = options.maxOrders;

    this.eventHandlers = {
        'origin': {'trade': this.handleOriginTrade.bind(this)},
        'remote': {'trade': this.handleRemoteTrade.bind(this), 'orderbook': this.handleRemoteOrderbook.bind(this)}
    };
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

    if (config.live !== true) {
        logger.info('Bot created in dummy mode. All trades will be fake using a DummyExchange.');

        var originExchange = new DummyExchange('DummyOrigin', 1000);
        var remoteExchange = new DummyExchange('DummyRemote', 1000);
        return new Bot(originExchange, remoteExchange, config.premium, config.reset);
    }

    if (util.hasStringValues(config, BitstampExchange.configKeys) && util.hasStringValues(config, BitmeExchange.configKeys)) {
        logger.info('Bot created in LIVE mode. Real trades will occur on real exchanges.');
    } else {
        logger.info('Bot created in PRETEND mode due to missing API keys. Orderbook will be watched but no trades will be placed.');
        config.pretend = true;
    }

    var originExchange = BitmeExchange.fromConfig(config);
    var remoteExchange = BitstampExchange.fromConfig(config);
    return new Bot(originExchange, remoteExchange, config);
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

    // TODO: Use async.queue to inject interrupts?
    async.series([
        function prepareOrigin(callback) { bot.originExchange.ready(callback); },
        function prepareRemote(callback) { bot.remoteExchange.ready(callback); },
        function reset(callback) {
            var err = bot.resetOnly && new Error('Reset-only mode shutdown.');
            bot.reset(function() {
                callback(err);
            });
        },
        function start(callback) {
            logger.debug('[bot] Binding to exchange events.');

            bot.state = 'start';
            util.addListeners(bot.originExchange, bot.eventHandlers.origin);
            util.addListeners(bot.remoteExchange, bot.eventHandlers.remote);

            callback();
        }
    ], function resultHandler(err, result) {
        if (err) {
            bot.abort(err, callback);
            return;
        }

        logger.info('Bot started.');
        callback && callback.call(bot, err, result);
    });
};


/**
 * Gracefully shut down the bot by entering into a safe state.
 *
 * @param {function=} callback Function called upon completion.
 */
Bot.prototype.stop = function(callback) {
    logger.info('Bot stopping.');

    var bot = this;
    var cleanup = function(callback) {
        logger.debug("[bot] Cleaning up exchange subscriptions.");
        bot.originExchange.cleanup();
        bot.remoteExchange.cleanup();
        util.removeListeners(bot.originExchange, bot.eventHandlers.origin);
        util.removeListeners(bot.remoteExchange, bot.eventHandlers.remote);

        bot.state = 'idle';
        callback && callback.call(bot);
    };

    if (this.state !== 'idle') {
        this.reset(function() {
            cleanup(callback);
        });
    } else {
        cleanup(callback);
    }
};


/**
 * Handle sudden aborts when things go wrong. Similar to stop but takes an error.
 *
 * @param {Error} err Reason for aborting.
 * @param {function=} callback Function called upon completion.
 */
Bot.prototype.abort = function(err, callback) {
    logger.error("Aborting bot:", err.toString());

    // TODO: Do we need extra logic for abort? Alert?

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
            bot.originExchange.cancelOrders(orders, callback);
        },
        function checkRemoteOrders(callback) {
            var orders = bot.remoteExchange.getOrders();
            if (orders.length > 0) {
                logger.warn('Found outstanding remote placed orders: %d', orders.length); 
            }
            callback();
        }
    ], function(err, result) {
        if (err) {
            logger.error('Failed to reset bot into a safe state: %j', err);
            // XXX: Send alert? Try again?
        }
        callback && callback.call(bot, err, result);
    });


    // XXX: Fill this in.

    callback && callback.call(this);
};


/** Trade event handlers. */

Bot.prototype.handleOriginTrade = function(order, callback) {
    logger.debug('[bot:origin] Trade: %j', order);

    var newOrder = order.clone({}, this.premium, true);
    this.remoteExchange.placeOrders([newOrder], callback);
};

Bot.prototype.handleRemoteTrade = function(order, callback) {
    logger.debug('[bot:remote] Trade: %j', order);
};

Bot.prototype.handleRemoteOrderbook = function(orderbook, callback) {
    var bot = this;

    var orders = orderbook.asks.concat(orderbook.bids);
    var spread = order.getSpread(orders);
    logger.debug('[bot:remote] Orderbook: %d asks +$%d, %d bids +$%d (total %d worth $%d)', orderbook.asks.length, spread.ask, orderbook.bids.length, spread.bid, spread.totalQuantity, spread.totalValue);

    order.sortOrders(orders, spread.mean);
    var newOrders = order.aggregateOrders(orders, this.minValue, this.premium, this.maxOrders);
    var instructions = order.patchOrders(this.originExchange.getOrders(), newOrders);

    async.series([
        function cancelOrders(callback) {
            bot.originExchange.cancelOrders(instructions.cancel, callback);
        },
        function placeOrders(callback) {
            bot.originExchange.placeOrders(instructions.place, callback);
        }
    ], function(err, results) {
        if (err) {
            logger.error('Failed to sync origin orderbook, aborting: %j', err);
            // TODO: Recover gracefully and continue.
            bot.stop(callback);
            return;
        }
        callback && callback.call(this);
    });
};

/**/
