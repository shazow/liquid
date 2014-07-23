var BitstampSocket = require('bitstamp-ws'),
    BitstampRequest = require('bitstamp-request'),
    util = require('../util.js');


/**
 * Liquid trading interface to Bitstamp.
 *
 *     var BitstampRequest = require('bitstamp-request');
 *     var client = new BitstampRequest(bitstamp_customer_id, bitstamp_api_key, bitstamp_api_secret);
 *     var bitstampExchange = new BitstampExchange(client);
 *
 * @param {BitstampRequest} client Authenticated Bitstamp request client instance.
 */

var BitstampExchange = module.exports.BitstampExchange = function(client) {
    this.client = client;
    this.ws = null;
    this.orders = [];
    this.ordersById = {};
};

BitstampExchange.configKeys = ['BITSTAMP_CLIENT_ID', 'BITSTAMP_KEY', 'BITSTAMP_SECRET'];

/**
 * Instantiate necessary clients based on configuration and return a
 * {@code BitcoinExchange} instance.
 *
 * @param {{BITSTAMP_CLIENT_ID: string, BITSTAMP_KEY: string, BITSTAMP_SECRET: string}}
 * @return {BitstampExchange}
 */
BitstampExchange.fromConfig = function(config) {
    if (!util.hasStringValues(config, BitstampExchange.configKeys)) {
        throw new Error('Failed to create BitstampExchange, missing API keys.');
    }

    var client = new BitstampRequest(
            config.BITSTAMP_CLIENT_ID,
            config.BITSTAMP_KEY,
            config.BITSTAMP_SECRET);
    return new BitstampExchange(client);
};

BitstampExchange.prototype.loadState = function(orders) {
    var ordersById = {};
    orders.forEach(function(order) {
        ordersById[order.id] = order;
    });

    this.orders = orders;
    this.ordersById = ordersById;
};

// XXX: ...
BitstampExchange.prototype.getOrders = function() {};

BitstampExchange.prototype.placeOrders = function() {};

BitstampExchange.prototype.clearOrders = function() {};

BitstampExchange.prototype.replaceOrders = function() {};

BitstampExchange.prototype.watchOrders = function(fn) {
    if (!this.ws) {
        this.ws = new BitstampSocket();
    }

    ws.on('trade', fn);
};
