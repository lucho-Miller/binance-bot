require('dotenv').config()
const chalk = require('chalk')
const WebSocket = require('ws')
const axios = require("axios");
const { WebsocketClient, RestClientV5 } = require('bybit-api');
const { Spot } = require('@binance/connector');

// Configuración usando variables de entorno
const config = {
    binance: {
        apiKey: process.env.BINANCE_API_KEY,
        apiSecret: process.env.BINANCE_API_SECRET,
        wsUrl: process.env.BINANCE_WS_URL,
        testnet: process.env.BINANCE_TESTNET === 'true'
    },
    bybit: {
        apiKey: process.env.BYBIT_API_KEY,
        apiSecret: process.env.BYBIT_API_SECRET,
        wsUrl: process.env.BYBIT_WS_URL,
        testnet: process.env.BYBIT_TESTNET === 'true'
    },
    trading: {
        minProfitPercent: parseFloat(process.env.MIN_PROFIT_PERCENT),
        orderSizeUsdt: parseFloat(process.env.ORDER_SIZE_USDT)
    }
}

// Validación de configuración
function validateConfig() {
    const required = [
        'BINANCE_API_KEY',
        'BINANCE_API_SECRET',
        'BYBIT_API_KEY',
        'BYBIT_API_SECRET'
    ]
    
    const missing = required.filter(key => !process.env[key])
    
    if (missing.length > 0) {
        console.error('Missing required environment variables:', missing.join(', '))
        process.exit(1)
    }
}

// Llamar a la validación antes de iniciar
validateConfig()

// Estado de los balances
let balances = {
    binance: {
        USDT: '0',
        TUSD: '0',
        lastUpdate: null
    },
    bybit: {
        USDT: '0',
        TUSD: '0',
        lastUpdate: null
    }
}

// Add reconnection control
const reconnectControl = {
    binance: {
        attempts: 0,
        maxAttempts: 5,
        delay: 5000,
        timeout: null
    },
    bybit: {
        attempts: 0,
        maxAttempts: 5,
        delay: 5000,
        timeout: null
    }
}

// Add connection state tracking
const connectionState = {
    binance: false,
    bybit: false
}

// Add colored logging helper
const log = {
    info: (...args) => console.log(chalk.blue(...args)),
    success: (...args) => console.log(chalk.green(...args)),
    warning: (...args) => console.log(chalk.yellow(...args)),
    error: (...args) => console.log(chalk.red(...args)),
    price: (...args) => console.log(chalk.cyan(...args)),
    balance: (...args) => console.log(chalk.magenta(...args)),
    time: (...args) => console.log(chalk.gray(...args))
}

// Add initial balance fetching functions
async function fetchBinanceBalances() {
    try {
        const client = new Spot(
            config.binance.apiKey,
            config.binance.apiSecret,
        )
        
        const { data } = await client.account()
        const relevantBalances = data.balances.filter(b => ['USDT', 'TUSD'].includes(b.asset))
        
        relevantBalances.forEach(balance => {
            balances.binance[balance.asset] = parseFloat(balance.free)
        })

        balances.binance.lastUpdate = new Date().toISOString()
        log.success('Initial Binance balances fetched')
        return true
    } catch (error) {
        log.error('Error fetching Binance balances:', error)
        return false
    }
}

async function fetchBybitBalances() {
    try {
        const client = new RestClientV5({
            testnet: false,
            key: config.bybit.apiKey,
            secret: config.bybit.apiSecret,
        });
        const response = await client.getWalletBalance({
            accountType: 'UNIFIED'
        })
        if (response.retCode === 0) {
            const coins = response.result.list[0].coin
            coins.forEach(coin => {
                if (['USDT', 'TUSD'].includes(coin.coin)) {
                    balances.bybit[coin.coin] = parseFloat(coin.walletBalance) - parseFloat(coin.locked)
                }
            })
            balances.bybit.lastUpdate = new Date().toISOString()
            console.log('Initial Bybit balances fetched')
            return true
        }
        return false
    } catch (error) {
        console.error('Error fetching Bybit balances:', error)
        return false
    }
}

