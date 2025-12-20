// config.js
// Конфигурационный файл - содержит только статические константы
// Динамические данные (организации, должности, объекты) загружаются из MongoDB через configService

require('dotenv').config();

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    ADMIN_ID: process.env.ADMIN_ID || '942851377',
    DATABASE_URL: process.env.DATABASE_URL,
    PORT: process.env.PORT || 3000
};