var util = require('../util.js'),
    BitmeClient = require('bitme');


/**
 * Liquid trading interface to Bitme.
 */

var BitmeExchange = module.exports.BitmeExchange = function(client) {
    this.client = client;
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

    var client = new BitmeClient(config.BITME_KEY, config.BITME_SECRET);
    return new BitmeExchange(client);
};

BitmeExchange.prototype.ready = function(callback) {
    this.client.verifyCredentials(callback);
};
