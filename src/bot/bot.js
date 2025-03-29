const { Telegraf, Markup } = require('telegraf');
const { BOT_TOKEN, ADMIN_ID } = require('../../config/config'); // На два уровня вверх от src/bot/
const { loadUsers, saveUser } = require('../../database/userModel'); // На два уровня вверх
const { getState, resetState } = require('../../stateManager'); // На два уровня вверх

const bot = new Telegraf(BOT_TOKEN);

bot.use((ctx, next) => {
  const userId = ctx.from?.id.toString();
  if (!userId) {
    console.log('Ошибка: userId не определён в контексте:', ctx.from);
    return next();
  }
  ctx.state = getState(userId);
  const originalReply = ctx.reply.bind(ctx);
  ctx.reply = async (text, extra) => {
    const message = await originalReply(text, extra);
    ctx.state.messageIds.push(message.message_id);
    return message;
  };
  return next();
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id.toString();
  const state = ctx.state;

  if (ctx.message.text === '/start') {
    if (ctx.chat.type !== 'private') {
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
      await require('../../actions/objects').showObjectSelection(ctx, userId); // Исправлен путь
    } else if (users[userId].isApproved) {
      await require('../../handlers/menu').showMainMenu(ctx); // Исправлен путь
    } else {
      const user = users[userId];
      if (!user.selectedObjects.length) {
        state.step = 'selectObjects';
        await require('../../actions/objects').showObjectSelection(ctx, userId); // Исправлен путь
      } else if (!user.position) {
        state.step = 'selectPosition';
        await require('../../actions/position').showPositionSelection(ctx, userId); // Исправлен путь
      } else if (!user.organization) {
        state.step = 'selectOrganization';
        await require('../../actions/organization').showOrganizationSelection(ctx, userId); // Исправлен путь
      } else if (!user.fullName) {
        state.step = 'enterFullName';
        await ctx.reply('Введите ваше ФИО:');
      } else {
        await ctx.reply('Ваша заявка на рассмотрении, ожидайте');
      }
    }
  } else if (state.step === 'enterFullName') {
    const fullName = ctx.message.text.trim();
    if (!fullName) {
      await ctx.reply('ФИО не может быть пустым. Введите ваше ФИО:');
      return;
    }
    const users = await loadUsers();
    users[userId].fullName = fullName;
    await saveUser(userId, users[userId]);
    await ctx.reply('Ваша заявка на рассмотрении, ожидайте');
    await ctx.telegram.sendMessage(ADMIN_ID, `📝 Новая заявка: ${fullName}`);
    resetState(userId);
  }
});

// Исправленные пути для обработчиков и действий
require('../../handlers/commands')(bot); // Исправлен путь
require('../../handlers/menu')(bot); // Исправлен путь
require('../../handlers/report')(bot); // Исправлен путь
require('../../handlers/admin')(bot); // Исправлен путь
require('../../actions/position')(bot); // Исправлен путь
require('../../actions/organization')(bot); // Исправлен путь
require('../../actions/objects')(bot); // Исправлен путь
require('../../actions/status')(bot); // Исправлен путь

module.exports = bot;