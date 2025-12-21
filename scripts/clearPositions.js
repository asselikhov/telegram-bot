// Используем переменные окружения для подключения к MongoDB (как в основном приложении)
require('dotenv').config();
const { connectMongo } = require('../src/config/mongoConfig');

async function clearPositions() {
    try {
        console.log('Подключение к MongoDB...');
        const db = await connectMongo();
        const collection = db.collection('positions');
        
        // Сначала покажем, сколько должностей есть
        const count = await collection.countDocuments({});
        console.log(`Найдено должностей в базе: ${count}`);
        
        if (count === 0) {
            console.log('✅ Должности уже отсутствуют в базе данных.');
            process.exit(0);
            return;
        }
        
        console.log('Удаление всех должностей...');
        const result = await collection.deleteMany({});
        
        console.log(`✅ Удалено ${result.deletedCount} должностей.`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Ошибка при удалении должностей:', error);
        process.exit(1);
    }
}

clearPositions();

