const { WebsocketStream, TimeUnit } = require('@binance/connector')
const WebSocket = require('ws')
const { Console } = require('console')

const logger = new Console({ stdout: process.stdout, stderr: process.stderr })

const prices = {
    binance: {
        tusdusdtBid: 0,
        tusdusdtAsk: 0
    },
    bybit: {
        tusdusdtBid: 0,
        tusdusdtAsk: 0
    }
}

// Binance WebSocket setup
const binanceCallbacks = {
    open: () => logger.debug('Connected to Binance TUSD/USDT'),
    close: () => logger.debug('Disconnected from Binance TUSD/USDT'),
    message: data => {
        const ticker = JSON.parse(data)
        prices.binance.tusdusdtBid = parseFloat(ticker.b)
        prices.binance.tusdusdtAsk = parseFloat(ticker.a)
        checkArbitrageOpportunity()
    }
}

const binanceWs = new WebsocketStream({
    logger,
    callbacks: binanceCallbacks,
    timeUnit: TimeUnit.MICROSECOND
})

// Add WebSocket management functions
function setupBybitWebSocket() {
    const ws = new WebSocket('wss://stream.bybit.com/v5/public/spot')
    
    ws.on('open', () => {
        logger.debug('Connected to Bybit')
        // Subscribe to orderbook
        const subscribeMsg = {
            op: 'subscribe',
            args: ['orderbook.1.TUSDUSDT']
        }
        ws.send(JSON.stringify(subscribeMsg))
        
        // Start ping interval
        ws.pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ op: 'ping' }))
            }
        }, 20000) // Ping every 20 seconds
    })

    ws.on('close', () => {
        logger.debug('Disconnected from Bybit, attempting to reconnect...')
        clearInterval(ws.pingInterval)
        setTimeout(() => {
            bybitWs = setupBybitWebSocket()
        }, 5000) // Reconnect after 5 seconds
    })

    ws.on('error', (error) => {
        logger.error('Bybit WebSocket error:', error)
        ws.terminate()
    })

    ws.on('pong', () => {
        logger.debug('Received pong from Bybit')
    })

    ws.on('message', data => {
        try {
            const message = JSON.parse(data)
            
            // Handle ping response
            if (message.op === 'pong') {
                logger.debug('Received pong from Bybit')
                return
            }

            // Handle orderbook updates
            if (message.topic === 'orderbook.1.TUSDUSDT' && message.data) {
                if (message.data.b && message.data.b.length > 0) {
                    const validBid = message.data.b.find(bid => parseFloat(bid[1]) > 0)
                    if (validBid) {
                        prices.bybit.tusdusdtBid = parseFloat(validBid[0])
                    }
                }
                if (message.data.a && message.data.a.length > 0) {
                    const validAsk = message.data.a.find(ask => parseFloat(ask[1]) > 0)
                    if (validAsk) {
                        prices.bybit.tusdusdtAsk = parseFloat(validAsk[0])
                    }
                }
                if ((message.data.b && message.data.b.length > 0) || (message.data.a && message.data.a.length > 0)) {
                    checkArbitrageOpportunity()
                }
            }
        } catch (error) {
            logger.error('Error processing Bybit message:', error)
        }
    })

    return ws
}

// Replace the existing bybit WebSocket setup with the new one
let bybitWs = setupBybitWebSocket()

// Add connection status monitoring
setInterval(() => {
    if (bybitWs.readyState !== WebSocket.OPEN) {
        logger.warn('Bybit WebSocket not connected, attempting reconnection...')
        bybitWs.terminate()
    }
}, 30000)

// Update the arePricesReady function to check timestamp
const priceTimestamps = {
    bybit: 0
}

function arePricesReady() {
    const now = Date.now()
    const maxAge = 10000 // 10 seconds max age for prices
    
    // Update timestamp when we get new Bybit prices
    if (prices.bybit.tusdusdtBid !== 0 && prices.bybit.tusdusdtAsk !== 0) {
        priceTimestamps.bybit = now
    }
    
    // Check if prices are fresh enough
    const bybitPricesFresh = (now - priceTimestamps.bybit) < maxAge

    return prices.binance.tusdusdtBid !== 0 &&
           prices.binance.tusdusdtAsk !== 0 &&
           prices.bybit.tusdusdtBid !== 0 &&
           prices.bybit.tusdusdtAsk !== 0 &&
           bybitPricesFresh
}

const CONFIG = {
    MIN_PROFIT_PERCENT: 0.001, // 0.001%
    ORDER_SIZE_USDT: 1000
}

const stats = {
    binanceToBybit: 0,
    bybitToBinance: 0,
    totalEvents: 0,
    startTime: new Date(),
    maxProfit: {
        binanceToBybit: 0,
        bybitToBinance: 0
    }
}

