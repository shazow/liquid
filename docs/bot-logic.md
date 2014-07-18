## Scenarios

### Bitstamp

Monitoring trades:

* Sync scenario: Order(s) that we translated to Bitme has changed
  -> Update Bitme orders.

* Fill failure: Filled scenario order only partially completed
  -> Replace order with lower margin order to try and fill.
  1. Use REST API to get new order book,
  2. Pick a new price that would likely fill
     If new price is not acceptable, leave old order and send alert with
     details to be handled manually. (What portion is filled, at what price,
     etc.)
  3. Remove old order
  4. Place new order

* Completion scenario: Order we placed at Bitstamp is completed
  -> Done, print log and move on.


### Bitme

* Filled scenario: Order bot placed on Bitme disappears
  -> Initiate corresponding order on Bitstamp.


## Stateless/testable logic

* Given an order book, return list of corresponding recommended orders.

* Given bot state (set of our pending orders) and Bitme state (order book),
  return order instructions.
  * If a bid is placed by a customer that matches an ask on Bitme, Bitme will
    resolve this order, causing it to disappear from Bitme's order book. The
    bot notices the missing orders (exists in state but missing in order book),
    and places the inverse order + premium on the order's source exchange. This
    last step is _only_ done if the order source is _not_ Bitme.
  * If an order appears in the order book that doesn't exist in the bot state,
    initiate orders to make the bot state match the order book.

* (Realtime, Websocket) Given bot state for Bitme orders and Bitstamp state (partial order book),
  return the delta of revised Bitme orders.

* (Infrequent, REST) Given bot state for Bitstamp orders and Bitstamp state (complete order book),
  return any completed or partially-completed orders.
