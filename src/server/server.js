const express = require('express');
const { PORT } = require('../config/config');
const bot = require('../bot/bot');

const app = express();

app.use(express.json());
app.get('/', (req, res) => res.send('Telegram bot is running'));
app.use('/telegram-webhook', bot.webhookCallback('/telegram-webhook')); // Упрощен путь

app.listen(PORT, async () => {
    const webhookUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/telegram-webhook`;
    await bot.telegram.setWebhook(webhookUrl).catch(err => {});
});

module.exports = app;