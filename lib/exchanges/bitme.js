var util = require('../util.js');


/**
 * Liquid trading interface to Bitme.
 */

var BitmeExchange = module.exports.BitmeExchange = function() {
    // XXX: Fill this in.
};


BitmeExchange.configKeys = ['BITME_KEY', 'BITME_SECRET'];

/**
 * Instantiate necessary clients based on configuration and return a
 * {@code BitmeExchange} instance.
 *
 * @param {{BITME_KEY: string, BITME_SECRET: string}}
 * @return {BitmeExchange}
 */
BitmeExchange.fromConfig = function(config) {
    if (!util.hasStringValues(config, BitmeExchange.configKeys)) {
        throw new Error('Failed to create BitmeExchange, missing API keys.');
    }

    // XXX: Fill this in.

    return new BitmeExchange(client);
};
