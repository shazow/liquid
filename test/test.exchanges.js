var assert = require('assert'),
    DummyExchange = require('../lib/exchanges/dummy.js').DummyExchange;
    Order = require('../lib/order.js').Order;


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
            'bids': [new Order('foo', 'BID', 1, 1)],
            'asks': [new Order('bar', 'BID', 1, 1), new Order('baz', 'BID', 1, 1)]
        };
        exchange.replaceOrders(startOrders);
        assert.deepEqual(exchange.getOrders(), startOrders);

        var newOrders = {
            'bids': [new Order('baz', 'BID', 1, 1), new Order('etc', 'BID', 1, 1)],
            'asks': [new Order('quux', 'BID', 1, 1)]
        };
        exchange.replaceOrders(newOrders);
        assert.deepEqual(exchange.getOrders(), newOrders);

        exchange.replaceOrders({});
        assert.deepEqual(exchange.getOrders(), {
            'bids': [],
            'asks': []
        });
    });
});
