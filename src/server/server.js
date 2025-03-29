const express = require('express');
const { PORT } = require('../config/config');
const bot = require('../bot/bot');
const { pool } = require('../database/db');

const app = express();

app.use(express.json());
app.get('/', (req, res) => res.send('Telegram bot is running'));
app.use(bot.webhookCallback('/telegram-webhook'));

app.listen(PORT, async () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    try {
        const client = await pool.connect();
        console.log('Подключено к базе данных PostgreSQL');
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                userId TEXT PRIMARY KEY,
                fullName TEXT,
                position TEXT,
                organization TEXT,
                selectedObjects JSONB DEFAULT '[]',
                status TEXT DEFAULT 'В работе',
                isApproved BOOLEAN DEFAULT FALSE,
                nextReportId INTEGER DEFAULT 1,
                reports JSONB DEFAULT '{}'
            );
            CREATE TABLE IF NOT EXISTS reports (
                reportId TEXT PRIMARY KEY,
                userId TEXT,
                objectName TEXT,
                date TEXT,
                timestamp TEXT,
                workDone TEXT,
                materials TEXT,
                groupMessageId INTEGER,
                generalMessageId INTEGER,
                fullName TEXT
            );
        `);
        console.log('Таблицы созданы или уже существуют');
        client.release();

        const webhookUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/telegram-webhook`;
        await bot.telegram.setWebhook(webhookUrl);
        console.log('Вебхук установлен');
    } catch (err) {
        console.error('Ошибка при запуске сервера:', err);
    }
});

module.exports = app;