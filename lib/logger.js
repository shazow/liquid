var logger = module.exports = require('winston'),
    _ = require('winston-mail').Mail;


var config = module.exports.config = {
    levels: {
        alert: 4, // Alert will trigger an email if configured.
        error: 3,
        warn: 2,
        info: 1,
        debug: 0
    },
    colors: {
        alert: 'magenta',
        error: 'red',
        warn: 'yellow',
        info: 'green',
        debug: 'blue',
    }
};


logger.padLevels = true;
logger.setLevels(config.levels);
logger.addColors(config.colors);
logger.default.transports.console.timestamp = true;
logger.default.transports.console.colorize = true;
