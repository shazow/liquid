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
        }
    },
    'remote': {
        'trade': function(t) {
            logger.debug('[Remote] Trade: %j', t);
        },
        'orderbook': function(orderbook) {
            logger.debug('[Remote] Orderbook: %j', orderbook);
            // XXX: Remote 'orderbook' event should trigger instructExchangeOrders and execute the recommended orders.
        }
    }
};


/**
 * Controller which glues all the pieces together.
 *
 * @param {object} Configuration for the bot, including API keys etc.
 */
var Bot = module.exports.Bot = function(options) {
    this.state = 'idle';
    this.options = options;

    if (options.live !== true) {
        logger.info('Bot created in pretend mode. All trades will be fake using a DummyExchange.');

        this.originExchange = new DummyExchange();
        this.remoteExchange = new DummyExchange();
        return;
    }

    logger.warn('Bot created in LIVE mode. Real trades will occur on real exchanges.');

    this.originExchange = BitmeExchange.fromConfig(options);
    this.remoteExchange = BitstampExchange.fromConfig(options);
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
        function reset(callback) { bot.reset(); },
        function start(callback) {
            logger.info('Bot starting to trade...');

            bot.state = 'start';
            util.addListeners(this.originExchange, eventHandlers.origin);
            util.addListeners(this.remoteExchange, eventHandlers.remote);
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
    logger.info('Bot is stopping...');

    if (this.state !== 'idle') this.reset(callback);

    this.state = 'stop';
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
    logger.error("Aborting bot: %j", err);

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
