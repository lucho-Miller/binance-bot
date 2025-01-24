const { WebsocketStream, TimeUnit } = require('@binance/connector')
const WebSocket = require('ws')
const { Console } = require('console')

const logger = new Console({ stdout: process.stdout, stderr: process.stderr })

const prices = {
    binance: {
        usdcusdtBid: 0,
        usdcusdtAsk: 0
    },
    bybit: {
        usdcusdtBid: 0,
        usdcusdtAsk: 0
    },
    bitget: {
        usdcusdtBid: 0,
        usdcusdtAsk: 0
    }
}

// Binance WebSocket setup
const binanceCallbacks = {
    open: () => logger.debug('Connected to Binance USDC/USDT'),
    close: () => logger.debug('Disconnected from Binance USDC/USDT'),
    message: data => {
        const ticker = JSON.parse(data)
        prices.binance.usdcusdtBid = parseFloat(ticker.b)
        prices.binance.usdcusdtAsk = parseFloat(ticker.a)
        checkArbitrageOpportunity()
    }
}

const binanceWs = new WebsocketStream({
    logger,
    callbacks: binanceCallbacks,
    timeUnit: TimeUnit.MICROSECOND
})

// Bybit WebSocket setup
const bybitWs = new WebSocket('wss://stream.bybit.com/v5/public/spot')

bybitWs.on('open', () => {
    logger.debug('Connected to Bybit')
    const subscribeMsg = {
        op: 'subscribe',
        args: ['orderbook.1.USDCUSDT']
    }
    bybitWs.send(JSON.stringify(subscribeMsg))
})

bybitWs.on('message', data => {
    try {
        const message = JSON.parse(data)
        if (message.topic === 'orderbook.1.USDCUSDT' && message.data) {
            if (message.data.b && message.data.b.length > 0) {
                prices.bybit.usdcusdtBid = parseFloat(message.data.b[0][0])
            }
            if (message.data.a && message.data.a.length > 0) {
                prices.bybit.usdcusdtAsk = parseFloat(message.data.a[0][0])
            }
            if (message.data.b && message.data.b.length > 0 || message.data.a && message.data.a.length > 0) {
                checkArbitrageOpportunity()
            }
        }
    } catch (error) {
        logger.error('Error processing Bybit message:', error)
    }
})

// Bitget WebSocket setup
const bitgetWs = new WebSocket('wss://ws.bitget.com/v2/ws/public')

bitgetWs.on('open', () => {
    logger.debug('Connected to Bitget')
    const subscribeMsg = {
        op: "subscribe",
        args: [{
            instType: "SPOT",
            channel: "ticker",
            instId: "USDCUSDT"
        }]
    }
    bitgetWs.send(JSON.stringify(subscribeMsg))
})

bitgetWs.on('message', data => {
    try {
        const message = JSON.parse(data)
        if (message.action === 'snapshot' && message.data) {
            if (message.data[0].bidPr) {
                prices.bitget.usdcusdtBid = parseFloat(message.data[0].bidPr)
            }
            if (message.data[0].askPr) {
                prices.bitget.usdcusdtAsk = parseFloat(message.data[0].askPr)
            }
            if ((message.data[0].bidPr) || 
                (message.data[0].askPr)) {
                checkArbitrageOpportunity()
            }
        }
    } catch (error) {
        logger.error('Error processing Bitget message:', error)
    }
})

// Configuration
const CONFIG = {
    MIN_PROFIT_PERCENT: 0.0000001, // 0.1%
    ORDER_SIZE_USDT: 1000
}

// Add counters
const stats = {
    binanceToBybit: 0,
    bybitToBinance: 0,
    binanceToBitget: 0,
    bitgetToBinance: 0,
    bybitToBitget: 0,
    bitgetToBybit: 0,
    totalEvents: 0,
    startTime: new Date(),
    maxProfit: {
        binanceToBybit: 0,
        bybitToBinance: 0,
        binanceToBitget: 0,
        bitgetToBinance: 0,
        bybitToBitget: 0,
        bitgetToBybit: 0
    }
}

function arePricesReady() {
    return prices.binance.usdcusdtBid !== 0 &&
           prices.binance.usdcusdtAsk !== 0 &&
           prices.bybit.usdcusdtBid !== 0 &&
           prices.bybit.usdcusdtAsk !== 0 &&
           prices.bitget.usdcusdtBid !== 0 &&
           prices.bitget.usdcusdtAsk !== 0
}

