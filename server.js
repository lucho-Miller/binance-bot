const express = require('express')
const axios = require('axios')
const chalk = require('chalk')
const app = express()
const port = process.env.PORT || 3000
require('./tusd-arbitrage')
require('./wallet-monitor')

const log = {
    info: (...args) => console.log(chalk.blue(...args)),
    success: (...args) => console.log(chalk.green(...args)),
    warning: (...args) => console.log(chalk.yellow(...args)),
    error: (...args) => console.log(chalk.red(...args))
}

// Basic route
app.get('/', (req, res) => {
    res.json({ 
        status: 'running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    })
})

// Start server
const server = app.listen(port, () => {
    log.success(`Server running on port ${port}`)
})

// Auto-ping function
const pingServer = async () => {
    try {
        const response = await axios.get(`https://binance-bot-xrwz.onrender.com`)
        log.info('Auto-ping successful:', new Date().toLocaleTimeString(), 'Status:', response.data.status)
    } catch (error) {
        log.error('Auto-ping failed:', error.message)
    }
}

// Set up auto-ping interval (every 1 minute)
const pingInterval = setInterval(pingServer, 60000)

// Cleanup on server shutdown
process.on('SIGINT', () => {
    clearInterval(pingInterval)
    server.close(() => {
        log.warning('Server shutdown complete')
        process.exit(0)
    })
})