// Binance WebSocket setup
async function setupBinanceWebSocket() {
    try {
        // Reset reconnection attempts on successful connection
        reconnectControl.binance.attempts = 0
        
        const response = await axios.post(
            `https://api.binance.com/api/v3/userDataStream`,
            null,
            {
                headers: {
                    "X-MBX-APIKEY": config.binance.apiKey,
                }
            }
        );
        const listenKey = response.data.listenKey;
        console.log("Listen Key obtenido:", listenKey);

        const ws = new WebSocket(`${config.binance.wsUrl}/${listenKey}`)

        ws.on('open', () => {
            log.success('Connected to Binance private WebSocket')
            connectionState.binance = true
            
            // Setup ping interval
            ws.pingInterval = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.ping()
                }
            }, 30000)

            // Setup listenKey renewal
            ws.renewalInterval = setInterval(async () => {
                try {
                    await axios.put(
                        `https://api.binance.com/api/v3/userDataStream`,
                        null,
                        {
                            headers: {
                                "X-MBX-APIKEY": config.binance.apiKey,
                            },
                            params: { listenKey }
                        }
                    )
                    console.log('Binance listenKey renewed')
                } catch (error) {
                    console.error('Error renewing listenKey:', error)
                }
            }, 30 * 60000)
        })

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data)
                if (message.e === 'outboundAccountPosition') {
                    message.B.forEach(balance => {
                        if (balance.a === 'USDT' || balance.a === 'TUSD') {
                            balances.binance[balance.a] = balance.f
                            balances.binance.lastUpdate = new Date().toISOString()
                        }
                    })
                    printBalances()
                }
            } catch (error) {
                console.error('Error processing Binance message:', error)
            }
        })

        ws.on('close', () => {
            connectionState.binance = false
            clearInterval(ws.pingInterval)
            clearInterval(ws.renewalInterval)
            handleBinanceReconnect()
        })

        ws.on('error', (error) => {
            log.error('Binance WebSocket error:', error)
            ws.terminate()
        })

        return ws
    } catch (error) {
        console.error('Error setting up Binance WebSocket:', error)
        handleBinanceReconnect()
        return null
    }
}

function handleBinanceReconnect() {
    if (reconnectControl.binance.attempts >= reconnectControl.binance.maxAttempts) {
        log.error('Max reconnection attempts reached for Binance')
        return
    }

    log.warning(`Attempting to reconnect to Binance (${reconnectControl.binance.attempts + 1}/${reconnectControl.binance.maxAttempts})`)
    
    clearTimeout(reconnectControl.binance.timeout)
    reconnectControl.binance.timeout = setTimeout(async () => {
        reconnectControl.binance.attempts++
        const ws = await setupBinanceWebSocket()
        if (!ws) {
            handleBinanceReconnect()
        }
    }, reconnectControl.binance.delay)
}

// Replace Bybit WebSocket setup with new implementation
function setupBybitWebSocket() {
    // Reset reconnection attempts
    reconnectControl.bybit.attempts = 0

    const wsClient = new WebsocketClient({
        key: config.bybit.apiKey,
        secret: config.bybit.apiSecret,
        market: 'v5',
    })

    wsClient.on('update', data => {
        try {
            if (data.topic === 'wallet') {
                data.data.forEach(wallet => {
                    wallet.coin.forEach(coin => {
                        if (coin.coin === 'USDT' || coin.coin === 'TUSD') {
                            balances.bybit[coin.coin] = parseFloat(coin.walletBalance) - parseFloat(coin.locked)
                            balances.bybit.lastUpdate = new Date().toISOString()
                        }
                    })
                })
                printBalances()
            }
        } catch (error) {
            console.error('Error processing Bybit message:', error)
        }
    })

    wsClient.on('open', () => {
        console.log('Connected to Bybit private WebSocket')
        connectionState.bybit = true
        wsClient.subscribe(['wallet'])
    })

    wsClient.on('close', () => {
        console.log('Bybit WebSocket connection closed')
        connectionState.bybit = false
        handleBybitReconnect(wsClient)
    })

    wsClient.on('error', err => {
        console.error('Bybit WebSocket error:', err)
    })

    wsClient.on('response', response => {
        console.log('Bybit response:', response)
    })

    return wsClient
}

