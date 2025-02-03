const { RestClientV5 } = require('bybit-api')
const { Spot } = require('@binance/connector')
const { colorize } = require('./utils/colors')
require('dotenv').config()
const { WebsocketClient } = require('bybit-api');
const Profit = require('./db/models/profit');
const mongoose = require('mongoose');

let acc = 0.0
let errorCount = 0

// Print errorCount in red every 20 seconds
setInterval(() => {
    console.log(colorize.error(`Número de errores: ${errorCount}`));
}, 20000);

class ArbitrageExecutor {
    constructor() {
        this.isExecuting = false
        this.executionTimeout = null;
        this.isWsConnected = false
        this.bybitClient = new RestClientV5({
            key: process.env.BYBIT_API_KEY,
            secret: process.env.BYBIT_API_SECRET,
            testnet: false
        })
        this.binanceClient = new Spot(
            process.env.BINANCE_API_KEY,
            process.env.BINANCE_API_SECRET,
            {
                recvWindow: 60000, // Aumentar la ventana de tiempo a 60 segundos
                timestamp: Date.now(), // Asegurar que usamos el timestamp actual
            }
        )
        this.bybitWs = new WebsocketClient({
            key: process.env.BYBIT_API_KEY,
            secret: process.env.BYBIT_API_SECRET,
            market: 'v5',
        })
        this.binancePrice = null
        this.quantity = 0.0
        this.binanceAction = null
        this.profit = 0.0

        this.binanceBlock = true

        this.bybitWs.on('open', () => {
            console.log('Conectado al WebSocket de Bybit');
            this.isWsConnected = true
        });

        this.bybitWs.on('error', (error) => {
            console.error('Error en WebSocket:', error);
            this.isWsConnected = false
        });
    
        this.bybitWs.on('close', () => {
            console.log('Conexión de WebSocket cerrada');
            this.isWsConnected = false
            this.bybitWs.connect();
        });

        this.bybitWs.on('pong', () => {
            console.log('Pong recibido');
        });

        this.bybitWs.on('update', async (message) => {
            if (this.binanceBlock) {
                return
            }
            let arbitraje = false;
            for (const trade of message.data) {
                if (trade.symbol == 'TUSDUSDT' && trade.orderLinkId.includes('arbitrage')) {
                    console.log('Mensaje de actualización recibido:', trade);

                    arbitraje = true;
                    this.binanceBlock = true;
                    break;
                }
            }

            if (arbitraje) {
                console.log(`\nEjecutando arbitraje en Binance con precio ${this.binancePrice} y cantidad ${this.quantity}`);
                try {
                    await this.binanceClient.newOrder(
                        'TUSDUSDT',
                        this.binanceAction,
                        'LIMIT',
                        {
                            timeInForce: 'GTC',
                            price: this.binancePrice.toString(),
                            quantity: this.quantity.toString(),
                            recvWindow: 60000,
                            timestamp: Date.now()
                        }
                    )

                    acc += this.quantity * this.profit / 100
                    console.log(`\nArbitraje ejecutado con éxito en Binance. Ganancia acumulada: ${acc.toFixed(8)} USDT\n`);

                    this.recordProfit('TUSDUSDT', this.binanceAction, this.binancePrice, this.quantity, this.quantity * this.profit / 100, this.profit)


                } catch (error) {
                    console.error('Error placing order on Binance:', error);
                    errorCount++;
                } finally {
                    /* this.binancePrice = null
                    this.quantity = 0.0
                    this.binanceAction = null */
                    if (this.executionTimeout) {
                        clearTimeout(this.executionTimeout);
                        this.executionTimeout = null;
                    }
                    await new Promise(resolve => setTimeout(resolve, 300));
                    this.isExecuting = false;
                    console.log('Update handler: isExecuting reset');
                }
            }
        });

        this.bybitWs.subscribe(['execution'], 'TUSDUSDT');

        // Print acc in green every 20 seconds
        setInterval(() => {
            console.log(colorize.success(`Ganancia acumulada: ${acc.toFixed(8)} USDT`));
        }, 20000);
    }

    async executeArbitrage(opportunity) {
        if (this.isExecuting) {
            console.log(colorize.warning('Arbitrage already in progress, skipping... amount:' + opportunity.profit.toFixed(2)))
            return false
        }

        if (!this.isWsConnected) {
            console.log(colorize.warning('WebSocket not connected, skipping arbitrage execution...'))
            return false
        }

        console.log('Starting arbitrage execution...', opportunity)

        try {
            this.isExecuting = true
            console.log(colorize.info('Starting arbitrage execution...'))

            // Colocar orden en el primer exchange bybit
            this.quantity = opportunity.amount
            this.binancePrice = opportunity.buyExchange === 'bybit' ? opportunity.sellPrice : opportunity.buyPrice
            this.binanceAction = opportunity.buyExchange === 'bybit' ? 'SELL' : 'BUY'
            this.binanceBlock = false
            this.profit = opportunity.profit
            
            // TODO - MARCAR LA ORDEN
            const firstOrder = await this.bybitClient.submitOrder({
                symbol: 'TUSDUSDT',
                side: opportunity.buyExchange === 'bybit' ? 'BUY' : 'SELL',
                orderType: 'Limit',
                qty: opportunity.amount.toString(),
                price: opportunity.buyExchange === 'bybit' ? opportunity.buyPrice.toString() : opportunity.sellPrice.toString(),
                timeInForce: 'FOK',
                category: 'spot',
                orderLinkId: `arbitrage-${Date.now()}`
            })
            console.log('Orden colocada en Bybit:', firstOrder)

            if (firstOrder.retMsg != 'OK') {
                this.isExecuting = false
            }
            this.executionTimeout = setTimeout(() => {
                this.isExecuting = false;
                console.log('Timeout: isExecuting reset');
            }, 700);
            
        } catch (error) {
            console.error(colorize.error('Error executing arbitrage:'), error)
            return false
        }
    }

    async recordProfit(symbol, side, execPrice, execQty, priceAdjustment, profitPct) {
        try {
            await Profit.create({
                symbol: symbol,
                side: side  === 'BUY' ? 'Buy' : 'Sell',
                execPrice: mongoose.Types.Decimal128.fromString(execPrice.toString()),
                execQty: mongoose.Types.Decimal128.fromString(execQty.toFixed(2)),
                profit: mongoose.Types.Decimal128.fromString((priceAdjustment).toFixed(5)),
                profitPct: mongoose.Types.Decimal128.fromString(profitPct.toFixed(5)),
                createdAt: new Date(),
            });
        } catch (error) {
            console.error('Error creating profit record:', error);
        }
    }
}

module.exports = ArbitrageExecutor
