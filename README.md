# ![liquid logo](https://dl.dropboxusercontent.com/u/35890370/liquid.png) liquid [![Build Status](https://magnum.travis-ci.com/vaurum/liquid.svg?token=bVhxrfzh3LxMJcPgjyx6&branch=master)](https://magnum.travis-ci.com/vaurum/liquid)

Simple arbitrage bot to provide liquidity to Bitme customers from a remote
exchange. The bot will synchronize the Bitme order book with a subset of remote
exchange orders, with an added premium. The bot will poll the Bitme order book
to track completed orders. Once a Bitme completed order is noticed, then it will
place a corresponding (sans-premium) order on the remote exchange.


## Warning

If you plan on using this bot, be prepared to lose money.

While the code is reasonably well-tested, there are still many edge cases that
may not be covered such as unlikely crashes or extreme market volatility.

Keep a balance only of what you're willing to lose, and monitor the bot closely.


## Quickstart

Run the tests:

```
$ npm test
...

42 passing (35ms)
```


Use the tool:

```
$ ./liquid --help

  Usage: liquid [options] <origin:remote>

  Options:

    -h, --help              output usage information
    -V, --version           output the version number
    ...

  API keys loaded from environment variables:

    ✖ BITSTAMP_CLIENT_ID
    ✖ BITSTAMP_KEY
    ✖ BITSTAMP_SECRET
    ✖ BITME_KEY
    ✖ BITME_SECRET
```


Start in DummyExchange mode, aggregating orders to value of $500 at a premium of
150%:

```
$ ./liquid dummy:dummy -v --minValue 500 --premium 1.5
debug:   Set debug level: "debug"
info:    Bot created in dummy mode. All trades will be fake using a DummyExchange.
debug:   [bot] init values: origin=DummyOrigin, remote=DummyRemote, premium=undefined, resetOnly=undefined, minValue=undefined, maxOrders=undefined
info:    Resetting exchanges into a safe state.
debug:   [bot] Binding to exchange events.
info:    Bot started.
...
```

Start in LIVE mode, but only pretend to make trades. For this, we'll need to
export the environment variables mentioned in `--help` first.

```
$ export BITSTAMP_CLIENT_ID="XXX"
$ export BITSTAMP_KEY="XXX"
$ export BITSTAMP_SECRET="XXX"
$ export BITME_KEY="XXX"
$ export BITME_SECRET="XXX"
```

Once the environment variables have been set:

```
$ ./liquid bitme:bitstamp -v --pretend --minValue 500 --premium 1.5
debug:   Set debug level: "debug"
info:    Bot created in PRETEND mode. Orderbook will be watched but no real trades will be placed.
debug:   [bot] init values: origin=bitme, remote=bitstamp, premium=1.5, resetOnly=undefined, minValue=500, maxOrders=undefined
debug:   [exchange:bitme] Preparing.
debug:   [exchange:bitme] Verifying credentials.
debug:   [exchange:bitme] Loaded placed orders: 0
debug:   [exchange:bitme] Loaded balance: currency_cd=BTC, currency_name=Bitcoin, balance=1.00000000000000000000, available=1.00000000000000000000, cleared=1.00000000000000000000, currency_cd=USD, currency_name=US Dollar, balance=1000.00000000000000000000, available=1000.00000000000000000000, cleared=1000.00000000000000000000
debug:   [exchange:bitme] Starting tick loop.
debug:   [exchange:bitstamp] Preparing.
debug:   [exchange:bitstamp] Loaded placed orders: 0
debug:   [exchange:bitstamp] Loaded balance: btc_reserved=0, fee=0.5000, btc_available=1.00000000, usd_reserved=0, btc_balance=1.00000000, usd_balance=0.00, usd_available=0.00
debug:   [exchange:bitstamp] Subscribing to orderbook stream.
info:    Resetting exchanges into a safe state.
debug:   [bot] Binding to exchange events.
info:    Bot started.
...
```

## Running in production

For best results, assume the bot will crash or shutdown at some point, then run it in reset-only mode and send yourself an alert. Once the situation has been investigated, restart the bot. It's not recommended to let it auto-restart on its own by using a process manager.

A script like this might do the trick:

```bash
#!/bin/bash
liquid bitme:bitstamp \
  --stopAfter 1 \
  --logfile log.json \
  --minValue 70 \
  --email "$EMAIL";

# Bot went down, make sure we're in a safe state.
liquid bitme:bitstamp \
  --resetOnly;

echo "Bot stopped. Take a look at it." | mail "$EMAIL"
```

