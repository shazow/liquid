var assert = require('assert'),
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
