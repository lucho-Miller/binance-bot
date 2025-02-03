require('dotenv').config();
const mongoose = require('mongoose');

async function connectDB() {
    try {
        await mongoose.connect(process.env.DB_URI);
        console.log('Conexión exitosa a MongoDB Atlas');
    } catch (error) {
        console.error('Error al conectar a MongoDB Atlas:', error.message);
        process.exit(1);
    }
}

mongoose.connection.on('disconnected', () => {
    console.error('Desconectado de MongoDB. Intentando reconectar...');
    connectDB();
});

module.exports = connectDB;
