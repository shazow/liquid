var assert = require('assert'),
    TradeLogic = require('../lib/trade/tradelogic.js').TradeLogic,
    Order = require('../lib/order.js').Order;

describe('Trade Logic', function() {
    it('should recommend orders', function() {
        var orders = {
            'bids': [
                new Order(null, 'BID', '0.123', '455')
            ],
            'asks': [
                new Order(null, 'ASK', '0.123', '456'),
                new Order(null, 'ASK', '0.123', '457')
            ]
        };

        var recommendedOrders = TradeLogic.recommendOrders(orders, 2.0);

        assert.equal(recommendedOrders.bids[0].rate, 227.5);
        assert.equal(recommendedOrders.asks[0].rate, 912);
        assert.equal(recommendedOrders.asks[1].rate, 914);
    });

    describe('Instruct Exchange Orders', function() {
        // TODO move this over to the dummy exchange once that is implemented
        var state = {
            'ordersById': {},
            'bids': [
                new Order('1a2b3c', 'BID', '0.123', '227.5')
            ],
            'asks': [
                new Order('1a2b3d', 'ASK', '0.123', '912'),
                new Order('1a2b3e', 'ASK', '0.123', '914')
            ]
        };
        var orders = state.bids.concat(state.asks);
        orders.forEach(function(order) {
            state.ordersById[order.id] = order;
        });
        
        it('should instruct NO new exchange orders', function() {
            var orderBook = {
                'bids': [
                    new Order('1a2b3c', 'BID', '0.123', '455')
                ],
                'asks': [
                    new Order('1a2b3d', 'ASK', '0.123', '456'),
                    new Order('1a2b3e', 'ASK', '0.123', '457')
                ]
            };

            var newOrders = TradeLogic.instructExchangeOrders(state, orderBook, 2.0);
            assert.deepEqual(newOrders, []);
        });

        it('should instruct one new bid order at half the rate', function() {
            var orderBook = {
                'bids': [
                    new Order('1a2b3c', 'BID', '0.123', '455'),
                    new Order('1a2b3f', 'BID', '0.123', '458')
                ],
                'asks': [
                    new Order('1a2b3d', 'ASK', '0.123', '456'),
                    new Order('1a2b3e', 'ASK', '0.123', '457')
                ]
            };

            var newOrders = TradeLogic.instructExchangeOrders(state, orderBook, 2.0);
            assert.deepEqual(newOrders, [new Order('1a2b3f', 'BID', '0.123', '229')]);
        });

        it('should instruct one new ask order at double the rate', function() {
            var orderBook = {
                'bids': [
                    new Order('1a2b3c', 'BID', '0.123', '455'),
                ],
                'asks': [
                    new Order('1a2b3d', 'ASK', '0.123', '456'),
                    new Order('1a2b3e', 'ASK', '0.123', '457'),
                    new Order('1a2b3f', 'ASK', '0.123', '458')
                ]
            };

            var newOrders = TradeLogic.instructExchangeOrders(state, orderBook, 2.0);
            assert.deepEqual(newOrders, [new Order('1a2b3f', 'ASK', '0.123', '916')]);
        });
    });
});
