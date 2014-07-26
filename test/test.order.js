var assert = require('assert'),
    diffOrders = require('../lib/order.js').diffOrders,
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
