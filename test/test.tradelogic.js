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
});
