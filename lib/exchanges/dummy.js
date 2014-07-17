var Emitter = require('events').EventEmitter;

/**
 * Dummy liquid trading interface for testing.
 */

var DummyExchange = module.exports.DummyExchange = function() {
    this.bids = [];
    this.asks = [];
    this.events = new Emitter();
};

DummyExchange.prototype.watchTrades = function(fn) {
}
