const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/telegram_bot';
const client = new MongoClient(uri, { useUnifiedTopology: true });

async function connectMongo() {
    try {
        console.log('Инициализация подключения к MongoDB с URI:', uri.replace(/:.*@/, ':<hidden>@'));
        await client.connect();
        console.log('Подключено к MongoDB');
        return client.db();
    } catch (err) {
        console.error('Ошибка подключения к MongoDB:', err);
        throw err;
    }
}

module.exports = { connectMongo };