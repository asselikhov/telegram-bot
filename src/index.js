require('dotenv').config();
const { initializeData, isDataInitialized } = require('./database/migrations/initializeData');
const { migrateUserStatuses } = require('./database/migrations/migrateUserStatuses');
const bot = require('./bot/bot');
require('./server/server');

async function startApp() {
    try {
        console.log('Запуск приложения...');
        
        // Проверяем, нужно ли инициализировать данные
        const dataInitialized = await isDataInitialized();
        if (!dataInitialized) {
            console.log('Инициализация данных из config.js...');
            await initializeData();
        }
        
        // Выполняем миграцию статусов пользователей (если нужно)
        try {
            await migrateUserStatuses();
        } catch (migrationError) {
            console.error('Ошибка при миграции статусов пользователей (может быть уже выполнена):', migrationError.message);
        }
        
        // Запускаем задачу напоминаний после инициализации данных
        if (bot.setupReminderCron) {
            await bot.setupReminderCron();
        }
        
        // Бот и сервер запускаются через require('./bot/bot') и require('./server/server')
    } catch (err) {
        console.error('Ошибка при запуске приложения:', err);
        process.exit(1);
    }
}

startApp();

process.on('uncaughtException', (err) => {
    console.error('Неперехваченная ошибка:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Не завершаем процесс, так как это может быть не критичная ошибка
    // Но логируем для дальнейшего анализа
});