function handleBybitReconnect(wsClient) {
    if (reconnectControl.bybit.attempts >= reconnectControl.bybit.maxAttempts) {
        console.error('Max reconnection attempts reached for Bybit')
        return
    }

    console.log(`Attempting to reconnect to Bybit (${reconnectControl.bybit.attempts + 1}/${reconnectControl.bybit.maxAttempts})`)
    
    clearTimeout(reconnectControl.bybit.timeout)
    reconnectControl.bybit.timeout = setTimeout(() => {
        reconnectControl.bybit.attempts++
        wsClient.reconnect()
    }, reconnectControl.bybit.delay)
}

// Update printBalances function
function printBalances() {
    log.info('\n=== Current Balances ===')
    
    log.info('\nBinance:')
    log.balance(`  USDT: ${balances.binance.USDT}`)
    log.balance(`  TUSD: ${balances.binance.TUSD}`)
    log.time(`  Last Update: ${balances.binance.lastUpdate}`)
    
    log.info('\nBybit:')
    log.balance(`  USDT: ${balances.bybit.USDT}`)
    log.balance(`  TUSD: ${balances.bybit.TUSD}`)
    log.time(`  Last Update: ${balances.bybit.lastUpdate}`)
    
    log.info('\nTotal Combined:')
    log.success(`  USDT: ${(parseFloat(balances.binance.USDT) + parseFloat(balances.bybit.USDT)).toFixed(8)}`)
    log.success(`  TUSD: ${(parseFloat(balances.binance.TUSD) + parseFloat(balances.bybit.TUSD)).toFixed(8)}`)
}

// Update connection monitor
setInterval(() => {
    log.info('\nConnection Status:')
    console.log(
        'Binance:',
        connectionState.binance ? 
            chalk.green('🟢 Connected') : 
            chalk.red('🔴 Disconnected')
    )
    console.log(
        'Bybit:  ',
        connectionState.bybit ? 
            chalk.green('🟢 Connected') : 
            chalk.red('🔴 Disconnected')
    )
}, 30000)

// Modify init function to fetch balances first
async function init() {
    try {
        log.info('Fetching initial balances...')
        
        // Fetch initial balances
        const [binanceSuccess, bybitSuccess] = await Promise.all([
            fetchBinanceBalances(),
            fetchBybitBalances()
        ])

        if (!binanceSuccess || !bybitSuccess) {
            throw new Error('Failed to fetch initial balances')
        }

        // Print initial balances
        printBalances()

        // Then start WebSocket connections
        log.info('Starting WebSocket connections...')
        const binanceWs = await setupBinanceWebSocket()
        const bybitWs = setupBybitWebSocket()
        
        bybitWs.subscribe(['wallet'])

        return { binanceWs, bybitWs }
    } catch (error) {
        log.error('Error in initialization:', error)
        process.exit(1)
    }
}

// Add periodic REST API balance verification
/* setInterval(async () => {
    console.log('Verifying balances via REST API...')
    await Promise.all([
        fetchBinanceBalances(),
        fetchBybitBalances()
    ])
}, 5 * 60000) // Every 5 minutes */

// Update shutdown handler
process.on('SIGINT', async () => {
    log.warning('\nShutting down...')
    clearTimeout(reconnectControl.binance.timeout)
    clearTimeout(reconnectControl.bybit.timeout)
    process.exit(0)
})

// Imprimir balances cada 30 segundos
setInterval(printBalances, 30000)

// Iniciar el monitor
init().catch(console.error)
