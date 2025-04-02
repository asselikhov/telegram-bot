const { initializeDatabase } = require('./database/db');
const bot = require('./bot/bot');
require('./server/server');

initializeDatabase().then(() => {
    bot.launch(); // Явный запуск бота после инициализации БД
}).catch(err => {
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    process.exit(1);
});