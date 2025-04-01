const { initializeDatabase } = require('./database/db');
delete require.cache[require.resolve('./bot/handlers/report.js')];
const bot = require('./bot/bot');
require('./server/server');

initializeDatabase();

process.on('uncaughtException', (err) => {
    console.error('Необработанное исключение:', err);
    process.exit(1);
});