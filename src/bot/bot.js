const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const NodeCache = require('node-cache');
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

// Инициализация кэша
const userCache = new NodeCache({ stdTTL: 300 }); // 5 минут TTL

const bot = new Telegraf(BOT_TOKEN);

const userStates = {};

bot.use((ctx, next) => {
  const userId = ctx.from?.id.toString();
  if (!userId) return next();

  if (!userStates[userId]) {
    userStates[userId] = { step: null, report: {}, lastMessageId: null }; // Уменьшено хранение данных
  }
  ctx.state.userStates = userStates;

  // Перехват reply для хранения только последнего сообщения
  const originalReply = ctx.reply.bind(ctx);
  ctx.reply = async (text, extra) => {
    const message = await originalReply(text, extra);
    userStates[userId].lastMessageId = message.message_id;
    return message;
  };

  return next();
});

bot.action(/.*/, (ctx, next) => next());

// Оптимизированная отправка напоминаний с параллельной обработкой
async function sendReportReminders() {
  const moscowTime = new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' });
  const currentDate = new Date(moscowTime);
  const formattedDate = formatDate(currentDate);

  const users = userCache.get('users') || await loadUsers();
  const producers = Object.entries(users).filter(([_, user]) =>
      user.position === 'Производитель работ' && user.isApproved && user.status === 'В работе'
  );

  const reminderPromises = producers.map(async ([userId, user]) => {
    const reports = await loadUserReports(userId);
    const todayReports = Object.values(reports).filter(report => report.date === formattedDate);

    return Promise.all(user.selectedObjects.map(async objectName => {
      if (!todayReports.some(report => report.objectName === objectName)) {
        const groupChatId = OBJECT_GROUPS[objectName];
        if (groupChatId) {
          const reminderText = `⚠️ Напоминание\n${user.fullName}, вы не предоставили отчет за ${formattedDate}.\nПожалуйста, внесите данные.`;
          await bot.telegram.sendMessage(groupChatId, reminderText).catch(() => {});
        }
      }
    }));
  });

  await Promise.all(reminderPromises);
}

cron.schedule('0 19 * * *', sendReportReminders, { timezone: 'Europe/Moscow' });

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