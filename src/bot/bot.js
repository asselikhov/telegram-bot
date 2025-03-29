const { Telegraf, Markup } = require('telegraf');
const { BOT_TOKEN, ADMIN_ID } = require('../config/config');
const { loadUsers, saveUser } = require('../database/userModel');
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

// Основной обработчик текста и команд
bot.on('text', async (ctx) => {
  const userId = ctx.from.id.toString();
  console.log(`[Глобальный] Получен текст от userId ${userId}: "${ctx.message.text}"`);
  const state = ctx.state.userStates[userId];
  console.log(`[Глобальный] Состояние для userId ${userId}:`, state);

  if (ctx.message.text === '/start') {
    const chatType = ctx.chat.type;
    if (chatType !== 'private') {
      await ctx.reply('Команда /start доступна только в личных сообщениях с ботом.');
      return;
    }

    const users = await loadUsers();
    if (!users[userId]) {
      users[userId] = {
        fullName: '',
        position: '',
        organization: '',
        selectedObjects: [],
        status: 'В работе',
        isApproved: false,
        nextReportId: 1,
        reports: {}
      };
      await saveUser(userId, users[userId]);
      state.step = 'selectObjects';
      state.messageIds = [];
      const message = await ctx.reply('Выберите объекты:', Markup.inlineKeyboard([[Markup.button.callback('Тестовый объект', 'select_object_0')]]));
      state.messageIds = [message.message_id];
      console.log(`Новый пользователь ${userId} начал регистрацию с выбора объектов`);
    } else if (users[userId].isApproved) {
      await require('./menu').showMainMenu(ctx);
    } else {
      const user = users[userId];
      state.messageIds = [];
      if (!user.selectedObjects.length) {
        state.step = 'selectObjects';
        const message = await ctx.reply('Выберите объекты:', Markup.inlineKeyboard([[Markup.button.callback('Тестовый объект', 'select_object_0')]]));
        state.messageIds = [message.message_id];
        console.log(`Пользователь ${userId} возобновил регистрацию с выбора объектов`);
      } else if (!user.position) {
        state.step = 'selectPosition';
        const message = await ctx.reply('Выберите должность:', Markup.inlineKeyboard([[Markup.button.callback('Тестовая должность', 'select_position_0')]]));
        state.messageIds = [message.message_id];
        console.log(`Пользователь ${userId} возобновил регистрацию с выбора должности`);
      } else if (!user.organization) {
        state.step = 'selectOrganization';
        const message = await ctx.reply('Выберите организацию:', Markup.inlineKeyboard([[Markup.button.callback('Тестовая организация', 'select_organization_0')]]));
        state.messageIds = [message.message_id];
        console.log(`Пользователь ${userId} возобновил регистрацию с выбора организации`);
      } else if (!user.fullName) {
        state.step = 'enterFullName';
        const message = await ctx.reply('Введите ваше ФИО:');
        state.messageIds = [message.message_id];
        console.log(`Пользователь ${userId} возобновил регистрацию с ввода ФИО`);
      } else {
        const message = await ctx.reply('Ваша заявка на рассмотрении, ожидайте');
        state.messageIds = [message.message_id];
        console.log(`Пользователь ${userId} уже заполнил заявку и ожидает подтверждения`);
      }
    }
  } else if (state && state.step === 'enterFullName') {
    const fullName = ctx.message.text.trim();
    const users = await loadUsers();
    users[userId].fullName = fullName;
    await saveUser(userId, users[userId]);
    await ctx.reply('Ваша заявка на рассмотрении, ожидайте');
    await ctx.telegram.sendMessage(ADMIN_ID, `📝 Новая заявка: ${fullName}`);
    console.log(`[Глобальный] Заявка отправлена для userId ${userId}`);
    state.step = null;
    state.messageIds = [];
  }
});

// Обработчики действий
bot.action(/select_object_(\d+)/, async (ctx) => {
  const userId = ctx.from.id.toString();
  const users = await loadUsers();
  users[userId].selectedObjects = ['Тестовый объект'];
  await saveUser(userId, users[userId]);
  ctx.state.userStates[userId].step = 'selectPosition';
  const message = await ctx.reply('Выберите должность:', Markup.inlineKeyboard([[Markup.button.callback('Тестовая должность', 'select_position_0')]]));
  ctx.state.userStates[userId].messageIds = [message.message_id];
  console.log(`Пользователь ${userId} выбрал объект, перешёл к выбору должности`);
});

bot.action(/select_position_(\d+)/, async (ctx) => {
  const userId = ctx.from.id.toString();
  const users = await loadUsers();
  users[userId].position = 'Тестовая должность';
  await saveUser(userId, users[userId]);
  ctx.state.userStates[userId].step = 'selectOrganization';
  const message = await ctx.reply('Выберите организацию:', Markup.inlineKeyboard([[Markup.button.callback('Тестовая организация', 'select_organization_0')]]));
  ctx.state.userStates[userId].messageIds = [message.message_id];
  console.log(`Пользователь ${userId} выбрал должность, перешёл к выбору организации`);
});

bot.action(/select_organization_(\d+)/, async (ctx) => {
  const userId = ctx.from.id.toString();
  const users = await loadUsers();
  users[userId].organization = 'Тестовая организация';
  await saveUser(userId, users[userId]);
  ctx.state.userStates[userId].step = 'enterFullName';
  const message = await ctx.reply('Введите ваше ФИО:');
  ctx.state.userStates[userId].messageIds = [message.message_id];
  console.log(`Шаг enterFullName установлен для userId ${userId}. State:`, ctx.state.userStates[userId]);
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