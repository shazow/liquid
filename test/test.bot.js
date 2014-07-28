var assert = require('assert'),
    async = require('async'),
    DummyExchange = require('../lib/exchanges/dummy.js').DummyExchange;
    Bot = require('../lib/bot.js').Bot;
    Order = require('../lib/order.js').Order,
    logger = require('../lib/logger.js');


describe('Bot', function() {
    logger.level = 'warn';

    it('should change state', function() {
        var exch1 = new DummyExchange('1');
        var exch2 = new DummyExchange('2');

        var bot = new Bot(exch1, exch2);
        assert.equal(bot.state, 'idle');

        bot.start(function(err) {
            assert.equal(err, undefined);
            assert.equal(bot.state, 'start');
        })

        bot.stop(function() {
            assert.equal(bot.state, 'idle');
        });
    });

    // Taken from Bitstamp streaming API.
    var remoteOrderbook = {"bids":[["596.01","1.39000000"],["596.00","20.17000000"],["595.43","1.83700000"],["594.98","8.00000000"],["594.97","2.25000000"],["594.90","0.16809421"],["594.88","0.16809985"],["594.84","1.19000000"],["594.72","1.95962000"],["594.62","0.16817328"],["594.55","0.33638612"],["594.51","0.16820437"],["594.32","0.16826091"],["594.27","0.09335400"],["594.26","2.00000000"],["594.25","1.32700000"],["594.22","0.33657840"],["594.16","0.16830618"],["594.06","0.71699828"],["593.99","0.06532800"]],"asks":[["597.00","111.14977028"],["597.01","0.06767000"],["597.02","0.16850450"],["597.03","0.16749677"],["597.06","0.06766500"],["597.10","0.12000000"],["597.11","0.06765900"],["597.12","0.03349410"],["597.14","0.16847047"],["597.16","0.06765300"],["597.21","0.23609863"],["597.24","0.03035751"],["597.26","0.06764200"],["597.27","0.03348569"],["597.28","0.33485318"],["597.31","0.06763600"],["597.33","0.16741256"],["597.36","0.06763000"],["597.40","0.16739293"],["597.42","0.26848960"]]};

    describe('Trade Scenarios', function() {
        var origin = new DummyExchange('origin');
        var remote = new DummyExchange('remote');
        var bot = new Bot(origin, remote, premium=2.0);

        it('should react to remote orderbook updates (from empty)', function(done) {
            var orderbook = {
                'bids': [new Order(null, 'BID', '2', '500')],
                'asks': []
            };

            bot.handleRemoteOrderbook(orderbook, function() {
                var originOrders = origin.getOrders();
                assert.equal(originOrders.length, 1);
                assert.equal(originOrders[0].type, 'BID');
                assert.equal(originOrders[0].quantity.toFixed(), '2');
                assert.equal(originOrders[0].rate.toFixed(), '250');

                done();
            });
        });

        it('should react to remote orderbook updates (partial update)', function(done) {
            var orderbook = {
                'bids': [
                    new Order(null, 'BID', '2', '500'),
                    new Order(null, 'BID', '1.5', '300')
                ],
                'asks': [
                    new Order(null, 'ASK', '10', '700')
                ]
            };

            bot.handleRemoteOrderbook(orderbook, function() {
                var originOrders = origin.getOrders();
                assert.equal(originOrders.length, 3);

                var types = originOrders.map(function(o) { return o.type; }).sort();
                assert.deepEqual(types, ['ASK', 'ASK', 'BID']);

                var rates = originOrders.map(function(o) { return o.rate.toFixed(); }).sort();
                assert.deepEqual(rates, ['350', '600', '1000']);

                done();
            });
        });

        it('should react to matched origin trades', function(done) {
            var someTrade = origin.getOrders()[0];
            assert(someTrade);

            assert.equal(remote.getOrders().length, 0);
            bot.handleOriginTrade(someTrade, function() {
                var remoteOrders = remote.getOrders()
                assert.equal(remoteOrders.length, 1);
                assert.equal(originOrders[0].type, 'BID');
                assert.equal(originOrders[0].quantity.toFixed(), '2');
                assert.equal(originOrders[0].rate.toFixed(), '500');

                done();
            });
        });
    });
});
