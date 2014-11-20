var assert = require('assert'),
    async = require('async'),
    DummyExchange = require('../lib/exchanges/dummy.js').DummyExchange,
    BitmeExchange = require('../lib/exchanges/bitme.js').BitmeExchange,
    Bot = require('../lib/bot.js').Bot,
    SampleHistory = require('../lib/bot.js').SampleHistory,
    Order = require('../lib/order.js').Order,
    totalValue = require('../lib/order.js').totalValue,
    jsonClone = require('../lib/util.js').jsonClone,
    logger = require('../lib/logger.js');

var BitmeClientMock = require('./mocks/bitme.js');


logger.level = false;


function createTradeScenarios(origin, remote) {
    return function() {
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
                assert.equal(bot.state, 'ready');
                done();
            });
        });

        it('should react to remote orderbook updates (from empty)', function() {
            bot.handleRemoteOrderbook([], function() {
                var originOrders = origin.getOrders();
                assert.equal(originOrders.length, 0);
            });

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
            assert.equal(bot.state, 'ready');

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
    };
};


describe('Bot', function() {
    it('should change state', function() {
        var exch1 = new DummyExchange('1');
        var exch2 = new DummyExchange('2');

        var bot = new Bot(exch1, exch2);
        assert.equal(bot.state, 'idle');

        bot.start(function(err) {
            assert.equal(err, undefined);
            assert.equal(bot.state, 'ready');
        })

        bot.stop(function() {
            assert.equal(bot.state, 'idle');
        });
    });

    it('should alert on low balance', function() {
        var exch1 = new DummyExchange('1');
        var exch2 = new DummyExchange('2');
        var bot = new Bot(exch1, exch2);

        exch1.setBalance(0, 0); // Not enough balance

        var testTransport = new logger.transports.Memory({level: 'alert'});
        testTransport.name = 'testTransport';
        logger.add(testTransport, null, true);

        var orderbook = {
            'bids': [
                new Order(null, 'BID', '2', '500'),
                new Order(null, 'BID', '1.5', '300')
            ],
            'asks': [
                new Order(null, 'ASK', '10', '700')
            ]
        };

        // Place an order pre-emptively
        exch1.placeOrders(orderbook['bids']);
        bot.handleRemoteOrderbook(orderbook);
        assert.equal(testTransport.writeOutput.length, 0);

        exch1.clearOrders();
        bot.handleRemoteOrderbook(orderbook);
        assert.equal(testTransport.writeOutput.length, 1);
        assert(testTransport.writeOutput[0].match(/alert: \s*Balance too low to make any of 3 aggregated trades./));
        logger.remove(testTransport);
    });

    describe('BitmeClientMock', function() {
        function makeBot() {
            var bitmeClient = new BitmeClientMock();
            var origin = new BitmeExchange(bitmeClient, false, false);
            var remote = new DummyExchange('remote');
            var bot = new Bot(origin, remote, {premium: 2.0});
            return bot;
        };

        it('should recover from start failures: credentials', function(done) {
            var bot = makeBot();

            bot.originExchange.client.inject('verifyCredentials', function(cb) {
                cb('Failed verifyCredentials');
            });

            bot.start(function(err) {
                assert(err);
                assert.equal(bot.state, 'idle');
                done();
            });
        });

        it('should recover from start failures: account balance', function(done) {
            var bot = makeBot();

            bot.originExchange.client.inject('accounts', function(cb) {
                cb('Failed accounts');
            });

            bot.start(function(err) {
                assert(err);
                assert.equal(bot.state, 'idle');
                done();
            });
        });

        it('should place and cancel orders', function(done) {
            var bitmeClient = new BitmeClientMock();

            var orderId;
            async.series([
                function startNoOrders(callback) {
                    bitmeClient.ordersOpen(function(err, response) {
                        assert.equal(response.orders.length, 0);
                        callback();
                    });
                },
                function placeOrder(callback) {
                    bitmeClient.orderCreate('BTCUSD', 'ASK', '123', '456', function(err, response) {
                        assert.equal(response.order.quantity, '123');
                        assert.equal(response.order.rate, '456');
                        callback();
                    });
                },
                function checkOrders(callback) {
                    bitmeClient.ordersOpen(function(err, response) {
                        assert.equal(response.orders.length, 1);
                        orderId = response.orders[0].uuid
                        callback();
                    });
                },
                function cancelOrder(callback) {
                    bitmeClient.orderCancel(orderId, function(err, response) {
                        assert(!err);
                        assert.equal(response.order.uuid, orderId);
                        callback();
                    });
                },
                function checkOrders(callback) {
                    bitmeClient.ordersOpen(function(err, response) {
                        assert.equal(response.orders.length, 0);
                        callback();
                    });
                }], done);
        });

        it('should start with the bot', function(done) {
            var bot = makeBot();

            bot.start(function() {
                assert.equal(bot.state, 'ready');
                bot.stop(done);
            });
        });


        it('should perform trades', function(done) {
            var bot = makeBot();
            var origin = bot.originExchange;
            var remote = bot.remoteExchange;

            bot.start()

            assert.equal(remote.getOrders().length, 0);
            assert.equal(origin.getOrders().length, 0);

            // Order added
            remote.orderbook = [new Order(null, 'ASK', '1', '700')];
            remote.tick();

            var orders = origin.getOrders();
            assert.equal(orders.length, 1);
            assert.equal(orders[0].quantity, 1);
            assert.equal(orders[0].rate, 1400);

            // Price changed
            remote.orderbook = [new Order(null, 'ASK', '0.5', '700')];
            remote.tick();

            var orders = origin.getOrders();
            assert.equal(orders.length, 1);
            assert.equal(orders[0].quantity, 0.5);
            assert.equal(orders[0].rate, 1400);

            // Fake order executed by cancelling out of band
            origin.client.orderCancel(orders[0].id);
            assert.equal(origin.client._orders.length, 0);
            assert.equal(origin.getOrders().length, 1);
            origin.tick();

            // Order should be reciprocated now.
            assert.equal(origin.getOrders().length, 0);
            assert.equal(remote.getOrders().length, 1);

            var orders = remote.getOrders();
            assert.equal(orders[0].quantity, 0.5);
            assert.equal(orders[0].rate, 700);

            done();
        });

        it('should notice partially-executed cancels', function(done) {
            var bot = makeBot();
            var origin = bot.originExchange;
            var remote = bot.remoteExchange;

            bot.start()

            origin.placeOrders([new Order(null, 'ASK', '1', '1400')]);
            assert.equal(origin.client._orders.length, 1);
            var order = origin.client._orders[0];

            // Order we'll return instead.
            var executedOrder = jsonClone(order);
            executedOrder.executed = '0.7';

            origin.client.inject('orderCancel', function(uuid, cb) {
                assert.equal(uuid, executedOrder.uuid);
                this._orders = [];

                // Cancel successful but cancelled 0.3 instead of 1.0
                cb && cb(null, {'order': executedOrder});
            });

            // Update orderbook on DummyExchange
            remote.tick();

            // Remote should have a 0.7 order, since we noticed this was
            // executed during cancel.
            assert.equal(remote.getOrders().length, 1);
            assert.equal(origin.getOrders().length, 0);

            var orders = remote.getOrders();
            assert.equal(orders[0].rate, 700); // 1400 / 2.0 profit
            assert.equal(orders[0].quantity, 0.7); // Executed amount

            done();
        });

        it('should handle failed cancels due to execution', function(done) {
            var bot = makeBot();
            var origin = bot.originExchange;
            var remote = bot.remoteExchange;

            bot.start()

            origin.placeOrders([new Order(null, 'ASK', '1', '1400')]);
            assert.equal(origin.client._orders.length, 1);
            var order = origin.client._orders[0];

            var called = {};
            origin.client.inject('orderCancel', function(uuid, cb) {
                assert.equal(uuid, order.uuid);

                // Clear order but we'll pretend it failed.
                this._orders = [];
                called.orderCancel = true;
                cb && cb('Order does not exist.', {});
            });

            // Order we'll return instead.
            var closedOrder = jsonClone(order);
            closedOrder.closed = (new Date()).toJSON();

            origin.client.inject('orderGet', function(uuid, cb) {
                called.orderGet = true;
                cb(null, {'order': closedOrder});
            });

            // Update orderbook on DummyExchange
            remote.tick();

            assert(called.orderCancel);
            assert(called.orderGet);

            // Propagate changes back on BitmeExchangeMock
            origin.tick();

            assert.equal(origin.getOrders().length, 0);
            assert.equal(remote.getOrders().length, 1);

            var orders = remote.getOrders();
            assert.equal(orders[0].rate, 700); // 1400 / 2.0 profit
            assert.equal(orders[0].quantity, 1); // Executed amount

            done();
        });

        it('should handle instantly-executed placed orders', function(done) {
            var bot = makeBot();
            var origin = bot.originExchange;
            var remote = bot.remoteExchange;

            bot.start();

            // Start with two orders, one will be partially executed, one fully.
            remote.orderbook = [
                new Order(null, 'ASK', '1', '700'),
                new Order(null, 'BID', '1', '500')
            ];

            var ordersCreated = 0;
            origin.client.inject('orderCreate', function(currencyPair, orderTypeCd, quantity, rate, cb) {
                ordersCreated++;
                // Pass to the original with modified responses
                //
                // Note: None of this really matters, the bot should ignore
                // execution state during orderCreate and defer changes to
                // future tick updates.
                //
                // In BitClientMock, the returned object is a reference to the
                // internally stored representation, so mutating it during the
                // response does the trick for modifying the internal state
                // also.
                BitmeClientMock.prototype.orderCreate.call(origin.client, currencyPair, orderTypeCd, quantity, rate, function(err, response) {
                    if (response.order.order_type_cd == 'ASK') {
                        // Executed completely.
                        response.order.executed = '1.0';
                        response.order.closed = (new Date()).toJSON();

                        // Remove from internal order state
                        origin.client.orderCancel(response.order.uuid);
                    } else {
                        // Executed partially.
                        response.order.executed = '0.5';
                    }
                    cb(err, response);
                });
            }, 2);

            remote.tick();
            assert.equal(ordersCreated, 2);
            assert.equal(remote.orderbook.length, 2);

            assert.equal(remote.getOrders().length, 0);
            assert.equal(origin.getOrders().length, 2);

            // Bot still thinks the orders are not executed.
            var orders = origin.getOrders();
            assert.equal(orders[0].quantity, 1);
            assert.equal(orders[1].quantity, 1);

            origin.client.ordersOpen(function(_, r) {
                // Confirm BitmeClientMock state is correct
                assert.equal(r.orders.length, 1);
                assert.equal(r.orders[0].order_type_cd, 'BID');
                assert.equal(r.orders[0].executed, 0.5);
                assert.equal(r.orders[0].quantity, 1);
                assert.equal(r.orders[0].rate, 250);
            });

            // Refresh orderbook based on Bitme state, detect trades.
            origin.tick();

            // Only one order left now, the partly-executed one.
            var orders = origin.getOrders();
            assert.equal(orders.length, 1);
            assert.equal(orders[0].quantity, 0.5);

            // Should have two orders, one for the full execution and one for partial.
            var orders = remote.getOrders();
            assert.equal(orders.length, 2);
            assert.equal(orders[0].type, 'ASK');
            assert.equal(orders[0].quantity, 0.5);
            assert.equal(orders[0].rate, 500);
            assert.equal(orders[1].type, 'BID');
            assert.equal(orders[1].quantity, 1);
            assert.equal(orders[1].rate, 700);

            done();
        });

    });

    var origin = new DummyExchange('origin');
    var remote = new DummyExchange('remote');
    describe('Trade Scenarios: Dummy vs Dummy', createTradeScenarios(origin, remote));

    var bitmeClient = new BitmeClientMock();
    var origin = new BitmeExchange(bitmeClient, false, false);
    var remote = new DummyExchange('remote');
    describe('Trade Scenarios: BitmeMock vs Dummy', createTradeScenarios(origin, remote));
});


