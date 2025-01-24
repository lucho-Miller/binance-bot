const { WebsocketStream, TimeUnit, Spot } = require('@binance/connector')
const { Console } = require('console')

// Add API configuration
const apiKey = 'YOUR_API_KEY'
const apiSecret = 'YOUR_API_SECRET'
const client = new Spot(apiKey, apiSecret)

// Add trading configuration
const CONFIG = {
    ORDER_SIZE_USDT: 1,  // Size in USDT
}

const logger = new Console({ stdout: process.stdout, stderr: process.stderr })

const lastPrice = {
    usdcusdtb: 0,
    usdcusdts: 0,
    fdusdusdtb: 0,
    fdusdusdts: 0,
    fdusdusdcb: 0,
    fdusdusdcs: 0
}

// Callbacks para USDC/USDT
const callbacksUSDC = {
    open: () => logger.debug('Connected USDC/USDT'),
    close: () => logger.debug('Disconnected USDC/USDT'),
    message: data => {
        const ticker = JSON.parse(data)
        lastPrice.usdcusdts = ticker.a  // Mejor bid (compra)
        lastPrice.usdcusdtb = ticker.b  // Mejor ask (venta)
        checkArbitrageOpportunity()
    }
}

// Callbacks para FDUSD/USDT
const callbacksFDUSDT = {
    open: () => logger.debug('Connected FDUSD/USDT'),
    close: () => logger.debug('Disconnected FDUSD/USDT'),
    message: data => {
        const ticker = JSON.parse(data)
        lastPrice.fdusdusdtb = ticker.b
        lastPrice.fdusdusdts = ticker.a
        checkArbitrageOpportunity()
    }
}

// Callbacks para FDUSD/USDC
const callbacksFDUSDC = {
    open: () => logger.debug('Connected FDUSD/USDC'),
    close: () => logger.debug('Disconnected FDUSD/USDC'),
    message: data => {
        const ticker = JSON.parse(data)
        lastPrice.fdusdusdcs = ticker.a
        lastPrice.fdusdusdcb = ticker.b
        checkArbitrageOpportunity()
    }
}

// initialize websocket stream with microseconds as the preferred time unit
const websocketStreamClientUSDC = new WebsocketStream({ logger, callbacks: callbacksUSDC, timeUnit: TimeUnit.MICROSECOND })
const websocketStreamClientFDUSDT = new WebsocketStream({ logger, callbacks: callbacksFDUSDT, timeUnit: TimeUnit.MICROSECOND })
const websocketStreamClientFDUSDC = new WebsocketStream({ logger, callbacks: callbacksFDUSDC, timeUnit: TimeUnit.MICROSECOND })

// Cambiar a bookTicker
websocketStreamClientUSDC.bookTicker('usdcusdt')
websocketStreamClientFDUSDT.bookTicker('fdusdusdt')
websocketStreamClientFDUSDC.bookTicker('fdusdusdc')

// Imprimir precios cada segundo
let bcount = 0
let scount = 0

// Función para validar que todos los precios estén inicializados
const arePricesReady = () => {
    return lastPrice.usdcusdtb !== 0 &&
           lastPrice.usdcusdts !== 0 &&
           lastPrice.fdusdusdtb !== 0 &&
           lastPrice.fdusdusdts !== 0 &&
           lastPrice.fdusdusdcb !== 0 &&
           lastPrice.fdusdusdcs !== 0
}

// Función para validar oportunidades de arbitraje en tiempo real
async function placeLimitOrder(symbol, side, quantity, price) {
    try {
        const order = await client.newOrder(symbol, side, 'LIMIT', {
            price: price,
            quantity: quantity,
            timeInForce: 'GTC'
        })
        logger.debug(`Order placed: ${symbol} ${side} ${quantity} @ ${price}`)
        return order
    } catch (error) {
        logger.error(`Order error: ${symbol} ${side} ${quantity} @ ${price}`, error)
        return null
    }
}

