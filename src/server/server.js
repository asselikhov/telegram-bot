const express = require('express');
const { PORT } = require('../config/config');
const bot = require('../bot/bot');

const app = express();

app.use(express.json());
app.get('/', (req, res) => res.send('Telegram bot is running'));
app.use(bot.webhookCallback('/telegram-webhook'));

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    const webhookUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/telegram-webhook`;
    bot.telegram.setWebhook(webhookUrl)
        .then(() => console.log('Вебхук установлен'))
        .catch(err => console.error('Ошибка установки вебхука:', err));
});

module.exports = app;