function checkArbitrageOpportunity() {
    if (!arePricesReady()) return

    stats.totalEvents++
    
    const timestamp = new Date().toLocaleTimeString()
    const opportunities = [
        {
            from: 'Binance',
            to: 'Bybit',
            profit: (prices.bybit.usdcusdtBid / prices.binance.usdcusdtAsk - 1) * 100,
            buyPrice: prices.binance.usdcusdtAsk,
            sellPrice: prices.bybit.usdcusdtBid
        },
        {
            from: 'Bybit',
            to: 'Binance',
            profit: (prices.binance.usdcusdtBid / prices.bybit.usdcusdtAsk - 1) * 100,
            buyPrice: prices.bybit.usdcusdtAsk,
            sellPrice: prices.binance.usdcusdtBid
        },
        {
            from: 'Binance',
            to: 'Bitget',
            profit: (prices.bitget.usdcusdtBid / prices.binance.usdcusdtAsk - 1) * 100,
            buyPrice: prices.binance.usdcusdtAsk,
            sellPrice: prices.bitget.usdcusdtBid
        },
        {
            from: 'Bitget',
            to: 'Binance',
            profit: (prices.binance.usdcusdtBid / prices.bitget.usdcusdtAsk - 1) * 100,
            buyPrice: prices.bitget.usdcusdtAsk,
            sellPrice: prices.binance.usdcusdtBid
        },
        {
            from: 'Bybit',
            to: 'Bitget',
            profit: (prices.bitget.usdcusdtBid / prices.bybit.usdcusdtAsk - 1) * 100,
            buyPrice: prices.bybit.usdcusdtAsk,
            sellPrice: prices.bitget.usdcusdtBid
        },
        {
            from: 'Bitget',
            to: 'Bybit',
            profit: (prices.bybit.usdcusdtBid / prices.bitget.usdcusdtAsk - 1) * 100,
            buyPrice: prices.bitget.usdcusdtAsk,
            sellPrice: prices.bybit.usdcusdtBid
        }
    ]

    opportunities.forEach(opp => {
        const statKey = `${opp.from.toLowerCase()}To${opp.to}`
        stats.maxProfit[statKey] = Math.max(stats.maxProfit[statKey], opp.profit)

        if (opp.profit > CONFIG.MIN_PROFIT_PERCENT) {
            stats[statKey]++
            console.log(`\n💰 Arbitrage Opportunity (${opp.from} → ${opp.to}) at ${timestamp}:`)
            console.log(`Buy USDC on ${opp.from} at ${opp.buyPrice}`)
            console.log(`Sell USDC on ${opp.to} at ${opp.sellPrice}`)
            console.log(`Profit: ${opp.profit.toFixed(3)}%`)
        }
    })
}

// Start WebSocket connections
binanceWs.bookTicker('usdcusdt')

// Modify the status print interval
setInterval(() => {
    console.clear()
    const runningTime = Math.floor((new Date() - stats.startTime) / 1000)
    
    console.log('Current Prices:')
    console.log('Binance USDC/USDT:')
    console.log(`  Bid: ${prices.binance.usdcusdtBid}`)
    console.log(`  Ask: ${prices.binance.usdcusdtAsk}`)
    console.log('Bybit USDC/USDT:')
    console.log(`  Bid: ${prices.bybit.usdcusdtBid}`)
    console.log(`  Ask: ${prices.bybit.usdcusdtAsk}`)
    console.log('Bitget USDC/USDT:')
    console.log(`  Bid: ${prices.bitget.usdcusdtBid}`)
    console.log(`  Ask: ${prices.bitget.usdcusdtAsk}`)
    
    console.log('\nStatistics:')
    console.log(`Running time: ${Math.floor(runningTime/3600)}h ${Math.floor((runningTime%3600)/60)}m ${runningTime%60}s`)
    console.log(`Total events processed: ${stats.totalEvents}`)
    console.log('\nOpportunities found:')
    console.log(`Binance → Bybit: ${stats.binanceToBybit} (Max: ${stats.maxProfit.binanceToBybit.toFixed(3)}%)`)
    console.log(`Bybit → Binance: ${stats.bybitToBinance} (Max: ${stats.maxProfit.bybitToBinance.toFixed(3)}%)`)
    console.log(`Binance → Bitget: ${stats.binanceToBitget} (Max: ${stats.maxProfit.binanceToBitget.toFixed(3)}%)`)
    console.log(`Bitget → Binance: ${stats.bitgetToBinance} (Max: ${stats.maxProfit.bitgetToBinance.toFixed(3)}%)`)
    console.log(`Bybit → Bitget: ${stats.bybitToBitget} (Max: ${stats.maxProfit.bybitToBitget.toFixed(3)}%)`)
    console.log(`Bitget → Bybit: ${stats.bitgetToBybit} (Max: ${stats.maxProfit.bitgetToBybit.toFixed(3)}%)`)
    
    console.log('\nMonitoring for arbitrage opportunities...')
    console.log('Timestamp:', new Date().toLocaleTimeString())
}, 5000)

// Add SIGINT handler to show final stats
process.on('SIGINT', () => {
    console.clear()
    console.log('\nFinal Statistics:')
    const runningTime = Math.floor((new Date() - stats.startTime) / 1000)
    console.log(`Total running time: ${Math.floor(runningTime/3600)}h ${Math.floor((runningTime%3600)/60)}m ${runningTime%60}s`)
    console.log(`Total events processed: ${stats.totalEvents}`)
    console.log(`Total opportunities found: ${
        stats.binanceToBybit + stats.bybitToBinance + 
        stats.binanceToBitget + stats.bitgetToBinance +
        stats.bybitToBitget + stats.bitgetToBybit
    }`)
    console.log('\nBy Route:')
    console.log(`Binance → Bybit: ${stats.binanceToBybit} (Max: ${stats.maxProfit.binanceToBybit.toFixed(3)}%)`)
    console.log(`Bybit → Binance: ${stats.bybitToBinance} (Max: ${stats.maxProfit.bybitToBinance.toFixed(3)}%)`)
    console.log(`Binance → Bitget: ${stats.binanceToBitget} (Max: ${stats.maxProfit.binanceToBitget.toFixed(3)}%)`)
    console.log(`Bitget → Binance: ${stats.bitgetToBinance} (Max: ${stats.maxProfit.bitgetToBinance.toFixed(3)}%)`)
    console.log(`Bybit → Bitget: ${stats.bybitToBitget} (Max: ${stats.maxProfit.bybitToBitget.toFixed(3)}%)`)
    console.log(`Bitget → Bybit: ${stats.bitgetToBybit} (Max: ${stats.maxProfit.bitgetToBybit.toFixed(3)}%)`)
    process.exit()
})

// Error handling
process.on('uncaughtException', err => {
    logger.error('Uncaught Exception:', err)
})

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
})
