require('dotenv').config();
const { initializeData, isDataInitialized } = require('./database/migrations/initializeData');
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