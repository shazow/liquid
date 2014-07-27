var Order = require('../order.js').Order;

/**
  * Main trade logic. All static functions.
  */
var TradeLogic = module.exports.TradeLogic = {};


/**
  * Given an order book, return list of corresponding recommended orders.
  * At the moment, this is simply a pass-through with premium.
  * 
  * TODO: Eventually this will perform order aggregation.
  */
TradeLogic.recommendOrders = function(orderBook, premium) {
    if (premium === undefined) {
        premium = 1.0;
    }

    return {
        'bids': orderBook.bids.map(function(order) {
            return order.clone({'rate': order.rate.dividedBy(premium)});
        }),
        'asks': orderBook.asks.map(function(order) {
            return order.clone({'rate': order.rate.times(premium)});
        })
    };
};


/**
  * Given bot state (set of our pending orders) and Origin state (order book),
  * return order instructions.
  *
  * @param {{ordersById: Object.<string, Order>}} state -
  *         The state that the bot is aware of
  * @param {{exchange: string, bids: Array.<Order>, asks: Array.<Order>}} orderBook -
  *         The order book for the given partner
  * @param {number} premium -
  *         The premium multiplier. Should always be set by this point.
  */
TradeLogic.instructOriginOrders = function(state, orderBook, premium) {
    if (premium === undefined) {
        premium = 1.0;
    }

    var recommendedOrders = TradeLogic.recommendOrders(orderBook, premium);
    var newOrders = [];

    // TODO once we implement aggregation, de-aggregation will be needed in this step.
    state.orders.forEach(function(order) {
        // If a bid is placed by a customer that matches an ask on Origin, Origin
        // will resolve this order, causing both to disappear from Origin's order
        // book. The bot notices the missing orders (exists in state but missing in
        // orderBook), and places the inverse order + premium on the order's source
        // exchange. This last step is _only_ done if the order exchange is _not_
        // origin.
        // XXX: ensure that we filter by order exchange once that is implemented
        if (!(order.id in orderBook.ordersById)) {
            var type, rate;
            if (order.type === 'BID') {
                type = 'ASK';
                rate = order.rate.times(premium);
            } else {
                type = 'BID';
                rate = order.rate.dividedBy(premium);
            }
            newOrders.push(order.clone({
                'type': type,
                'rate': rate
            }));
        }
    });

    return newOrders;
};

/**
  * Given bot state (set of our pending orders) and Exchange state (order
  * book), return order instructions.
  *
  * @param {{ordersById: Object.<string, Order>}} state -
  *         The state that the bot is aware of
  * @param {{exchange: string, bids: Array.<Order>, asks: Array.<Order>}} orderBook -
  *         The order book for the given partner
  * @param {number} premium -
  *         The premium multiplier. Should always be set by this point.
  */
TradeLogic.instructExchangeOrders = function(state, orderBook, premium) {
    if (premium === undefined) {
        premium = 1.0;
    }

    var recommendedOrders = TradeLogic.recommendOrders(orderBook, premium);
    var orders = recommendedOrders.bids.concat(recommendedOrders.asks);

    var newOrders = [];

    orders.forEach(function(order) {
        if (!(order.id in state.ordersById)) {
            // If an order appears in the order book that doesn't exist in the bot state,
            // initiate orders to make the bot state match the order book.
            // The resulting new order is already premium-adjusted.
            newOrders.push(order);
        }
    });
    
    return newOrders;
};
