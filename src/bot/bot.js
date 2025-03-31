const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const { BOT_TOKEN, OBJECT_GROUPS } = require('../config/config');
const startHandler = require('./handlers/start');
const menuHandler = require('./handlers/menu');
const reportHandler = require('./handlers/report');
const adminHandler = require('./handlers/admin');
const commandsHandler = require('./handlers/commands');
const inviteCodeHandler = require('./handlers/inviteCodeHandler');
const textHandler = require('./handlers/textHandler');
const positionActions = require('./actions/position');
const organizationActions = require('./actions/organization');
const objectsActions = require('./actions/objects');
const statusActions = require('./actions/status');
const { loadUsers } = require('../database/userModel');
const { loadUserReports } = require('../database/reportModel');

const bot = new Telegraf(BOT_TOKEN);

const userStates = {};

bot.use((ctx, next) => {
  console.log('[middleware] Получен update:', ctx.update);
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
      if (!userStates[userId].messageIds.includes(message.message_id)) {
        userStates[userId].messageIds.push(message.message_id);
        console.log(`[ctx.reply] Сообщение ${message.message_id} добавлено в messageIds для userId ${userId}. Массив:`, userStates[userId].messageIds);
      }
    }
    return message;
  };

  const originalSendMessage = bot.telegram.sendMessage.bind(bot.telegram);
  bot.telegram.sendMessage = async (chatId, text, extra) => {
    const message = await originalSendMessage(chatId, text, extra);
    const targetUserId = chatId.toString();
    if (userStates[targetUserId]) {
      if (!userStates[targetUserId].messageIds.includes(message.message_id)) {
        userStates[targetUserId].messageIds.push(message.message_id);
        console.log(`[sendMessage] Сообщение ${message.message_id} добавлено в messageIds для userId ${targetUserId}. Массив:`, userStates[targetUserId].messageIds);
      }
    }
    return message;
  };

  return next();
});

bot.action(/.*/, (ctx, next) => {
  console.log('[DEBUG] Получено действие:', ctx.match[0], 'от userId:', ctx.from.id);
  return next();
});

async function sendReportReminders() {
  const moscowTime = new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' });
  const currentDate = moscowTime.split(',')[0].split('/').reverse().join('-');

  const users = await loadUsers();
  const producers = Object.entries(users).filter(([_, user]) =>
      user.position === 'Производитель работ' &&
      user.isApproved &&
      user.status === 'В работе'
  );

  for (const [userId, user] of producers) {
    const reports = await loadUserReports(userId);
    const todayReports = Object.values(reports).filter(report => report.date === currentDate);

    for (const objectName of user.selectedObjects) {
      const hasReport = todayReports.some(report => report.objectName === objectName);
      if (!hasReport) {
        const groupChatId = OBJECT_GROUPS[objectName];
        if (groupChatId) {
          const reminderText = `
⚠️ Напоминание
${user.fullName}, вы не предоставили отчет за ${currentDate}.

Пожалуйста, внесите данные.
                 `.trim();
          try {
            await bot.telegram.sendMessage(groupChatId, reminderText);
            console.log(`Напоминание отправлено для ${user.fullName} в группу ${groupChatId} в 19:00 по Москве`);
          } catch (error) {
            console.error(`Ошибка при отправке напоминания для ${user.fullName}:`, error.message);
          }
        }
      }
    }
  }
}

cron.schedule('0 19 * * *', () => {
  console.log('Проверка отчетов на наличие в 19:00 по Москве:', new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }));
  sendReportReminders();
}, {
  timezone: "Europe/Moscow"
});

startHandler(bot);
menuHandler(bot);
reportHandler(bot);
adminHandler(bot);
commandsHandler(bot);
inviteCodeHandler(bot);
textHandler(bot);
positionActions(bot);
organizationActions(bot);
objectsActions(bot);
statusActions(bot);

module.exports = bot;