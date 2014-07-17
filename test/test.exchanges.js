var assert = require('assert'),
    DummyExchange = require('../lib/exchanges/dummy.js').DummyExchange;


describe('Dummy Exchange', function() {
    var exchange = new DummyExchange();

    it('should start empty', function() {
        var orders = exchange.getOrders();
        assert.deepEqual(orders, {
            'bids': [],
            'asks': []
        });
    });

    it('should replace all orders', function() {
        var startOrders = {
            'bids': ['foo'],
            'asks': ['bar', 'baz']
        }
        exchange.replaceOrders(startOrders);
        assert.deepEqual(exchange.getOrders(), startOrders);

        var newOrders = {
            'bids': ['baz', 'etc'],
            'asks': ['quux']
        }
        exchange.replaceOrders(newOrders);
        assert.deepEqual(exchange.getOrders(), newOrders);

        exchange.replaceOrders({});
        assert.deepEqual(exchange.getOrders(), {
            'bids': [],
            'asks': []
        });
    });
});
