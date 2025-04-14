const { MongoClient } = require('mongodb');

let client;

async function connectMongo() {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/telegram_bot';
    if (client && client.topology?.isConnected()) {
        console.log('Используется существующее подключение к MongoDB');
        return client.db('test');
    }

    try {
        console.log('Инициализация подключения к MongoDB с URI:', uri.replace(/:.*@/, ':<hidden>@'));
        client = new MongoClient(uri, {
            serverSelectionTimeoutMS: 5000
        });
        await client.connect();
        console.log('Подключено к MongoDB');
        return client.db('test');
    } catch (err) {
        console.error('Ошибка подключения к MongoDB:', err);
        throw err;
    }
}

module.exports = { connectMongo };