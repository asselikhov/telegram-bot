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

// Middleware для передачи состояния и управления сообщениями
bot.use((ctx, next) => {
  const userId = ctx.from?.id.toString();
  if (!userStates[userId]) {
    userStates[userId] = {
      step: null,
      selectedObjects: [],
      report: {},
      messageIds: [] // Массив для хранения ID сообщений бота
    };
  }
  ctx.state.userStates = userStates;
  return next();
});

// Перехватываем отправку сообщений для сохранения message_id
const originalReply = bot.telegram.sendMessage.bind(bot.telegram);
bot.telegram.sendMessage = async (chatId, text, extra) => {
  const message = await originalReply(chatId, text, extra);
  const userId = chatId.toString();
  if (userStates[userId]) {
    userStates[userId].messageIds.push(message.message_id);
  }
  return message;
};

// Функция для удаления всех предыдущих сообщений пользователя
async function clearPreviousMessages(ctx, userId) {
  const state = ctx.state.userStates[userId];
  if (state && state.messageIds.length > 0) {
    for (const messageId of state.messageIds) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
      } catch (e) {
        console.log(`Не удалось удалить сообщение ${messageId}:`, e.message);
      }
    }
    state.messageIds = []; // Очищаем массив после удаления
  }
}

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
module.exports.clearPreviousMessages = clearPreviousMessages; // Экспортируем для использования в других модулях