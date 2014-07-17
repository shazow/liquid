var assert = require('assert'),
    DummyExchange = require('../lib/exchanges/dummy.js').DummyExchange;


describe('Dummy Exchange', function() {
    var exchange = new DummyExchange();

    it('should start empty', function() {
        var orders = exchange.getOrders();
        assert.deepEqual(orders, {
            "bids": [],
            "asks": []
        });
    });
});
