require('dotenv').config();
const { connectMongo } = require('../src/config/mongoConfig');

async function deleteNeedsExceptRamis() {
    try {
        const db = await connectMongo();
        const usersCollection = db.collection('users');
        const needsCollection = db.collection('needs');
        
        // Находим пользователя "Рамиз"
        const ramisUser = await usersCollection.findOne({ 
            fullName: { $regex: /Рамиз/i } 
        });
        
        if (!ramisUser) {
            console.log('Пользователь "Рамиз" не найден в базе данных');
            return;
        }
        
        const ramisUserId = String(ramisUser.telegramId);
        console.log(`Найден пользователь: ${ramisUser.fullName}, telegramId: ${ramisUserId}`);
        
        // Получаем все потребности
        const allNeeds = await needsCollection.find({}).toArray();
        console.log(`Всего потребностей в базе: ${allNeeds.length}`);
        
        // Находим потребности, которые НЕ принадлежат Рамизу
        const needsToDelete = allNeeds.filter(need => String(need.userid) !== ramisUserId);
        console.log(`Потребностей для удаления (не Рамиза): ${needsToDelete.length}`);
        console.log(`Потребностей Рамиза (будут сохранены): ${allNeeds.length - needsToDelete.length}`);
        
        if (needsToDelete.length === 0) {
            console.log('Нет потребностей для удаления');
            return;
        }
        
        // Удаляем все потребности, кроме потребностей Рамиса
        const needIdsToDelete = needsToDelete.map(need => need.needid);
        const result = await needsCollection.deleteMany({ 
            needid: { $in: needIdsToDelete }
        });
        
        console.log(`Удалено потребностей: ${result.deletedCount}`);
        console.log('Готово!');
        
        process.exit(0);
    } catch (error) {
        console.error('Ошибка при удалении потребностей:', error);
        process.exit(1);
    }
}

deleteNeedsExceptRamis();
