require('dotenv').config();
const bot = require('./bot/bot');
require('./server/server');

async function startApp() {
    try {
        console.log('Запуск приложения...');
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