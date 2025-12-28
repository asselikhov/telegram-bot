require('dotenv').config();
const { connectMongo } = require('../src/config/mongoConfig');

async function clearAllNeeds() {
    try {
        console.log('Начало удаления всех заявок...');
        const db = await connectMongo();
        const needsCollection = db.collection('needs');
        
        const countBefore = await needsCollection.countDocuments();
        console.log(`Всего заявок в базе: ${countBefore}`);
        
        if (countBefore === 0) {
            console.log('Заявок в базе нет, удалять нечего.');
            process.exit(0);
        }
        
        const result = await needsCollection.deleteMany({});
        console.log(`Удалено заявок: ${result.deletedCount}`);
        console.log('Все заявки успешно удалены из базы данных.');
        
        process.exit(0);
    } catch (error) {
        console.error('Ошибка при удалении заявок:', error);
        process.exit(1);
    }
}

clearAllNeeds();
