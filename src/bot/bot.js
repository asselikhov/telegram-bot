const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const { BOT_TOKEN } = require('../config/config');
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
const { getNotificationSettings, getObjectGroups } = require('../database/configService');
const { formatNotificationMessage, parseTimeToCron } = require('./utils/notificationHelper');

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

let reminderCronTask = null;

async function sendReportReminders() {
  try {
    // Загружаем настройки уведомлений
    const settings = await getNotificationSettings();
    
    // Проверяем, включены ли уведомления
    if (!settings.enabled) {
      console.log('Уведомления отключены, пропускаем отправку напоминаний');
      return;
    }

    const moscowTime = new Date().toLocaleString('en-US', { timeZone: settings.timezone || 'Europe/Moscow' });
    const currentDate = new Date(moscowTime);
    const formattedDate = formatDate(currentDate);

    const users = await loadUsers();
    const objectGroups = await getObjectGroups();
    
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
          const groupChatId = objectGroups[objectName];
          if (groupChatId) {
            // Форматируем сообщение с использованием шаблона
            const reminderText = formatNotificationMessage(settings.messageTemplate, {
              fullName: user.fullName,
              date: formattedDate
            });
            
            try {
              await bot.telegram.sendMessage(groupChatId, reminderText);
            } catch (error) {
              console.error(`Ошибка отправки напоминания для ${userId} в чат ${groupChatId}:`, error);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Ошибка при отправке напоминаний:', error);
  }
}

async function setupReminderCron() {
  try {
    const settings = await getNotificationSettings();
    
    // Останавливаем предыдущую задачу, если она существует
    if (reminderCronTask) {
      reminderCronTask.stop();
      reminderCronTask = null;
    }
    
    // Создаем новую задачу cron с настройками из БД
    const cronExpression = parseTimeToCron(settings.time, settings.timezone);
    reminderCronTask = cron.schedule(cronExpression, () => {
      console.log(`Запуск задачи отправки напоминаний об отчетах в ${settings.time}`);
      sendReportReminders();
    }, {
      timezone: settings.timezone || "Europe/Moscow"
    });
    
    console.log(`Настроена задача напоминаний: ${settings.time} (${settings.timezone}), включено: ${settings.enabled}`);
  } catch (error) {
    console.error('Ошибка настройки задачи напоминаний:', error);
    // Fallback на значения по умолчанию
    reminderCronTask = cron.schedule('0 19 * * *', () => {
      console.log('Запуск задачи отправки напоминаний об отчетах (fallback)');
      sendReportReminders();
    }, {
      timezone: "Europe/Moscow"
    });
  }
}

// Инициализация задачи напоминаний (будет вызвана после инициализации данных в index.js)
// setupReminderCron();

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

// Добавляем функцию setupReminderCron к экспортируемому объекту bot
bot.setupReminderCron = setupReminderCron;

module.exports = bot;