async function executeArbitrage1(arb1) {
    
    try {
        // Calculate quantities
        const usdtAmount = CONFIG.ORDER_SIZE_USDT
        const fdusdAmount = usdtAmount / lastPrice.fdusdusdtb
        const usdcAmount = fdusdAmount * lastPrice.fdusdusdcs

        // Place orders in sequence
        const order1 = await placeLimitOrder('FDUSDUSDT', 'BUY', fdusdAmount, lastPrice.fdusdusdtb)
        if (!order1) return;
        
        const order2 = await placeLimitOrder('FDUSDUSDC', 'SELL', fdusdAmount, lastPrice.fdusdusdcs)
        if (!order2) return;
        
        const order3 = await placeLimitOrder('USDCUSDT', 'SELL', usdcAmount, lastPrice.usdcusdts)
        if (!order3) return;

        logger.debug(`Arbitrage 1 executed with profit: ${(arb1 - 1) * 100}%`)
    } catch (error) {
        logger.error('Error executing arbitrage 1:', error)
    }
}

async function executeArbitrage2(arb2) {
    
    try {
        // Calculate quantities
        const usdtAmount = CONFIG.ORDER_SIZE_USDT
        const usdcAmount = usdtAmount / lastPrice.usdcusdtb
        const fdusdAmount = usdcAmount / lastPrice.fdusdusdcb

        // Place orders in sequence
        const order1 = await placeLimitOrder('USDCUSDT', 'BUY', usdcAmount, lastPrice.usdcusdtb)
        if (!order1) return;
        
        const order2 = await placeLimitOrder('FDUSDUSDC', 'BUY', fdusdAmount, lastPrice.fdusdusdcb)
        if (!order2) return;
        
        const order3 = await placeLimitOrder('FDUSDUSDT', 'SELL', fdusdAmount, lastPrice.fdusdusdts)
        if (!order3) return;

        logger.debug(`Arbitrage 2 executed with profit: ${(arb2 - 1) * 100}%`)
    } catch (error) {
        logger.error('Error executing arbitrage 2:', error)
    }
}

// Modify the checkArbitrageOpportunity function
function checkArbitrageOpportunity() {
    if (!arePricesReady()) return;

    const arb1 = (1/lastPrice.fdusdusdts) * lastPrice.fdusdusdcb * lastPrice.usdcusdtb;
    const arb2 = lastPrice.fdusdusdtb * (1/lastPrice.fdusdusdcs) * (1/lastPrice.usdcusdts);

    if (arb1 > 1.0) {
        bcount++;
        console.log(`¡Oportunidad de arbitraje 1 detectada! Valor: ${arb1}`);
        //executeArbitrage1(arb1);
    }
    if (arb2 > 1.0) {
        scount++;
        console.log(`¡Oportunidad de arbitraje 2 detectada! Valor: ${arb2}`);
        //executeArbitrage2(arb2);
    }
}

// Intervalo solo para mostrar estado
/* setInterval(() => {
    console.clear()
    
    const arb1 = (1/lastPrice.fdusdusdts) * lastPrice.fdusdusdcb * lastPrice.usdcusdtb;
    const arb2 = lastPrice.fdusdusdtb * (1/lastPrice.fdusdusdcs) * (1/lastPrice.usdcusdts);
    
    console.log('Últimos precios:')
    console.log('USDC/USDT Bid:', lastPrice.usdcusdtb)
    console.log('USDC/USDT Ask:', lastPrice.usdcusdts)
    console.log('FDUSD/USDT Bid:', lastPrice.fdusdusdtb)
    console.log('FDUSD/USDT Ask:', lastPrice.fdusdusdts)
    console.log('FDUSD/USDC Bid:', lastPrice.fdusdusdcb)
    console.log('FDUSD/USDC Ask:', lastPrice.fdusdusdcs)
    console.log('-------------------')
    console.log('Valor arbitraje 1 actual:', arb1.toFixed(6))
    console.log('Valor arbitraje 2 actual:', arb2.toFixed(6))
    console.log('Total oportunidades arbitraje 1:', bcount)
    console.log('Total oportunidades arbitraje 2:', scount)
    console.log('Timestamp:', new Date().toLocaleTimeString())
}, 1000) */
