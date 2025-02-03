const mongoose = require('mongoose');

const symbolSchema = new mongoose.Schema({
    symbol: { type: String, required: true, unique: true }, // Símbolo del par, e.g., DAIUSDT
    enabled: { type: Boolean, required: true, default: true }, // Habilitado
    priceAdjustment: { type: mongoose.Types.Decimal128, required: true, default: 0.0001 }, // Ajuste de precio
    highPrice: { type: mongoose.Types.Decimal128, required: true, default: 1.0100 }, // Precio alto
    lowPrice: { type: mongoose.Types.Decimal128, required: true, default: 0.9900 }, // Precio bajo
    createdAt: { type: Date, default: Date.now } // Fecha de creación
});

const Symbol = mongoose.model('Symbol', symbolSchema);

module.exports = Symbol;
