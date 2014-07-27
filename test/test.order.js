var assert = require('assert'),
    diffOrders = require('../lib/order.js').diffOrders,
    aggregateOrders = require('../lib/order.js').aggregateOrders,
    Order = require('../lib/order.js').Order;


describe('Order', function() {
    it('should convert string numbers', function() {
        var order = new Order(null, 'ASK', '0.123', '456');
        assert(order.quantity.eq(0.123));
        assert(order.rate.eq(456));
        assert.equal(order.type, 'ASK');
    });

    it('should provide a clone with overrides', function() {
        var order = new Order(null, 'ASK', '0.123', '456');
        var newOrder = order.clone({'quantity': '3.21', 'type': 'BID'})

        assert(newOrder.quantity.eq(3.21));
        assert(newOrder.rate.eq(456));
        assert.equal(newOrder.type, 'BID');
    });
});


describe('diffOrders', function() {
    var orders = [
        new Order('1', 'BID', '0.500', '2.000'),
        new Order('2', 'ASK', '1.000', '35.000')
    ];

    it('should diff one-way', function() {
        var changed = diffOrders(orders, orders);
        assert.equal(changed.length, 0);

        var changed = diffOrders(orders, []);
        assert.equal(changed.length, 2);

        var changed = diffOrders([], orders);
        assert.equal(changed.length, 0);
    });

    it('should yield quantity changs', function() {
        var changedOrders = orders.map(Order.prototype.clone);
        changedOrders[0].quantity = changedOrders[0].quantity.minus(0.5);

        var changed = diffOrders(orders, changedOrders);
        assert.equal(changed.length, 1);
        assert.equal(changed[0].quantity, 0.5);
    });
});


describe('aggregateOrders', function() {
    var orders = [
        new Order(null, 'ASK', '0.500', '2.000'),
        new Order(null, 'BID', '1.000', '20.000'),
        new Order(null, 'BID', '1.000', '40.000')
    ];

    var toObject = function(orders) {
        return orders.map(function(o) { return o.toObject(); });
    };

    it('should act as a passthrough with no optional args', function() {
        var newOrders = aggregateOrders(orders);
        assert.equal(newOrders.length, 3);
        assert.deepEqual(newOrders, orders)
    });

    it('should act as a passthrough with smaller min', function() {
        var newOrders = aggregateOrders(orders, 0.001);
        assert.equal(newOrders.length, 3);
        assert.deepEqual(newOrders, orders)
    });

    it('should act discard orders not exceeding min', function() {
        var newOrders = aggregateOrders(orders, 5000);
        assert.equal(newOrders.length, 0);
    });

    it('should combine viable orders', function() {
        var newOrders = aggregateOrders(orders, 50);
        assert.deepEqual(newOrders, [new Order(null, 'BID', '2.0', '30')]);
    });

    it('should apply premium to reach a viable order', function() {
        var newOrders = aggregateOrders(orders, 65, 1.1);
        assert.deepEqual(newOrders, [new Order(null, 'BID', '2.0', '33')]);
    });
});
