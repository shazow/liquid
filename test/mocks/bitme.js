var logger = require('../../lib/logger.js');

/**
 * Mock BitmeClient to use for testing.
 */
var BitmeClientMock = module.exports = function() {
    this._orders = [];
    this._accounts = [
        {
            "currency_cd": "BTC",
            "currency_name": "Bitcoin",
            "balance": "10000",
            "available": "5000"
        },
        {
            "currency_cd": "USD",
            "currency_name": "US Dollar",
            "balance": "10000",
            "available": "5000"
        }
    ];
    this.idCounter = 0;
};


/**
 * Inject a fixed callback value for one call.
 *
 * @param {string} key Function name to override.
 * @param {function} cb Function to use instead.
 * @param {number=} count Number of times to intercept before reverting.
 * @param {boolean=} callOriginal If true, call original also (for watching).
 */
BitmeClientMock.prototype.inject = function(key, cb, count, callOriginal) {
    var client = this;
    var original = client[key];
    client[key] = function() {
        var args = [];
        Array.prototype.push.apply(args, arguments);
        cb.apply(client, args);

        if (callOriginal) {
            original.apply(client, args);
        }

        // Revert?
        if (count === undefined || --count == 0) {
            client[key] = original;
        }
    };
};


BitmeClientMock.prototype.debug = function() {
    var args = [];
    Array.prototype.push.apply(args, arguments);
    args[0] = '[BitmeClientMock] ' + args[0];
    logger.debug.apply(null, args);
    //console.log.apply(null, args);
};


BitmeClientMock.prototype.verifyCredentials = function(cb) {
    this.debug('verifyCredentials');
    cb && cb(null);
};


BitmeClientMock.prototype.ordersOpen = function(cb) {
    this.debug('ordersOpen', this._orders.length);
    cb && cb(null, {'orders': this._orders});
};


BitmeClientMock.prototype.accounts = function(cb) {
    this.debug('accounts', this._accounts.length);
    cb && cb(null, {'accounts': this._accounts});
};


BitmeClientMock.prototype.orderCreate = function(currencyPair, orderTypeCd, quantity, rate, cb) {
    var order = {
        "uuid": String(++this.idCounter),
        "order_type_cd": orderTypeCd,
        "currency_pair": currencyPair,
        "rate": rate,
        "quantity": quantity,
        "executed": "0.00000000000000000000",
        "created": (new Date()).toJSON(),
        "executions": []
    };
    this._orders.push(order);

    this.debug('orderCreate', order.uuid, orderTypeCd, quantity, '@', '$' + rate);
    cb && cb(null, {'order': order});
};


BitmeClientMock.prototype.orderCancel = function(uuid, cb) {
    this.debug('orderCancel', uuid);

    for(var i in this._orders) {
        var order = this._orders[i];
        if (order["uuid"] != uuid) continue;

        this._orders.splice(i, 1);
        cb && cb(null, {'order': order});
        return;
    }

    cb && cb('Order not found', {});
};


BitmeClientMock.prototype.orderGet = function(uuid, cb) {
    this.debug('orderGet', uuid);

    for(var i in this._orders) {
        var order = this._orders[i];
        if (order["uuid"] != uuid) continue;

        cb(null, {'order': order});
        return;
    }

    cb && cb('Order not found', {});
};
