var BitstampRequest = require('bitstamp-request'),
    BaseExchange = require('./base.js').BaseExchange,
    PusherClient = require('pusher-client'),
    async = require('async'),
    util = require('util');


/**
 * Liquid trading interface to Bitstamp.
 *
 * @param {BitstampRequest} client
 * @param {events.EventEmitter} stream Event stream emitting 'trade' events.
 * @param {boolean} pretend Don't execute any trades, just watch.
 */

var BitstampExchange = module.exports.BitstampExchange = function(client, stream, pretend) {
    BitstampExchange.super_.call(this);
    this.id = 'bitstamp';

    this.client = client;
    this.stream = stream;
    this.orders = [];
    this.ordersById = {};
    this.pretend = pretend;
};

util.inherits(BitstampExchange, BaseExchange);

BitstampExchange.configKeys = ['BITSTAMP_CLIENT_ID', 'BITSTAMP_KEY', 'BITSTAMP_SECRET'];


/**
 * Instantiate necessary clients based on configuration and return a
 * {@code BitcoinExchange} instance.
 *
 * @param {{BITSTAMP_CLIENT_ID: string, BITSTAMP_KEY: string, BITSTAMP_SECRET: string}}
 * @return {BitstampExchange}
 */
BitstampExchange.fromConfig = function(config) {
    var stream = new PusherClient('de504dc5763aeef9ff52');
    var client = new BitstampRequest(config.BITSTAMP_CLIENT_ID, config.BITSTAMP_KEY, config.BITSTAMP_SECRET);

    return new BitstampExchange(client, stream, config.pretend);
};


BitstampExchange.prototype.ready = function(callback) {
    this.debug('Preparing.');

    // XXX: Load order state.

    var exchange = this;
    this.stream.subscribe('order_book').bind('data', function(data) {
        exchange.emit('orderbook', data);
    });

    callback && callback.call(this);
};


/**
 * Stop stream subscription.
 *
 * @param {function=} callback Function called upon completion.
 */
BitstampExchange.prototype.cleanup = function(callback) {
    this.stream.unsubscribe('order_book');
    this.stream.disconnect();

    callback && callback.call(this);
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