You can also add notifications to the Slack channel of your choice, you just
need to [add a Incoming WebHooks API Integration](https://mirrorx.slack.com/services/new/incoming-webhook)
for the channel of your choice and export the key into a `SLACK_SECRET`
environment variable.

```bash
export SLACK_SECRET="XXX"

liquid ... \
  --slack "#trading";

...
```


## Components

### Bot

The bot is the glue that controls trading between the exchanges and maintains
state.

```javascript
var Bot = require('./lib/bot.js').Bot;

var bot = new Bot(bitmeExchange, bitstampExchange);
```

It's instantiated with an `originExchange`, a `remoteExchange`, and some other
options as configured by the command-line argument parser. The origin exchange
is *our* exchange that we're mirroring into. The remote exchange is the exchange
we're mirroring *from*.

The bot will pull orderbook updates from the remote exchange and keep the origin
exchange in sync with every tick. If it notices that one of the origin orders
disappears, it will treat that as a completed trade and will create a reciprocal
trade on the remote exchange.

```javascript
bot.start(callback);
```

When the bot is started, it will prepare each of the exchanges by calling
`exchange.ready(callback)` on them, and then it will implicitly call
`bot.reset(callback)` to reset the trading into a safe state--in case it wasn't
shut down properly.  This mostly means clearing all of the active origin trades
so that we can start synchronizing the origin trades ourselves.

The bot is notified of trades from exchanges by subscribing to events on them.

```javascript
bot.stop(callback);
```

When stopping conditions are reached (such as `stopAfter` count) or an error
occurs, the bot will attempt to shut down gracefully by calling
`exchange.cleanup(callback)` on each exchange, removing the event subscroptions.

Finally, the bot will again implicitly call `bot.reset(callback)` and attempt to
reach a safe shutdown state.


### Exchange

We abstract exchange APIs by extending the `BaseExchange` which provides a
common interface for our `Bot` to work with. An exchange implementation is an
event emitter which emits `trade` (our placed order is executed) and `orderbook`
(exchange orderbook has been updated) events.

```javascript
var DummyExchange = require('./lib/exchanges/dummy.js').DummyExchange;

var exchange = new DummyExchange('FakeExchange');
```

A `DummyExchange` is provided which fakes trades by maintaining its own state
in-memory.

```javascript
exchange.ready(callback);
```

The exchange is responsible for loading its state and setting up any
authentication or websockets during the ready phase.

```javascript
exchange.placeOrders(orders, callback);

var newOrders = exchange.getOrders();
exchange.cancelOrders(newOrders, callback);
```

It provides functions for placing and deleting orders in bulk, and it keeps
track of placed orders and the exchange balance.

```javascript
exchange.cleanup(callback);
```

To achieve a graceful shutdown, the exchange must clean up after itself. This
means unsubscribing from any websockets and clearing any interval timers. It may
also attempt to push through any pending orders before shutting down.

```javascript
var BitmeExchange = require('./lib/exchanges/bitme.js').BitmeExchange;

var exchange = BitmeExchange.fromConfig({
    apiKeys: {
        BITME_KEY: '...',
        BITME_SECRET: '...',
    },
    tickDelay: 1000,
    pretend: true
});
```

When exchanges are loaded by the command-line argument parser, they're
instantiated using a static helper which knows how to parse the various
command-line options.

To use real exchanges but avoid making real trades, we can start them with
`pretend: true` which will skip making API calls whenever `placeOrders` and
`cancelOrders` is called, and instead print an `INFO` log and pretend that
orders were successful.


### Order module

Along with the main class representation of an `Order`, the core logic of
dealing with orders lives inside of the order module.

```javascript
var order = require('./lib/order.js');

var bid = new order.Order(null, 'BID', 1, 500);
```

The `Order` class should be treated as immutable, and any mutations can be done
by cloning it.

```javascript
var ask = bid.clone({}, /* premium */ 1.05, /* invertType */ true);
```

Clone will override any fields we pass, but it can also apply a premium and
invert the type at the same time--a very common operation when trading back and
forth.

There are several important utilities used primarily by the bot whenever the
orderbook needs to be updated:
- `order.diffOrders(oldOrders, newOrders, ...)` is used for detecting when the orderbook has changed.
- `order.aggregateOrders(orders, minValue, ...)` is used to combine smaller orders into
  fewer larger orders.
- `order.budgetOrders(orders, budget, ...)` is used to prune aggregated orders
  into a subset which will fit in our budget. It will even replace the final
  oversized order with a smaller equivalent order that fits within the budget.
- `order.patchOrders(placedOrders, newOrders)` is used to get instructions to
  update our placed orders with an updated set of orders using the fewest
  possible operations.

Further, there several more helpers used to get the spread from a list of
orders, sort orders by spread, compute the total value of a list of orders, and
get the budget to be used with `aggregateOrders`.


All of these pieces are generally well-tested, so don't forget to check the
tests for examples on how they can be used independently or together.
