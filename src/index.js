const { initializeDatabase } = require('./database/db');
const bot = require('./bot/bot');
require('./server/server');

initializeDatabase();

process.on('uncaughtException', (err) => {
    process.exit(1);
});