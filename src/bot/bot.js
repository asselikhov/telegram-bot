const { Telegraf, Markup } = require('telegraf');
const { BOT_TOKEN, ADMIN_ID } = require('../config/config');
const { loadUsers, saveUser } = require('../database/userModel');
const { getState, resetState } = require('../stateManager');

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
      await require('../actions/objects').showObjectSelection(ctx, userId);
    } else if (users[userId].isApproved) {
      await require('./handlers/menu').showMainMenu(ctx);
    } else {
      const user = users[userId];
      if (!user.selectedObjects.length) {
        state.step = 'selectObjects';
        await require('../actions/objects').showObjectSelection(ctx, userId);
      } else if (!user.position) {
        state.step = 'selectPosition';
        await require('../actions/position').showPositionSelection(ctx, userId);
      } else if (!user.organization) {
        state.step = 'selectOrganization';
        await require('../actions/organization').showOrganizationSelection(ctx, userId);
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

require('./handlers/commands')(bot);
require('./handlers/menu')(bot);
require('./handlers/report')(bot);
require('./handlers/admin')(bot);
require('./actions/position')(bot);
require('./actions/organization')(bot);
require('./actions/objects')(bot);
require('./actions/status')(bot);

module.exports = bot;