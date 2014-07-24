var util = require('util'),
    BaseExchange = require('./base.js').BaseExchange,
    async = require('async'),
    BitmeClient = require('bitme');


/**
 * Liquid trading interface to Bitme.
 *
 * @param {BitmeClient} client
 * @param {number} delay Number of milliseconds to delay between ticks (default: 1000)
 * @param {boolean} pretend Don't execute any trades, just watch.
 */
var BitmeExchange = module.exports.BitmeExchange = function(client, delay, pretend) {
    BitmeExchange.super_.call(this);

    this.client = client;
    this.tickDelay = delay;
    this.tickLoop = null;
    this.pretend = pretend;
};

util.inherits(BitmeExchange, BaseExchange);

BitmeExchange.configKeys = ['BITME_KEY', 'BITME_SECRET'];


/**
 * Instantiate necessary clients based on configuration and return a
 * {@code BitmeExchange} instance.
 *
 * @param {{BITME_KEY: string, BITME_SECRET: string}}
 * @return {BitmeExchange}
 */
BitmeExchange.fromConfig = function(config) {
    var client = new BitmeClient(config.BITME_KEY, config.BITME_SECRET);
    return new BitmeExchange(client, config.tickDelay || 1000, config.pretend);
};


/**
 * Execute a unit of polling.
 */
BitmeExchange.prototype.tick = function() {
    var exchange = this;

    // TODO: Do we need to worry about tick callbacks getting out of sync due to lag?
    this.client.orderbook('BTCUSD', function(err, res) {
        if (err) return logger.error('Failure during BitmeExchange polling: %j', err);
        exchange.emit('orderbook', res.orderbook);
    });
};


/**
 * Authenticate to the API and start polling loop.
 *
 * @param {function=} callback Function called upon completion.
 */
BitmeExchange.prototype.ready = function(callback) {
    logger.debug('[Bitme] Preparing.');
    this.cleanup();

    // XXX: Load order state.

    var exchange = this;
    var series = [];

    if (!this.pretend) {
        series.push(function authenticate(callback) {
            logger.debug('[Bitme] Verifying credentials.');
            exchange.client.verifyCredentials(callback);
        })
    }
    series.push(function startPolling(callback) {
        logger.debug('[Bitme] Starting tick loop.');
        exchange.tickLoop = setInterval(exchange.tick.bind(exchange), exchange.tickDelay);
        callback && callback.call(this);
    });

    async.series(series, callback);
};


/**
 * Clear polling loop.
 *
 * @param {function=} callback Function called upon completion.
 */
BitmeExchange.prototype.cleanup = function(callback) {
    if (this.tickLoop) { clearInterval(this.tickLoop); }

    callback && callback.call(this);
};
