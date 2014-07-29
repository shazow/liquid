var assert = require('assert'),
    BigNumber = require('bignumber.js'),
    diffOrders = require('../lib/order.js').diffOrders,
    aggregateOrders = require('../lib/order.js').aggregateOrders,
    totalValue = require('../lib/order.js').totalValue,
    Order = require('../lib/order.js').Order;


describe('Order', function() {
    it('should convert string numbers', function() {
        var order = new Order(null, 'ASK', '0.123', '456');
        assert.equal(order.quantity, 0.123);
        assert.equal(order.rate, 456);
        assert.equal(order.type, 'ASK');
    });

    it('should provide a clone with overrides', function() {
        var order = new Order(null, 'ASK', '0.123', '456');
        var newOrder = order.clone({'quantity': '3.21', 'type': 'BID'});

        assert.equal(newOrder.quantity, 3.21);
        assert.equal(newOrder.rate, 456);
        assert.equal(newOrder.type, 'BID');

        var newOrder = order.clone({}, 2.0, true);
        assert.equal(newOrder.quantity, 0.123);
        assert.equal(newOrder.rate, 456/2);
        assert.equal(newOrder.type, 'BID');
    });

    it('should return the correct premium by type', function() {
        // Selling 1 at $100
        var ask = new Order(null, 'ASK', '1', '100');
        assert.equal(ask.getPremiumRate(1.05).toFixed(), '105');

        // Buying 1 at $100
        var bid = new Order(null, 'BID', '1', '100');
        assert.equal(bid.getPremiumRate(1.05).toFixed(1), '95.2');
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
        new Order(null, 'ASK', '1.000', '20.000'),
        new Order(null, 'ASK', '1.000', '40.000'),
        new Order(null, 'BID', '0.500', '2.000')
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
        var expected = [new Order(null, 'ASK', '2.0', '30')];
        assert.deepEqual(newOrders, expected);
    });

    it('should recommend orders with premium', function() {
        // Half on bids, double on asks.
        var newOrders = aggregateOrders(orders, 0, 2.0);
        assert.equal(newOrders[0].rate, 40);
        assert.equal(newOrders[1].rate, 80);
        assert.equal(newOrders[2].rate, 1);

    });

    it('should apply premium to reach a viable order', function() {
        var newOrders = aggregateOrders(orders, 65, 1.1);
        var expected = [new Order(null, 'ASK', '2.0', '33')];
        assert.deepEqual(newOrders, expected);
    });

    it('should aggregate multiple orders', function() {
        var orders = [
            new Order(null, 'ASK', '0.500', '500'),
            new Order(null, 'ASK', '1.500', '550'),
            new Order(null, 'ASK', '3.000', '600'),
            new Order(null, 'ASK', '1.000', '610'), // Skipped
            new Order(null, 'ASK', '0.001', '600'), // Skipped
            new Order(null, 'BID', '1.000', '400'),
            new Order(null, 'BID', '1.000', '415'),
            new Order(null, 'BID', '2.000', '450'),
            new Order(null, 'BID', '2.000', '450'),
            new Order(null, 'BID', '0.001', '450')  // Skipped
        ];

        var expectedValue = totalValue([
            new Order(null, 'ASK', '0.500', '500'),
            new Order(null, 'ASK', '1.500', '550'),
            new Order(null, 'ASK', '3.000', '600'),
            new Order(null, 'BID', '1.000', '400'),
            new Order(null, 'BID', '1.000', '415'),
            new Order(null, 'BID', '2.000', '450'),
            new Order(null, 'BID', '2.000', '450'),
        ]);

        var expectedOrders = [
            new Order(null, 'ASK', '2', '537.5'),     // 2 Orders
            new Order(null, 'ASK', '3', '600'),       // 1
            new Order(null, 'BID', '2.000', '407.5'), // 2
            new Order(null, 'BID', '2.000', '450'),   // 1
            new Order(null, 'BID', '2.000', '450'),   // 1
        ];

        var newOrders = aggregateOrders(orders, 700);
        assert.deepEqual(totalValue(newOrders), expectedValue);
        assert.deepEqual(newOrders, expectedOrders);
    });
});
