var DummyExchange = require('./exchanges/dummy.js').DummyExchange,
    BitmeExchange = require('./exchanges/bitme.js').BitmeExchange,
    BitstampExchange = require('./exchanges/bitstamp.js').BitstampExchange,
    async = require('async'),
    util = require('./util.js'),
    logger = require('./logger.js');



var eventHandlers = {
    'origin': {
        'trade': function(t) {
            logger.debug('[Origin] Trade: %j', t);
            // XXX: Origin 'trade' event should trigger instructOriginOrders and execute the recommended orders.
        },
        'orderbook': function(orderbook) {
            // TODO: Get rid of this, we don't care.
            logger.debug('[Origin] Orderbook: %d asks, %d bids', orderbook.asks.length, orderbook.bids.length);
        }
    },
    'remote': {
        'trade': function(t) {
            logger.debug('[Remote] Trade: %j', t);
        },
        'orderbook': function(orderbook) {
            logger.debug('[Remote] Orderbook: %d asks, %d bids', orderbook.asks.length, orderbook.bids.length);
            // XXX: Remote 'orderbook' event should trigger instructExchangeOrders and execute the recommended orders.
        }
    }
};


/**
 * Controller which glues all the pieces together.
 *
 * @param {object} Configuration for the bot, including API keys etc.
 */
var Bot = module.exports.Bot = function(originExchange, remoteExchange) {
    this.state = 'idle';
    this.originExchange = originExchange;
    this.remoteExchange = remoteExchange;
};


/**
 * Create a new Bot instance based on configuration options.
 *
 * @param {object}
 * @return {Bot}
 */
Bot.fromConfig = function(config) {
    if (config.live !== true) {
        logger.info('Bot created in dummy mode. All trades will be fake using a DummyExchange.');

        var originExchange = DummyExchange.fromConfig(config);
        var remoteExchange = DummyExchange.fromConfig(config);
        return new Bot(originExchange, remoteExchange);
    }

    if (util.hasStringValues(config, BitstampExchange.configKeys) && util.hasStringValues(config, BitmeExchange.configKeys)) {
        logger.info('Bot created in LIVE mode. Real trades will occur on real exchanges.');
    } else {
        logger.info('Bot created in PRETEND mode due to missing API keys. Orderbook will be watched but no trades will be placed.');
        config.pretend = true;
    }

    var originExchange = BitmeExchange.fromConfig(config);
    var remoteExchange = BitstampExchange.fromConfig(config);
    return new Bot(originExchange, remoteExchange);
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
 */
Bot.prototype.start = function() {
    var bot = this;

    async.series([
        function prepareOrigin(callback) { bot.originExchange.ready(callback); },
        function prepareRemote(callback) { bot.remoteExchange.ready(callback); },
        function reset(callback) { bot.reset(callback); },
        function start(callback) {
            logger.info('Bot starting to trade.');

            bot.state = 'start';
            util.addListeners(bot.originExchange, eventHandlers.origin);
            util.addListeners(bot.remoteExchange, eventHandlers.remote);

            callback();
        }
    ], function resultHandler(err, result) {
        if (err) bot.abort(err);
    });
};

/**
 * Gracefully shut down the bot by entering into a safe state.
 *
 * @param {function=} callback Function called upon completion.
 */
Bot.prototype.stop = function(callback) {
    logger.info('Bot stopping.');

    if (this.state !== 'idle') this.reset(callback);

    this.state = 'stop';
    this.originExchange.cleanup();
    this.remoteExchange.cleanup();
    util.removeListeners(this.originExchange, eventHandlers.origin);
    util.removeListeners(this.remoteExchange, eventHandlers.remote);

    this.reset(callback);
};


/**
 * Handle sudden aborts when things go wrong. Similar to stop but takes an error.
 *
 * @param {Error} err Reason for aborting.
 * @param {function=} callback Function called upon completion.
 */
Bot.prototype.abort = function(err, callback) {
    logger.error("Aborting bot: ", err);

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

    // XXX: Fill this in.

    callback && callback.call(this);
};
