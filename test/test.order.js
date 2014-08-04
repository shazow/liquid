var assert = require('assert'),
    BigNumber = require('bignumber.js'),
    patchOrders = require('../lib/order.js').patchOrders,
    diffOrders = require('../lib/order.js').diffOrders,
    sortOrders = require('../lib/order.js').sortOrders,
    getSpread = require('../lib/order.js').getSpread,
    aggregateOrders = require('../lib/order.js').aggregateOrders,
    budgetOrders = require('../lib/order.js').budgetOrders,
    totalValue = require('../lib/order.js').totalValue,
    Order = require('../lib/order.js').Order;


var toObject = function(orders) {
    return orders.map(function(o) { return o.toObject(); });
};


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

    it('should compare to other orders', function() {
        var o = new Order(null, 'ASK', '1', '100');
        assert.equal(o.comparedTo(new Order(null, 'ASK', '1', '100')), 0);
        assert.equal(o.comparedTo(new Order(null, 'ASK', '1', '95')), 1);
        assert.equal(o.comparedTo(new Order(null, 'ASK', '1', '105')), -1);
        assert.equal(o.comparedTo(new Order(null, 'BID', '1', '100')), 1);
        assert.equal(o.comparedTo(new Order(null, 'ASK', '2', '100')), -1);
        assert.equal(o.comparedTo(new Order(null, 'ASK', '0.5', '100')), 1);
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

    it('should diff missingOnly', function() {
        var changed = diffOrders(orders, [orders[0]], true);
        assert.deepEqual(changed, [orders[1]]);

        var changed = diffOrders([orders[0]], orders, true);
        assert.deepEqual(changed, []);

        var changed = diffOrders(orders, [new Order('3', 'BID', '1.0', '3')].concat(orders), true);
        assert.deepEqual(changed, []);
    });
});


