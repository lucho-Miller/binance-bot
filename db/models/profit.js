const mongoose = require('mongoose');

const profitSchema = new mongoose.Schema({
    symbol: { type: String, required: true }, // Símbolo del par, e.g., DAIUSDT
    side: { type: String, required: true, enum: ['Buy', 'Sell'], default: 'Sell' }, // Buy o Sell
    execPrice: { type: mongoose.Types.Decimal128, required: true }, // Precio de ejecución
    execQty: { type: mongoose.Types.Decimal128, required: true }, // Cantidad ejecutada
    profit: { type: mongoose.Types.Decimal128, required: true }, // Ganancia calculada
    profitPct: { type: mongoose.Types.Decimal128, required: true }, // Porcentaje de ganancia
    createdAt: { type: Date, default: Date.now } // Fecha de creación
});

profitSchema.index({ symbol: 1, createdAt: 1 });

const Profit = mongoose.model('Profit', profitSchema);

module.exports = Profit;
