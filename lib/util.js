/**
 * Given an object and a list of keys, return all keys that are missing
 * non-empty string values.
 *
 * @param {object} o
 * @param {Array.<string>} keys
 * @return {Array.<string>}
 */
var missingStringValues = module.exports.missingStringValues = function(o, keys) {
    if (!keys) return [];
    return keys.filter(function(k) {
        var v = o[k];
        return typeof v !== 'string' || v.length === 0;
    });
};


/**
 * @return {Array} New array with all of the arguments merged.
 */
var mergeArrays = module.exports.mergeArrays = function() {
    var r = [];
    for(var i in arguments) {
        Array.prototype.push.apply(r, arguments[i]);
    };
    return r;
}


/**
 * @return {object} New object with all of the arguments merged.
 */
var mergeObjects = module.exports.mergeObjects = function() {
    var r = {};
    for(var i in arguments) {
        var o = arguments[i];
        for(var k in o) r[k] = o[k];
    };
    return r;
};


/**
 * @return {object} New copy of {@code o} after being round-tripped through JSON encoding.
 */
var jsonClone = module.exports.jsonClone = function(o) {
    return JSON.parse(JSON.stringify(o));
};


/**
 * Given an emitter, add a set of listeners based to corresponding event keys.
 *
 * @param {events.EventEmitter} emitter
 * @param {object} listeners A mapping of event names to listeners.
 */
var addListeners = module.exports.addListeners = function(emitter, listeners) {
    for(var key in listeners) {
        emitter.addListener(key, listeners[key]);
    }
};


/**
 * Given an emitter, add remove listeners based to corresponding event keys.
 *
 * @param {events.EventEmitter} emitter
 * @param {object} listeners A mapping of event names to listeners.
 */
var removeListeners = module.exports.removeListeners = function(emitter, listeners) {
    for(var key in listeners) {
        emitter.removeListener(key, listeners[key]);
    }
};


/**
 * Simple counter, handy for generating strictly-incrementing nonces.
 *
 * @param {number} start Value to start counting from.
 * @return {function} Callable that returns an incrementing integer starting
 *      from {@code start}.
 */
var counter = module.exports.counter = function(n) {
    return function() {
        return ++n;
    };
};


/**
 * Simpler pager that returns maximum {@code n} elements of {@code a} per call.
 *
 * @param {array} a List of things to page through.
 * @param {number} n Number of items per page.
 * @return {function} Callable that returns a page of elements for each call.
 */
var pager = module.exports.pager = function(a, n) {
    var r = [];
    var offset = 0;
    while (offset < a.length) {
        r.push(a.slice(offset, offset+=n));
    }
    return r;
};
