var assert = require('assert'),
    DummyExchange = require('../lib/exchanges/dummy.js').DummyExchange;
    Order = require('../lib/order.js').Order;


describe('Dummy Exchange', function() {
    it('should start empty', function() {
        var exchange = new DummyExchange();
        var orders = exchange.getOrders();
        assert.deepEqual(orders, {
            'bids': [],
            'asks': []
        });
    });

    it('should increment the internal counter', function() {
        var exchange = new DummyExchange();

        assert.equal(exchange.idCounter, 0);

        var o1 = new Order(null, 'BID', 1, 1);
        var o2 = new Order('hascount', 'BID', 1, 1);
        var o3 = new Order(null, 'BID', 1, 1);

        exchange.placeOrders({
            'asks': [o1, o2, o3],
        });

        assert.equal(exchange.idCounter, 2);
        assert.equal(o1.id, '1');
        assert.equal(o2.id, 'hascount');
        assert.equal(o3.id, '2');
    });

    it('should replace all orders', function() {
        var exchange = new DummyExchange();

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
