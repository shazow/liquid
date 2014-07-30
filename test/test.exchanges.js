var assert = require('assert'),
    DummyExchange = require('../lib/exchanges/dummy.js').DummyExchange,
    BitmeExchange = require('../lib/exchanges/bitme.js').BitmeExchange,
    BitstampExchange = require('../lib/exchanges/bitstamp.js').BitstampExchange,
    diffOrders = require('../lib/order.js').diffOrders,
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
    });


    describe('BitstampExchange', function() {
        var sampleOrders = [
            {
                "id": "1000",
                "type": "0",
                "price": "100",
                "amount": "2",
            },
            {
                "id": "1001",
                "type": "1",
                "price": "200",
                "amount": "3",
            }
        ];

        // Taken from the streaming API.
        var sampleOrderbook = {"bids":[["585.30","1.14200000"],["585.29","0.53417109"],["585.27","3.60477565"],["585.23","4.00000000"],["585.20","0.01367054"],["585.15","0.06835900"],["585.14","0.02563489"],["585.13","0.05023600"],["585.11","17.26403859"],["585.10","7.56908182"],["585.09","0.25000000"],["585.08","0.02800000"],["585.05","0.25227102"],["585.00","0.22437600"],["584.99","0.03418861"],["584.95","0.06838200"],["584.92","0.17096224"],["584.90","0.06838800"],["584.88","0.01269787"],["584.85","0.06839400"]],"asks":[["588.92","1.81800000"],["588.93","0.13393781"],["589.27","0.21388678"],["589.29","0.10000000"],["589.41","2.65000000"],["589.42","1.74600000"],["589.52","0.16962984"],["589.93","3.53380000"],["589.94","0.50000000"],["589.97","0.46758497"],["590.00","25.63201000"],["590.01","1.18900000"],["590.04","0.12000000"],["590.25","0.17043537"],["590.27","0.17042956"],["590.28","0.07000000"],["590.43","0.49038315"],["590.44","0.17038025"],["590.52","0.42000000"],["590.55","0.16933368"]]} 

        it('should convert orders', function() {
            var o = BitstampExchange.toOrder(sampleOrders[0]);
            assert.equal(o.id, '1000');
            assert.equal(o.exchange, 'bitstamp');
            assert.equal(o.type, 'BID');
            assert.equal(o.quantity, 2);
            assert.equal(o.rate, 100);

            var o = BitstampExchange.toOrder(sampleOrders[1]);
            assert.equal(o.id, '1001');
            assert.equal(o.exchange, 'bitstamp');
            assert.equal(o.type, 'ASK');
            assert.equal(o.quantity, 3);
            assert.equal(o.rate, 200);
        });

        it('should convert orderbooks', function() {
            var orderbook = BitstampExchange.toOrderbook(sampleOrderbook);
            assert.equal(orderbook.bids.length, 20);
            assert.equal(orderbook.asks.length, 20);

            var order = orderbook.bids[0];
            assert.equal(order.id, null);
            assert.equal(order.type, 'BID');
            assert.equal(order.quantity, 1.142);
            assert.equal(order.rate, 585.30);
        });
    });
});