function checkArbitrageOpportunity() {
    if (!arePricesReady()) return

    stats.totalEvents++
    
    const timestamp = new Date().toLocaleTimeString()
    
    // Binance → Bybit opportunity
    const binanceToBybit = (prices.bybit.tusdusdtBid / prices.binance.tusdusdtAsk - 1) * 100
    stats.maxProfit.binanceToBybit = Math.max(stats.maxProfit.binanceToBybit, binanceToBybit)

    // Bybit → Binance opportunity
    const bybitToBinance = (prices.binance.tusdusdtBid / prices.bybit.tusdusdtAsk - 1) * 100
    stats.maxProfit.bybitToBinance = Math.max(stats.maxProfit.bybitToBinance, bybitToBinance)

    if (binanceToBybit > CONFIG.MIN_PROFIT_PERCENT) {
        stats.binanceToBybit++
        console.log(`\n💰 Arbitrage Opportunity (Binance → Bybit) at ${timestamp}:`)
        console.log(`Buy TUSD on Binance at ${prices.binance.tusdusdtAsk}`)
        console.log(`Sell TUSD on Bybit at ${prices.bybit.tusdusdtBid}`)
        console.log(`Profit: ${binanceToBybit.toFixed(6)}%`)
    }

    if (bybitToBinance > CONFIG.MIN_PROFIT_PERCENT) {
        stats.bybitToBinance++
        console.log(`\n💰 Arbitrage Opportunity (Bybit → Binance) at ${timestamp}:`)
        console.log(`Buy TUSD on Bybit at ${prices.bybit.tusdusdtAsk}`)
        console.log(`Sell TUSD on Binance at ${prices.binance.tusdusdtBid}`)
        console.log(`Profit: ${bybitToBinance.toFixed(6)}%`)
    }
}

// Start WebSocket connection
binanceWs.bookTicker('tusdusdt')

// Status print interval
setInterval(() => {
    console.clear()
    const runningTime = Math.floor((new Date() - stats.startTime) / 1000)
    
    console.log('Current TUSD/USDT Prices:')
    console.log('Binance:')
    console.log(`  Bid: ${prices.binance.tusdusdtBid}`)
    console.log(`  Ask: ${prices.binance.tusdusdtAsk}`)
    console.log('Bybit:')
    console.log(`  Bid: ${prices.bybit.tusdusdtBid}`)
    console.log(`  Ask: ${prices.bybit.tusdusdtAsk}`)
    
    const currentSpread = {
        binanceToBybit: (prices.bybit.tusdusdtBid / prices.binance.tusdusdtAsk - 1) * 100,
        bybitToBinance: (prices.binance.tusdusdtBid / prices.bybit.tusdusdtAsk - 1) * 100
    }
    
    console.log('\nCurrent Spreads:')
    console.log(`Binance → Bybit: ${currentSpread.binanceToBybit.toFixed(6)}%`)
    console.log(`Bybit → Binance: ${currentSpread.bybitToBinance.toFixed(6)}%`)
    
    console.log('\nStatistics:')
    console.log(`Running time: ${Math.floor(runningTime/3600)}h ${Math.floor((runningTime%3600)/60)}m ${runningTime%60}s`)
    console.log(`Total events processed: ${stats.totalEvents}`)
    console.log('\nOpportunities found:')
    console.log(`Binance → Bybit: ${stats.binanceToBybit} (Max: ${stats.maxProfit.binanceToBybit.toFixed(6)}%)`)
    console.log(`Bybit → Binance: ${stats.bybitToBinance} (Max: ${stats.maxProfit.bybitToBinance.toFixed(6)}%)`)
    
    console.log('\nMonitoring for arbitrage opportunities...')
    console.log('Timestamp:', new Date().toLocaleTimeString())
}, 5000)

// SIGINT handler for final stats
process.on('SIGINT', () => {
    console.clear()
    console.log('\nFinal Statistics:')
    const runningTime = Math.floor((new Date() - stats.startTime) / 1000)
    console.log(`Total running time: ${Math.floor(runningTime/3600)}h ${Math.floor((runningTime%3600)/60)}m ${runningTime%60}s`)
    console.log(`Total events processed: ${stats.totalEvents}`)
    console.log(`Total opportunities found: ${stats.binanceToBybit + stats.bybitToBinance}`)
    console.log('\nBy Route:')
    console.log(`Binance → Bybit: ${stats.binanceToBybit} (Max: ${stats.maxProfit.binanceToBybit.toFixed(6)}%)`)
    console.log(`Bybit → Binance: ${stats.bybitToBinance} (Max: ${stats.maxProfit.bybitToBinance.toFixed(6)}%)`)
    process.exit()
})

// Error handling
process.on('uncaughtException', err => {
    logger.error('Uncaught Exception:', err)
})

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
})
