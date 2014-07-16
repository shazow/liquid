# Bitme Arbitrage Bot

Simple arbitrage bot to provide liquidity to Bitme customers from a remote
exchange. The bot will synchronize the Bitme order book with a subset of remote
exchange orders, with an added premium. The bot will poll the Bitme order book
to track completed orders. Once a Bitme completed order is noticed, then it will
place a corresponding (sans-premium) order on the remote exchange.

## Research

### Codebases to consider

We'll be learning from these codebases to find non-obvious edge cases that need to be covered.
* https://github.com/maxme/bitcoin-arbitrage (Python)
* https://github.com/hstove/rbtc_arbitrage (Ruby)
* https://github.com/skier31415/BTC-Arby (Python)
* https://code.google.com/p/ga-bitbot/source/browse (Python)
* https://github.com/rokj/bitcoin_dealer (Python)
* Others?


### API risks

* Bitme API
  * No streaming API, will need to poll.
  * ?
* Bitstamp API
  * ?


## Scope

* One remote exchange (Bitstamp).
* One currency (USD).
* Configurable features:
  * Bitme and Bitstamp API keys
  * Order book depth - Number of entries to keep in-sync with the remote exchange.(default: N entries? N volume? % deviation?) A combination of N volume and % deviation from the market rate/last trade sounds like a good way to do it to make sure there is plenty of liquidity.
  * Pretend mode - Don't actually trade, just print out debugging logs pretending to trade.
  * Alert email - When funds in APIs are running low, alert this address.
  * Price Premium - Percent premium to sell over the remote buy order. (default: 1.05, or 5%)
  * Remote order aggregation - There will need to be some aggregation of orders on the remote exchange when placed on Bitme since Bitme currently has a minimum order size of 10,000 USD
  * Stateless: The bot will attempt to be as stateless as possible, by loading all needed info from the APIs on start. Only thing that will need to be retained is mid-transaction transfers, which will be done with SQLite (safe for single-process usage).
* Good test coverage of core trading logic.
* Good documentation, for both code and accompanying instructions.
