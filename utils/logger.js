const { colorize } = require('./colors')
const { Console } = require('console')

const consoleLogger = new Console({ stdout: process.stdout, stderr: process.stderr })

const logger = {
    debug: (...args) => consoleLogger.debug(colorize.dim(...args)),
    info: (...args) => consoleLogger.log(colorize.info(...args)),
    success: (...args) => consoleLogger.log(colorize.success(...args)),
    warning: (...args) => consoleLogger.warn(colorize.warning(...args)),
    error: (...args) => consoleLogger.error(colorize.error(...args)),
    price: (...args) => consoleLogger.log(colorize.price(...args)),
    profit: (...args) => consoleLogger.log(colorize.profit(...args)),
    time: (...args) => consoleLogger.log(colorize.dim(...args)),
    balance: (...args) => consoleLogger.log(colorize.highlight(...args))
}

module.exports = { logger }
