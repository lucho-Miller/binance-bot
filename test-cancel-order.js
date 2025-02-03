const { RestClientV5 } = require('bybit-api');
require('dotenv').config();
const { Spot } = require('@binance/connector')


const API_KEY = process.env.BYBIT_API_KEY;
const API_SECRET = process.env.BYBIT_API_SECRET;

const client = new RestClientV5({
    testnet: false,
    key: API_KEY,
    secret: API_SECRET,
});

const binanceClient = new Spot(
    process.env.BINANCE_API_KEY,
    process.env.BINANCE_API_SECRET
);

async function cancelOrder() {
    try {
        const startTime = performance.now();

        const buy = await client.submitOrder({
            category: 'spot',
            symbol: 'TUSDUSDT',
            side: 'BUY',
            orderType: 'Limit',
            qty: '1.1',
            price: '0.9984',
            timeInForce: 'FOK',
            orderLinkId: `arbitrage-${Date.now()}`,
        });
        console.log(buy);

        /* const response = await client.cancelOrder({
            category: 'spot',
            symbol: 'TUSDUSDT',
            order_id: '1872046206415541760',
        });
        console.log(response); */

        /* const order = await binanceClient.newOrder(
          'TUSDUSDT',
          'BUY',
          'LIMIT',
          {
              price: '0.8',
              quantity: '7',
              timeInForce: 'GTC'
          }
        )

        console.log(order); */


        const endTime = performance.now();
        const timeElapsed = endTime - startTime;
        console.log(`Time elapsed: ${timeElapsed.toFixed(2)} milliseconds`);
    } catch (error) {
        console.error(error);
    }
}

cancelOrder();