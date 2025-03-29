const { Telegraf } = require('telegraf');
const { BOT_TOKEN } = require('../config/config');
const startHandler = require('./handlers/start');
const menuHandler = require('./handlers/menu');
const reportHandler = require('./handlers/report');
const adminHandler = require('./handlers/admin');
const commandsHandler = require('./handlers/commands');
const positionActions = require('./actions/position');
const organizationActions = require('./actions/organization');
const objectsActions = require('./actions/objects');
const statusActions = require('./actions/status');

const bot = new Telegraf(BOT_TOKEN);

// Инициализация состояния
const userStates = {};

bot.use((ctx, next) => {
  ctx.state.userStates = userStates; // Передаём состояние пользователей
  ctx.state.lastMessageId = null;    // Храним ID последнего сообщения
  return next();
});

// Перехватываем отправку сообщений, чтобы сохранить message_id
const originalReply = bot.telegram.sendMessage.bind(bot.telegram);
bot.telegram.sendMessage = async (chatId, text, extra) => {
  const message = await originalReply(chatId, text, extra);
  if (ctx.state) ctx.state.lastMessageId = message.message_id; // Сохраняем ID
  return message;
};

startHandler(bot);
menuHandler(bot);
reportHandler(bot);
adminHandler(bot);
commandsHandler(bot);
positionActions(bot);
organizationActions(bot);
objectsActions(bot);
statusActions(bot);

module.exports = bot;