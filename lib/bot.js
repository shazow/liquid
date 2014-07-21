var DummyExchange = require('./exchanges/dummy.js').DummyExchange,
    logger = require('./logger.js');


/**
 * Controller which glues all the pieces together.
 *
 * @param {object} Configuration for the bot, including API keys etc.
 */
var Bot = module.exports.Bot = function(options) {
    this.options = options;

    // XXX: Use real exchanges, not dummy.
    this.originExchange = new DummyExchange();
    this.remoteExchange = new DummyExchange();
};


/**
 * Start trading.
 *
 * Origin exchange:
 * 1. On "trade" event, sync orders to remote exchange.
 *
 * Remote exchange:
 * 1. On "trade" event, log them.
 * 2. On "orderbook" event, sync orders to origin exchange.
 */
Bot.prototype.start = function() {
    logger.info("Bot starting to trade.")
    // XXX: Fill this in.
};


/**
 * Reset the exchanges into a safe starting state.
 *
 * Origin exchange:
 * 1. Get trades since last state sync and clear orders. (Race condition risk?)
 * 2. Match trades on remote exchange.
 *
 * Remote exchange:
 * 1. Get outstanding orders and log them, send alerts if necessary.
 */
Bot.prototype.reset = function() {
    logger.info("Resetting exchanges into a safe state.")
    // XXX: Fill this in.
};
