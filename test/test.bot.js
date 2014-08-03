var assert = require('assert'),
    async = require('async'),
    DummyExchange = require('../lib/exchanges/dummy.js').DummyExchange;
    Bot = require('../lib/bot.js').Bot;
    Order = require('../lib/order.js').Order,
    totalValue = require('../lib/order.js').totalValue,
    logger = require('../lib/logger.js');


describe('Bot', function() {
    logger.level = 'error';

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

    describe('Trade Scenarios', function() {
        var origin = new DummyExchange('origin');
        var remote = new DummyExchange('remote');
        var bot = new Bot(origin, remote, {premium: 2.0, stopAfter: 2});

        it('should instantiate the bot correctly', function(done) {
            assert.equal(bot.premium, 2.0);
            assert.equal(bot.minValue, undefined);
            assert.equal(bot.resetOnly, undefined);
            assert.equal(bot.maxOrders, undefined);
            assert.deepEqual(bot.dumpState().stats, {
                numMatched: 0,
                valueMatched: 0,
                numPending: 0,
                valuePending: 0,
                premiumProfit: 0
            });

            assert.equal(bot.state, 'idle');
            bot.start(function() {
                assert.equal(bot.state, 'start');
                done();
            });
        });

        it('should react to remote orderbook updates (from empty)', function(done) {
            var orderbook = {
                'bids': [new Order(null, 'BID', '2', '500')],
                'asks': []
            };

            assert.equal(origin.getOrders().length, 0);
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

                var expectedValue = {'asks': 14000, 'bids': 725};
                assert.deepEqual(totalValue(originOrders), expectedValue);

                done();
            });
        });

        it('should react to matched origin trades', function(done) {
            var someTrade = new Order(null, 'ASK', '10', '700');

            assert.equal(remote.getOrders().length, 0);
            bot.handleOriginTrade(someTrade, function() {
                var remoteOrders = remote.getOrders()
                assert.equal(remoteOrders.length, 1);
                assert.equal(remoteOrders[0].type, 'BID');
                assert.equal(remoteOrders[0].quantity.toFixed(), '10');
                assert.equal(remoteOrders[0].rate.toFixed(), '350');

                assert.deepEqual(bot.dumpState().stats, {
                    numMatched: 0,
                    valueMatched: 0,
                    numPending: 1,
                    valuePending: 3500,
                    premiumProfit: 0
                });

                done();
            });
        });

        it('should react to completed trades', function(done) {
            var order = remote.getOrders()[0];
            remote.deleteOrder(order);

            bot.handleRemoteTrade(order, function() {
                assert.deepEqual(bot.dumpState().stats, {
                    numMatched: 1,
                    valueMatched: 7000,
                    numPending: 0,
                    valuePending: 0,
                    premiumProfit: 3500
                });

                done();
            });
        });

        it('should stop trading after stopAfter is reached', function(done) {
            assert.equal(bot.state, 'start');

            // Inject a fake order just to test the condition. It will go into
            // the negatives, but oh well.
            var order = new Order(null, 'ASK', '1', '700');
            bot.handleOriginTrade(order, function() {
                assert.deepEqual(bot.dumpState().stats, {
                    numMatched: 1,
                    valueMatched: 7000,
                    numPending: 1,
                    valuePending: 700,
                    premiumProfit: 3500
                });

                assert.equal(bot.state, 'idle');
                done();
            });

        });
    });
});
