'use strict';

/**
  * Main trade logic. All static functions.
  */
var TradeLogic = module.exports.TradeLogic = {};


/**
  * Given an order book, return list of corresponding recommended orders.
  * At the moment, this is simply a pass-through.
  * TODO eventually this will perform order aggregation.
  */
TradeLogic.recommendOrders = function(orderBook) {
    return {
        'bids': orderBook.bids,
        'asks': orderBook.asks
    };
};


/**
  * Given bot state (set of our pending orders) and Bitme state (order book), return order instructions.
  * @param {{ordersById: Object.<string, Order>}} state - The state that the bot is aware of
  * @param {{source: string, bids: Array.<Order>, asks: Array.<Order>}} orderBook - The order book for the given partner
  */
TradeLogic.instructOrders = function(state, orderBook, premium) {
    if (premium === undefined) {
        premium = 1.0;
    }

    if (orderBook.source === 'bitme') {
        return TradeLogic.instructBitmeOrders(state, orderBook, premium);
    } else {
        return TradeLogic.instructExchangeOrders(state, orderBook);
    }
};

TradeLogic.instructBitmeOrders = function(state, orderBook, premium) {
    // If a bid is placed by a customer that matches an ask on Bitme, Bitme will
    // resolve this order, causing it to disappear from Bitme's order book. The
    // bot notices the missing orders (exists in state but missing in order book),
    // and places the inverse order + premium on the order's source exchange. This
    // last step is _only_ done if the order source is _not_ Bitme.

    // TODO implement
}

TradeLogic.instructExchangeOrders = function(state, orderBook, premium) {
    var orders = orderBook.bids.concat(orderBook.asks);

    var newOrders = [];

    for (i=0; i<orders.length; i++) {
        var order = orders[i];
        
        if (!(order.id in state.ordersById)) {
            // If an order appears in the order book that doesn't exist in the bot state,
            // initiate orders to make the bot state match the order book.
            var rate;
            if (order.type === 'bid') {
                rate = order.rate.dividedBy(premium);
            } else {
                rate = order.rate.multiply(premium);
            }
            newOrders.push(order.clone({'rate': rate}));
        }
    }
}
