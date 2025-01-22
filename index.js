const { WebsocketStream, TimeUnit } = require('@binance/connector')
const { Console } = require('console')

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
        lastPrice.usdcusdts = ticker.b  // Mejor bid (compra)
        lastPrice.usdcusdtb = ticker.a  // Mejor ask (venta)
        checkArbitrageOpportunity()
    }
}

// Callbacks para FDUSD/USDT
const callbacksFDUSDT = {
    open: () => logger.debug('Connected FDUSD/USDT'),
    close: () => logger.debug('Disconnected FDUSD/USDT'),
    message: data => {
        const ticker = JSON.parse(data)
        lastPrice.fdusdusdtb = ticker.a
        lastPrice.fdusdusdts = ticker.b
        checkArbitrageOpportunity()
    }
}

// Callbacks para FDUSD/USDC
const callbacksFDUSDC = {
    open: () => logger.debug('Connected FDUSD/USDC'),
    close: () => logger.debug('Disconnected FDUSD/USDC'),
    message: data => {
        const ticker = JSON.parse(data)
        lastPrice.fdusdusdcs = ticker.b
        lastPrice.fdusdusdcb = ticker.a
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
function checkArbitrageOpportunity() {
    if (!arePricesReady()) return;

    const arb1 = (1/lastPrice.fdusdusdtb) * lastPrice.fdusdusdcs * lastPrice.usdcusdts;
    const arb2 = lastPrice.fdusdusdts * (1/lastPrice.fdusdusdcb) * (1/lastPrice.usdcusdtb);

    if (arb1 > 1.0) {
        bcount++;
        console.log(`¡Oportunidad de arbitraje 1 detectada! Valor: ${arb1}`);
    }
    if (arb2 > 1.0) {
        scount++;
        console.log(`¡Oportunidad de arbitraje 2 detectada! Valor: ${arb2}`);
    }
}

// Intervalo solo para mostrar estado
setInterval(() => {
    console.clear()
    
    const arb1 = (1/lastPrice.fdusdusdtb) * lastPrice.fdusdusdcs * lastPrice.usdcusdts;
    const arb2 = lastPrice.fdusdusdts * (1/lastPrice.fdusdusdcb) * (1/lastPrice.usdcusdtb);
    
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
}, 1000)
