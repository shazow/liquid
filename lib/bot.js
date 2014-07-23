var DummyExchange = require('./exchanges/dummy.js').DummyExchange,
    BitmeExchange = require('./exchanges/bitme.js').BitmeExchange,
    BitstampExchange = require('./exchanges/bitstamp.js').BitstampExchange,
    logger = require('./logger.js');


/**
 * Controller which glues all the pieces together.
 *
 * @param {object} Configuration for the bot, including API keys etc.
 */
var Bot = module.exports.Bot = function(options) {
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
    this.reset(function() {
        logger.info('Bot starting to trade...');
        // XXX: Fill this in.
    });
};


/**
 * Gracefully shut down the bot by entering into a safe state.
 *
 * @param {function} callback Function called upon completion.
 */
Bot.prototype.stop = function(callback) {
    logger.info('Bot is stopping...');

    this.reset(callback);
};


/**
 * Reset the exchanges into a safe state for starting or stopping.
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
 * @param {function} callback Function called upon completion.
 */
Bot.prototype.reset = function(callback) {
    logger.info('Resetting exchanges into a safe state.');
    // XXX: Fill this in.
};
