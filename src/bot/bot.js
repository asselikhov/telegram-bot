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
const { formatDate } = require('./utils');

const bot = new Telegraf(BOT_TOKEN);

const userStates = {};

bot.use((ctx, next) => {
  const userId = ctx.from?.id.toString();
  if (!userId) {
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
      }
    }
    return message;
  };

  return next();
});

bot.action(/.*/, (ctx, next) => {
  return next();
});

async function sendReportReminders() {
  const moscowTime = new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' });
  const currentDate = new Date(moscowTime);
  const formattedDate = formatDate(currentDate);

  const users = await loadUsers();
  const producers = Object.entries(users).filter(([_, user]) =>
      user.position === 'Производитель работ' &&
      user.isApproved &&
      user.status === 'В работе'
  );

  for (const [userId, user] of producers) {
    const reports = await loadUserReports(userId);
    const todayReports = Object.values(reports).filter(report => report.date === formattedDate);

    for (const objectName of user.selectedObjects) {
      const hasReport = todayReports.some(report => report.objectName === objectName);
      if (!hasReport) {
        const groupChatId = OBJECT_GROUPS[objectName];
        if (groupChatId) {
          const reminderText = `
⚠️ Напоминание
${user.fullName}, вы не предоставили отчет за ${formattedDate}.

Пожалуйста, внесите данные.
                    `.trim();
          try {
            await bot.telegram.sendMessage(groupChatId, reminderText);
          } catch (error) {
            console.error(`Ошибка отправки напоминания для ${userId} в чат ${groupChatId}:`, error);
          }
        }
      }
    }
  }
}

cron.schedule('0 19 * * *', () => {
  console.log('Запуск задачи отправки напоминаний об отчетах');
  sendReportReminders();
}, {
  timezone: "Europe/Moscow"
});

console.log('Инициализация обработчиков бота...');
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
console.log('Все обработчики инициализированы');

module.exports = bot;