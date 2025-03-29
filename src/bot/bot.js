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

// Инициализация состояния пользователей
const userStates = {};

// Middleware для передачи состояния и перехвата ctx.reply
bot.use((ctx, next) => {
  const userId = ctx.from?.id.toString();
  if (!userStates[userId]) {
    userStates[userId] = {
      step: null,
      selectedObjects: [],
      report: {},
      messageIds: []
    };
  }
  ctx.state.userStates = userStates;

  // Сохраняем оригинальный ctx.reply
  const originalReply = ctx.reply.bind(ctx);
  // Перехватываем ctx.reply
  ctx.reply = async (text, extra) => {
    const message = await originalReply(text, extra);
    if (userStates[userId]) {
      userStates[userId].messageIds.push(message.message_id);
      console.log(`Сообщение ${message.message_id} добавлено в messageIds для userId ${userId}. Текущий массив:`, userStates[userId].messageIds);
    } else {
      console.log(`Ошибка: userStates для ${userId} не инициализировано при отправке сообщения`);
    }
    return message;
  };

  return next();
});

// Перехватываем ctx.telegram.sendMessage для случаев, когда он используется напрямую
const originalSendMessage = bot.telegram.sendMessage.bind(bot.telegram);
bot.telegram.sendMessage = async (chatId, text, extra) => {
  const message = await originalSendMessage(chatId, text, extra);
  const userId = chatId.toString();
  if (userStates[userId]) {
    userStates[userId].messageIds.push(message.message_id);
    console.log(`Сообщение ${message.message_id} добавлено в messageIds для userId ${userId}. Текущий массив:`, userStates[userId].messageIds);
  } else {
    console.log(`Ошибка: userStates для ${userId} не инициализировано при отправке сообщения`);
  }
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