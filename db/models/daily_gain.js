const mongoose = require('mongoose');

const dailyGainSchema = new mongoose.Schema({
    symbol: { type: String, required: true }, // Símbolo del par, e.g., DAIUSDT
    profit: { type: mongoose.Types.Decimal128, required: true }, // Ganancia calculada
    createdAt: { type: Date, default: Date.now }, // Fecha de creación
    investedAmount: { type: mongoose.Types.Decimal128, required: true }, // Monto invertido
    profitPercentage: { type: mongoose.Types.Decimal128, required: true }, // Porcentaje de ganancia
    date: { type: Date, required: true } // Fecha de la ganancia
});

const DailyGain = mongoose.model('daily_gain', dailyGainSchema);

module.exports = DailyGain;
