var assert = require('assert'),
    BitmeExchange = require('../lib/exchanges/bitme.js').BitmeExchange;
    DummyExchange = require('../lib/exchanges/dummy.js').DummyExchange;
    Order = require('../lib/order.js').Order;


// Simple helper for cloning objects.
var jsonClone = function(o) {
    return JSON.parse(JSON.stringify(o));
};


describe('Exchanges', function() {

    describe('DummyExchange', function() {
        it('should start empty', function() {
            var exchange = new DummyExchange();
            var orders = exchange.getOrders();
            assert.deepEqual(orders, []);
        });

        it('should increment the internal counter', function() {
            var exchange = new DummyExchange();

            assert.equal(exchange.idCounter, 0);

            var o1 = new Order(null, 'BID', 1, 1);
            var o2 = new Order('hascount', 'BID', 1, 1);
            var o3 = new Order(null, 'BID', 1, 1);

            exchange.placeOrders([o1, o2, o3]);

            assert.equal(exchange.idCounter, 2);
            assert.equal(o1.id, '1');
            assert.equal(o2.id, 'hascount');
            assert.equal(o3.id, '2');
        });

        it('should replace all orders', function() {
            var exchange = new DummyExchange();

            var startOrders = [
                new Order('foo', 'BID', 1, 1),
                new Order('bar', 'ASK', 1, 1),
                new Order('baz', 'ASK', 1, 1)
            ];
            exchange.replaceOrders(startOrders);
            assert.deepEqual(exchange.getOrders(), startOrders);

            var newOrders = [
                new Order('baz', 'BID', 1, 1),
                new Order('etc', 'BID', 1, 1),
                new Order('quux', 'ASK', 1, 1)
            ];
            exchange.replaceOrders(newOrders);
            assert.deepEqual(exchange.getOrders(), newOrders);

            exchange.replaceOrders([]);
            assert.deepEqual(exchange.getOrders(), []);
        });
    });


    describe('BitmeExchange', function() {
        var sampleOrders = [
            {
                "uuid": "20ade3fd-6161-4edc-89aa-90b5e82b30e5",
                "order_type_cd": "BID",
                "rate": "0.50000000000000000000",
                "quantity": "2.00000000000000000000",
                "executed": "0.00000000000000000000",
            },
            {
                "uuid": "a3b34de8-f4d1-4e77-918f-12cd8f194b28",
                "order_type_cd": "ASK",
                "rate": "1.00000000000000000000",
                "quantity": "40.00000000000000000000",
                "executed": "5.00000000000000000000",
            }
        ];

        it('should convert orders', function() {
            var o = BitmeExchange.toOrder(sampleOrders[0]);
            assert.equal(o.id, '20ade3fd-6161-4edc-89aa-90b5e82b30e5');
            assert.equal(o.exchange, 'bitme');
            assert.equal(o.type, 'BID');
            assert.equal(o.quantity, 2);
            assert.equal(o.rate, 0.5);

            var o = BitmeExchange.toOrder(sampleOrders[1]);
            assert.equal(o.id, 'a3b34de8-f4d1-4e77-918f-12cd8f194b28');
            assert.equal(o.exchange, 'bitme');
            assert.equal(o.type, 'ASK');
            assert.equal(o.quantity, 35);
            assert.equal(o.rate, 1);
        });

        it('should diff orders', function() {
            var changed = BitmeExchange.diffOrders(sampleOrders, sampleOrders);
            assert.equal(changed.length, 0);

            var changed = BitmeExchange.diffOrders(sampleOrders, []);
            assert.equal(changed.length, 2);

            var changed = BitmeExchange.diffOrders([], sampleOrders);
            assert.equal(changed.length, 0);

            var changedOrders = jsonClone(sampleOrders);
            changedOrders[0].executed = "0.50000000000000000000";
            var changed = BitmeExchange.diffOrders(sampleOrders, changedOrders);
            assert.equal(changed.length, 1);
            assert.equal(changed[0].quantity, 0.5);
        });
    });

});
