const express = require('express');
const { PORT } = require('../../config/config'); // Исправлен путь
const bot = require('../../bot/bot'); // Исправлен путь

const app = express();

app.use(express.json());
app.get('/', (req, res) => res.send('Telegram bot is running'));
app.use(bot.webhookCallback('/telegram-webhook'));

app.listen(PORT, async () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    const webhookUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/telegram-webhook`;
    try {
        const currentWebhook = await bot.telegram.getWebhookInfo();
        if (currentWebhook.url !== webhookUrl) {
            await bot.telegram.setWebhook(webhookUrl);
            console.log('Вебхук установлен');
        } else {
            console.log('Вебхук уже установлен');
        }
    } catch (err) {
        console.error('Ошибка установки вебхука:', err);
    }
});

module.exports = app;