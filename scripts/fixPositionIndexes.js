// Скрипт для исправления индексов коллекции positions
// Удаляет старые индексы и создает правильный составной уникальный индекс
require('dotenv').config();
const { connectMongo } = require('../src/config/mongoConfig');

async function fixIndexes() {
    try {
        console.log('Подключение к MongoDB...');
        const db = await connectMongo();
        const collection = db.collection('positions');
        
        console.log('Текущие индексы:');
        const indexes = await collection.indexes();
        console.log(JSON.stringify(indexes, null, 2));
        
        // Удаляем все старые индексы, кроме _id
        console.log('\nУдаление старых индексов...');
        for (const index of indexes) {
            if (index.name !== '_id_') {
                try {
                    await collection.dropIndex(index.name);
                    console.log(`  Удален индекс: ${index.name}`);
                } catch (e) {
                    console.log(`  Не удалось удалить индекс ${index.name}: ${e.message}`);
                }
            }
        }
        
        // Создаем правильный составной уникальный индекс
        console.log('\nСоздание нового составного уникального индекса...');
        await collection.createIndex({ organization: 1, name: 1 }, { unique: true });
        console.log('  ✅ Создан индекс: { organization: 1, name: 1 } (unique)');
        
        console.log('\nФинальные индексы:');
        const finalIndexes = await collection.indexes();
        console.log(JSON.stringify(finalIndexes, null, 2));
        
        console.log('\n✅ Индексы успешно исправлены!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Ошибка при исправлении индексов:', error);
        process.exit(1);
    }
}

fixIndexes();

