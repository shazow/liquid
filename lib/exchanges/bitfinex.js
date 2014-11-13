var async = require('async'),
    crypto = require('crypto'),
    request = require('request'),
    util = require('util');

var logger = require('../logger.js'),
    order = require('../order.js'),
    transaction = require('../transaction.js'),
    BaseExchange = require('./base.js').BaseExchange;


var BitfinexClient = module.exports.BitfinexClient = function(key, secret) {
    this.url = 'https://api.bitfinex.com/v1/';
    this.key = key;
    this.secret = secret;
    this.getNonce = util.counter(+new Date());
};

/**
 * Implement Bitfinex's strange header-based payloads.
 *
 * See: https://www.bitfinex.com/pages/api
 */
BitfinexClient.encode = function(params) {
    params['nonce'] = this.getNonce();

    var payload = new Buffer(JSON.stringify(params)).toString('base64');
    var signature = crypto.createHmac('sha384', this.secret).update(payload).digest('hex');
    var headers = util.mergeObjects(req.headers || {}, {
        'X-BFX-APIKEY': this.key,
        'X-BFX-PAYLOAD': payload,
        'X-BFX-SIGNATURE': signature
    });

    // We discard the form params, because they live in headers now. ¯\_(ツ)_/¯
    return headers;
};

BitfinexClient.call = function(method, resource, params, cb) {
    var req = {
        'url': this.url,
        'json': true
    };

    if (method == 'GET') {
        req['qs'] = params;
    } else {
        req['headers'] = this.encode(params);
    }

    return request(req, cb);
};


/**
 * Liquid trading interface to Bitfinex.
 *
 * @param {BitfinexClient} client
 * @param {number} delay Number of milliseconds to delay between ticks (default: 1000)
 * @param {boolean} pretend Don't execute any trades, just watch.
 */
var BitfinexExchange = module.exports.BitfinexExchange = function(client, delay, pretend) {
    BitfinexExchange.super_.call(this, pretend);

    this.client = client;
    this.tickDelay = delay;
    this.tickLoop = null;
    this.tickCount = 0;
    this.tickCompleted = 0;
    this.tickSkipAlert = 60; // Log alert if we skip this many ticks in a row.

    // This can be switched to async.map if nonce doesn't need to be strictly-incremental.
    // Use async.mapSeries if nonce must be strictly-incrementing, async.map otherwise.
    this.requestMap = async.mapSeries;
};

util.inherits(BitfinexExchange, BaseExchange);

BitfinexExchange.id = 'bitfinex';
BitfinexExchange.configKeys = ['BITFINEX_KEY', 'BITFINEX_SECRET'];


/**
 * Instantiate necessary clients based on configuration and return a
 * {@code BitfinexExchange} instance.
 *
 * @static
 * @param {{BITFINEX_KEY: string, BITFINEX_SECRET: string}}
 * @return {BitfinexExchange}
 */
BitfinexExchange.fromConfig = function(config) {
    var client = new BitfinexClient(config.apiKeys.BITFINEX_KEY, config.apiKeys.BITFINEX_SECRET);

    return new BitfinexExchange(client, config.tickDelay || 1000, config.pretend);
};


/**
 * Execute a unit of polling.
 */
BitfinexExchange.prototype.tick = function() {
    // TODO: Unstub.
};


/**
 * Authenticate to the API and start polling loop.
 *
 * @param {function=} callback Function called upon completion.
 */
BitfinexExchange.prototype.ready = function(callback) {
    // TODO: Unstub.
};


/**
 * Clear polling loop.
 *
 * @param {function=} callback Function called upon completion.
 */
BitfinexExchange.prototype.cleanup = function(callback) {
    if (this.tickLoop) { clearInterval(this.tickLoop); }

    BitfinexExchange.super_.prototype.cleanup.call(this, callback);
};


/**
 * Check whether there is sufficient balance. Callback with err if not.
 *
 * @param {number=} minQuantity Minimum BTC to expect in balance.
 * @param {number=} minValue Minimum USD to expect in balance.
 * @param {function=} callback Function called upon completion.
 */
BitfinexExchange.prototype.checkBalance = function(minQuantity, minValue, callback) {
    // TODO: Unstub.
};


/**
 * Place an instruction of orders for this exchange.
 *
 * @param {Array.<Order>} orders List of orders to place concurrently.
 * @param {function} callback
 */
BitfinexExchange.prototype.placeOrders = function(orders, callback) {
    // TODO: Unstub.
};


/**
 * Cancel orders.
 *
 * @param {Array.<Order>} orders List of orders to cancel concurrently.
 * @param {function} callback
 */
BitfinexExchange.prototype.cancelOrders = function(orders, callback) {
    // TODO: Unstub.
};


/**
 * Given a Bitfinex order (as returned by the API), return a corresponding
 * {@code Order} object.
 *
 * @static
 * @param {object} d
 * @param {boolean=} skipExecuted Don't count executed amount.
 * @return {Order}
 */
var toOrder = BitfinexExchange.toOrder = function(d, skipExecuted) {
    // TODO: Unstub.
};


/**
 * Given a Bitfinex accounts list (as returned by the API), return normalized
 * parameters for {@code BaseExchange.prototype.setBalance}.
 *
 * @static
 * @param {object} accounts
 * @return {{value: string, quantity: string}}
 */
var toBalance = BitfinexExchange.toBalance = function(accounts) {
    // TODO: Unstub.
};
