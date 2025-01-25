require('dotenv').config()
const WebSocket = require('ws')
const axios = require("axios");
const { WebsocketClient } = require('bybit-api');

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
            console.log('Connected to Binance private WebSocket')
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
            console.error('Binance WebSocket error:', error)
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
        console.error('Max reconnection attempts reached for Binance')
        return
    }

    console.log(`Attempting to reconnect to Binance (${reconnectControl.binance.attempts + 1}/${reconnectControl.binance.maxAttempts})`)
    
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

function printBalances() {
    console.clear()
    console.log('\nCurrent Balances:')
    console.log('Binance:')
    console.log(`  USDT: ${balances.binance.USDT}`)
    console.log(`  TUSD: ${balances.binance.TUSD}`)
    console.log(`  Last Update: ${balances.binance.lastUpdate}`)
    console.log('\nBybit:')
    console.log(`  USDT: ${balances.bybit.USDT}`)
    console.log(`  TUSD: ${balances.bybit.TUSD}`)
    console.log(`  Last Update: ${balances.bybit.lastUpdate}`)
    console.log('\nTotal Combined:')
    console.log(`  USDT: ${(parseFloat(balances.binance.USDT) + parseFloat(balances.bybit.USDT)).toFixed(8)}`)
    console.log(`  TUSD: ${(parseFloat(balances.binance.TUSD) + parseFloat(balances.bybit.TUSD)).toFixed(8)}`)
}

// Add connection monitor
setInterval(() => {
        console.log('\nConnection Status:')
        console.log(`Binance: ${connectionState.binance ? '🟢 Connected' : '🔴 Disconnected'}`)
        console.log(`Bybit: ${connectionState.bybit ? '🟢 Connected' : '🔴 Disconnected'}`)
}, 10000)

// Inicialización
async function init() {
    try {
        const binanceWs = await setupBinanceWebSocket()
        const bybitWs = setupBybitWebSocket()

        bybitWs.subscribe(['execution']);

        return { binanceWs, bybitWs }
    } catch (error) {
        console.error('Error in initialization:', error)
        process.exit(1)
    }
}

// Manejo de cierre
process.on('SIGINT', async () => {
    console.log('\nShutting down...')
    clearTimeout(reconnectControl.binance.timeout)
    clearTimeout(reconnectControl.bybit.timeout)
    process.exit(0)
})

// Imprimir balances cada 30 segundos
setInterval(printBalances, 30000)

// Iniciar el monitor
init().catch(console.error)
