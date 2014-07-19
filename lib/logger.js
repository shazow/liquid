var logger = module.exports = require('winston');

logger.cli();
logger.default.transports.console.timestamp = true;
