/**
 * Миграция: Обновление статусов пользователей с "В работе"/"В отпуске" на "Online"/"Offline"
 * 
 * Этот скрипт обновляет существующие записи в базе данных:
 * - "В работе" → "Online"
 * - "В отпуске" → "Offline"
 */

const { connectMongo } = require('../../config/mongoConfig');

async function migrateUserStatuses() {
    try {
        console.log('Начало миграции статусов пользователей...');
        
        const db = await connectMongo();
        const usersCollection = db.collection('users');
        
        // Обновляем статусы
        const resultWork = await usersCollection.updateMany(
            { status: 'В работе' },
            { $set: { status: 'Online' } }
        );
        
        const resultVacation = await usersCollection.updateMany(
            { status: 'В отпуске' },
            { $set: { status: 'Offline' } }
        );
        
        console.log(`Миграция завершена:`);
        console.log(`- Обновлено записей со статусом "В работе" → "Online": ${resultWork.modifiedCount}`);
        console.log(`- Обновлено записей со статусом "В отпуске" → "Offline": ${resultVacation.modifiedCount}`);
        console.log(`Всего обновлено: ${resultWork.modifiedCount + resultVacation.modifiedCount} записей`);
        
        return {
            success: true,
            modifiedCount: resultWork.modifiedCount + resultVacation.modifiedCount,
            workToOnline: resultWork.modifiedCount,
            vacationToOffline: resultVacation.modifiedCount
        };
    } catch (error) {
        console.error('Ошибка при миграции статусов пользователей:', error);
        throw error;
    }
}

// Если скрипт запущен напрямую
if (require.main === module) {
    migrateUserStatuses()
        .then(() => {
            console.log('Миграция успешно завершена');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Ошибка миграции:', error);
            process.exit(1);
        });
}

module.exports = { migrateUserStatuses };
