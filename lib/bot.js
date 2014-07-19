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
 */
Bot.prototype.start = function() {
    logger.info("Bot starting.")
    // XXX: Fill this in.
};
