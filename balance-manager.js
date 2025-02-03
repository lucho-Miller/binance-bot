const balanceState = {
    binance: {
        USDT: 0.0,
        TUSD: 0.0,
        lastUpdate: null
    },
    bybit: {
        USDT: 0.0,
        TUSD: 0.0,
        lastUpdate: null
    },
    totals: {
        USDT: 0.0,
        TUSD: 0.0,
        lastUpdate: null
    }
};

const connectionState = {
    binance: false,
    bybit: false
};

function updateBalance(exchange, currency, amount) {
    balanceState[exchange][currency] = parseFloat(amount);
    balanceState[exchange].lastUpdate = new Date().toISOString();
    updateTotals();
}

function updateTotals() {
    balanceState.totals = {
        USDT: (parseFloat(balanceState.binance.USDT) + parseFloat(balanceState.bybit.USDT)).toFixed(8),
        TUSD: (parseFloat(balanceState.binance.TUSD) + parseFloat(balanceState.bybit.TUSD)).toFixed(8),
        lastUpdate: new Date().toISOString()
    };
}

function getBalances() {
    return balanceState;
}

function getExchangeBalance(exchange) {
    return balanceState[exchange];
}

function getTotals() {
    return balanceState.totals;
}

function updateConnectionState(exchange, isConnected) {
    connectionState[exchange] = isConnected;
}

function getConnectionState(exchange) {
    if (exchange) {
        return connectionState[exchange];
    }
    return {...connectionState};
}

module.exports = {
    updateBalance,
    getBalances,
    getExchangeBalance,
    getTotals,
    updateConnectionState,
    getConnectionState
};
