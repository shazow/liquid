/**
 * Given an object, return true if all keys have non-empty string values.
 *
 * @param {object} o
 * @param {Array.<string>} keys
 *
 * @return {boolean}
 */
var hasStringValues = module.exports.hasStringValues = function(o, keys) {
    return keys.every(function(k) {
        var v = o[k];
        return typeof v == 'string' && v.length > 0;
    });
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
