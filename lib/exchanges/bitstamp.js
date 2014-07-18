var BitstampSocket = require('bitstamp-ws'),
    BitstampRequest = require('bitstamp-request');


/**
 * Liquid trading interface to Bitstamp.
 *
 *     var BitstampRequest = require('bitstamp-request');
 *     var client = new BitstampRequest(bitstamp_customer_id, bitstamp_api_key, bitstamp_api_secret);
 *     var bitstampExchange = new BitstampExchange(client);
 *
 * @param {Object} client Authenticated Bitstamp request client instance.
 */

var BitstampExchange = module.exports.BitstampExchange = function(client) {
    this.client = client;
    this.ws = null;
    this.orders = [];
    this.ordersById = {};
};

BitstampExchange.prototype.loadState = function(orders) {
    var ordersById = {};
    orders.forEach(function(order) {
        ordersById[order.id] = order;
    });

    this.orders = orders;
    this.ordersById = ordersById;
};

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
