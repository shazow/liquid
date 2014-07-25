var assert = require('assert'),
    DummyExchange = require('../lib/exchanges/dummy.js').DummyExchange;
    Bot = require('../lib/bot.js').Bot;
    Order = require('../lib/order.js').Order,
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
});
