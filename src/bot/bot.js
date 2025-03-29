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
  if (!userId) {
    console.log('Ошибка: userId не определён в контексте:', ctx.from);
    return next();
  }
  if (!userStates[userId]) {
    userStates[userId] = {
      step: null,
      selectedObjects: [],
      report: {},
      messageIds: []
    };
  }
  ctx.state.userStates = userStates;

  const originalReply = ctx.reply.bind(ctx);
  ctx.reply = async (text, extra) => {
    const message = await originalReply(text, extra);
    if (userStates[userId]) {
      userStates[userId].messageIds.push(message.message_id);
      console.log(`[ctx.reply] Сообщение ${message.message_id} добавлено в messageIds для userId ${userId}. Массив:`, userStates[userId].messageIds);
    }
    return message;
  };

  return next();
});

// Глобальный обработчик текста для диагностики
bot.on('text', async (ctx) => {
  const userId = ctx.from.id.toString();
  console.log(`[Глобальный] Получен текст от userId ${userId}: "${ctx.message.text}"`);
  const state = ctx.state.userStates[userId];
  console.log(`[Глобальный] Состояние для userId ${userId}:`, state);
  await ctx.reply(`Эхо: ${ctx.message.text}`);
  console.log(`[Глобальный] Ответ отправлен для userId ${userId}`);
});

// Подключение остальных обработчиков
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