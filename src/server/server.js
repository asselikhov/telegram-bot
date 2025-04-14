const express = require('express');
const { PORT } = require('../config/config');
const bot = require('../bot/bot');

const app = express();

app.use(express.json());

// Существующий маршрут для проверки работы бота
app.get('/', (req, res) => res.send('Telegram bot is running'));

// Маршрут для UptimeRobot с проверкой вебхука
app.get('/ping', async (req, res) => {
    try {
        console.log('Ping received at', new Date().toISOString());
        // Проверяем статус вебхука
        const webhookInfo = await bot.telegram.getWebhookInfo();
        if (webhookInfo.url) {
            res.send('Bot is awake!');
        } else {
            res.status(500).send('Bot webhook not set');
        }
    } catch (err) {
        console.error('Ping error:', err);
        res.status(500).send('Bot ping failed');
    }
});

// Обработка вебхуков от Telegram
app.use(bot.webhookCallback('/telegram-webhook'));

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    const webhookUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/telegram-webhook`;
    bot.telegram.setWebhook(webhookUrl)
        .then(() => console.log('Вебхук установлен'))
        .catch(err => console.error('Ошибка установки вебхука:', err));
});

module.exports = app;