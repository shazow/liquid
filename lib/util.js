/**
 * Given an object and a list of keys, return all keys that are missing
 * non-empty string values.
 *
 * @param {object} o
 * @param {Array.<string>} keys
 * @return {Array.<string>}
 */
var missingStringValues = module.exports.missingStringValues = function(o, keys) {
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
