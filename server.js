const express = require('express')
const axios = require('axios')
const app = express()
const port = process.env.PORT || 3000
require('./tusd-arbitrage')
require('./wallet-monitor')


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
    console.log(`Server running on port ${port}`)
})

// Auto-ping function
const pingServer = async () => {
    try {
        const response = await axios.get(`https://binance-bot-xrwz.onrender.com`)
        console.log('Auto-ping successful:', new Date().toLocaleTimeString(), 'Status:', response.data.status)
    } catch (error) {
        console.error('Auto-ping failed:', error.message)
    }
}

// Set up auto-ping interval (every 1 minute)
const pingInterval = setInterval(pingServer, 60000)

// Cleanup on server shutdown
process.on('SIGINT', () => {
    clearInterval(pingInterval)
    server.close(() => {
        console.log('Server shutdown complete')
        process.exit(0)
    })
})
