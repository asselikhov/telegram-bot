// config.js
// Конфигурационный файл - содержит только статические константы
// Динамические данные (организации, должности, объекты) загружаются из MongoDB через configService

require('dotenv').config();

// Проверяем обязательные переменные окружения
if (!process.env.BOT_TOKEN) {
    throw new Error('BOT_TOKEN environment variable is required');
}
if (!process.env.ADMIN_ID) {
    throw new Error('ADMIN_ID environment variable is required');
}

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    ADMIN_ID: process.env.ADMIN_ID,
    DATABASE_URL: process.env.DATABASE_URL,
    PORT: process.env.PORT || 3000
};