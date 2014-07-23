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