describe('aggregateOrders', function() {
    var orders = [
        new Order(null, 'ASK', '1.000', '20.000'),
        new Order(null, 'ASK', '1.000', '40.000'),
        new Order(null, 'BID', '0.500', '2.000')
    ];

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

    it('should work with a single order', function() {
        var orders = [
            new Order(null, 'BID', '2', '500')
        ];
        var newOrders = aggregateOrders(orders, 0, 2.0);
        var expected = [new Order(null, 'BID', '2.0', '250')];
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


describe('budgetOrders', function() {
    it('should bundle orders that fit the budget', function() {
        var orders = [
            new Order(null, 'ASK', '0.500', '500'),
            new Order(null, 'ASK', '1.500', '550'),
            new Order(null, 'ASK', '3.000', '600'),
            new Order(null, 'ASK', '1.000', '610'),
            new Order(null, 'ASK', '0.001', '600'),
            new Order(null, 'BID', '1.000', '400'),
            new Order(null, 'BID', '1.000', '415'),
            new Order(null, 'BID', '2.000', '450'),
            new Order(null, 'BID', '2.000', '450'),
            new Order(null, 'BID', '0.001', '450')
        ];

        var expectedOrders = [
            new Order(null, 'ASK', '0.500', '500'),
            new Order(null, 'ASK', '1.500', '550'),
            new Order(null, 'ASK', '0.001', '600'),
            new Order(null, 'BID', '1.000', '400'),
            new Order(null, 'BID', '1.000', '415'),
            new Order(null, 'BID', '0.001', '450')
        ];

        var budget = {
            quantity: BigNumber(3),
            value: BigNumber(1200)
        };
        var newOrders = budgetOrders(orders, budget);
        assert.deepEqual(newOrders, expectedOrders);
    });

    it('should work with one-sided budgets', function() {
        var orders = [
            new Order(null, 'ASK', '0.500', '500'),
            new Order(null, 'BID', '1.000', '400'),
            new Order(null, 'BID', '0.001', '450')
        ];

        var budget = {
            quantity: BigNumber(3),
            value: BigNumber(0)
        };

        var newOrders = budgetOrders(orders, budget);
        assert.deepEqual(newOrders, []);

        var newOrders = budgetOrders(orders, budget);
        assert.deepEqual([], []);
    });

    it('should work with no budget', function() {
        var orders = [
            new Order(null, 'ASK', '0.500', '500'),
            new Order(null, 'BID', '1.000', '400'),
            new Order(null, 'BID', '0.001', '450')
        ];

        var newOrders = budgetOrders(orders);
        assert.deepEqual(newOrders, orders);
    });
});


describe('patchOrders', function() {
    it('should instruct single order changes', function() {
        var newOrders = [new Order(null, 'BID', '2.0', '250')];
        var instructions = patchOrders([], newOrders);
        assert.deepEqual(instructions.cancel, []);
        assert.deepEqual(instructions.place, newOrders);
    });

    it('should instruct removal of orders', function() {
        var oldOrders = [new Order(null, 'BID', '2.0', '250')];
        var instructions = patchOrders(oldOrders, []);
        assert.deepEqual(instructions.cancel, oldOrders);
        assert.deepEqual(instructions.place, []);
    });

    it('should minimize redundant trades', function() {
        var instructions = patchOrders([
            new Order(null, 'BID', '2.0', '250'),
            new Order(null, 'BID', '2.0', '300')
        ], [
            new Order(null, 'ASK', '2.0', '250'),
            new Order(null, 'BID', '2.0', '300'),
            new Order(null, 'BID', '2.0', '350')
        ]);

        assert.deepEqual(instructions.place, [
            new Order(null, 'ASK', '2.0', '250'),
            new Order(null, 'BID', '2.0', '350')
        ]);

        assert.deepEqual(instructions.cancel, [
            new Order(null, 'BID', '2.0', '250')
        ]);

        var instructions = patchOrders([
            new Order(null, 'BID', '2.0', '250'),
            new Order(null, 'BID', '2.0', '300'),
            new Order(null, 'ASK', '2.0', '350')
        ], [
            new Order(null, 'BID', '2.0', '250'),
            new Order(null, 'BID', '2.0', '300'),
            new Order(null, 'ASK', '2.0', '350')
        ]);

        assert.deepEqual(instructions.place, []);
    });
});


describe('sortOrders', function() {
    it('should sort orders by spread', function() {
        assert.deepEqual(sortOrders([
            new Order(null, 'ASK', '1.000', '60.000'),
            new Order(null, 'ASK', '1.000', '30.000'),
            new Order(null, 'ASK', '1.000', '40.000'),
            new Order(null, 'ASK', '1.000', '20.000')
        ]), [
            new Order(null, 'ASK', '1.000', '20.000'),
            new Order(null, 'ASK', '1.000', '30.000'),
            new Order(null, 'ASK', '1.000', '40.000'),
            new Order(null, 'ASK', '1.000', '60.000')
        ], 0);

        assert.deepEqual(sortOrders([
            new Order(null, 'ASK', '1.000', '60.000'),
            new Order(null, 'ASK', '1.000', '30.000'),
            new Order(null, 'ASK', '1.000', '40.000'),
            new Order(null, 'ASK', '1.000', '20.000')
        ], 34), [
            new Order(null, 'ASK', '1.000', '30.000'),
            new Order(null, 'ASK', '1.000', '40.000'),
            new Order(null, 'ASK', '1.000', '20.000'),
            new Order(null, 'ASK', '1.000', '60.000')
        ]);
    });

    it('should sort deterministically', function() {
        assert.deepEqual(sortOrders([
            new Order(null, 'ASK', '1.000', '499.000'),
            new Order(null, 'ASK', '1.000', '501.000')
        ], 500), [
            new Order(null, 'ASK', '1.000', '499.000'),
            new Order(null, 'ASK', '1.000', '501.000')
        ]);

        assert.deepEqual(sortOrders([
            new Order(null, 'ASK', '1.000', '501.000'),
            new Order(null, 'ASK', '1.000', '499.000')
        ], 500), [
            new Order(null, 'ASK', '1.000', '499.000'),
            new Order(null, 'ASK', '1.000', '501.000')
        ]);
    });

    it('should place BIDs first when other things are equal', function() {
        assert.deepEqual(sortOrders([
            new Order(null, 'ASK', '1.000', '30.000'),
            new Order(null, 'BID', '1.000', '30.000'),
            new Order(null, 'BID', '1.000', '40.000'),
            new Order(null, 'ASK', '1.000', '40.000')
        ]), [
            new Order(null, 'BID', '1.000', '30.000'),
            new Order(null, 'ASK', '1.000', '30.000'),
            new Order(null, 'BID', '1.000', '40.000'),
            new Order(null, 'ASK', '1.000', '40.000')
        ]);
    });
});


describe('getSpread', function() {
    it('should compute the spread of orders', function() {
        var spread = getSpread([
            new Order(null, 'ASK', '1.000', '101.000'),
            new Order(null, 'ASK', '1.000', '104.000'),
            new Order(null, 'ASK', '1.000', '106.000'),
            new Order(null, 'BID', '1.000', '99.000'),
            new Order(null, 'BID', '1.000', '85.000'),
            new Order(null, 'BID', '1.000', '40.000')
        ]);

        assert.equal(Math.round(spread.percent), 2);
        delete spread['percent'];

        assert.deepEqual(spread, {
            bid: 99,
            ask: 101,
            amount: 2,
            numBids: 3,
            numAsks: 3,
            mean: 100,
            totalValue: 535,
            totalQuantity: 6
        });
    });

    it('should handle one-sided orderbooks', function() {
        var spread = getSpread([
            new Order(null, 'ASK', '1.000', '101.000'),
            new Order(null, 'ASK', '1.000', '104.000'),
            new Order(null, 'ASK', '1.000', '106.000'),
        ]);

        assert.deepEqual(spread, {
            bid: null,
            ask: 101,
            numBids: 0,
            numAsks: 3,
            percent: undefined,
            amount: undefined,
            mean: 101,
            totalValue: 311,
            totalQuantity: 3
        });

    });
});