describe('SampleHistory', function() {
    it('should compute rolling average subset', function() {
        var h = new SampleHistory(4, 0, 2);
        assert.equal(h.rollingNum, 2);

        h.push(2);
        assert.deepEqual(h.history, [2]);
        assert.equal(h.rollingSum, 2);

        h.push(4);
        assert.equal(h.rollingSum, 6);

        h.push(6);
        assert.equal(h.rollingSum, 6);

        h.push(8);
        assert.equal(h.rollingSum, 6);

        h.push(10);
        assert.equal(h.rollingSum, 10);
        assert.deepEqual(h.history, [4, 6, 8, 10]);

        assert.equal(h.shift(), 4);
        assert.deepEqual(h.history, [6, 8, 10]);
        assert.equal(h.rollingSum, 14);

        assert.equal(h.shift(), 6);
        assert.equal(h.rollingSum, 18);

        h.shift(); h.shift();
        assert.equal(h.rollingSum, 0);
    });

    it('should detect deviant values', function() {
        var h = new SampleHistory(5, 0, 5);
        [500, 510, 505, 480, 530].forEach(h.push.bind(h));

        assert(h.getVariance(506) < 0.1);
        assert(h.getVariance(506) > 0);
        assert(h.getVariance(556) > 0.1);
    });
});

