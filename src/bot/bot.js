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
const { getNotificationSettings, getAllNotificationSettings, getObjectGroups, getGeneralGroupChatIds, getOrganizationObjects } = require('../database/configService');
const { getAllObjects } = require('../database/objectModel');
const { loadAllReports } = require('../database/reportModel');
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

let cronTasks = {};

async function sendReportReminders() {
  try {
    // Загружаем настройки уведомлений типа 'reports'
    const settings = await getNotificationSettings('reports');
    
    // Проверяем, включены ли уведомления
    if (!settings.enabled) {
      console.log('Уведомления об отчетах отключены, пропускаем отправку напоминаний');
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

async function sendStatisticsNotifications() {
  try {
    // Загружаем настройки уведомлений типа 'statistics'
    const settings = await getNotificationSettings('statistics');
    
    // Проверяем, включены ли уведомления
    if (!settings.enabled) {
      console.log('Уведомления статистики отключены, пропускаем отправку');
      return;
    }

    const moscowTime = new Date().toLocaleString('en-US', { timeZone: settings.timezone || 'Europe/Moscow' });
    const currentDate = new Date(moscowTime);
    const formattedDate = formatDate(currentDate);

    const generalGroupChatIds = await getGeneralGroupChatIds();
    const allObjects = await getAllObjects();
    const allReports = await loadAllReports();
    const allReportsArray = Object.values(allReports);
    
    // Получаем отчеты за сегодня
    const todayReports = allReportsArray.filter(report => report.date === formattedDate);
    const reportedObjects = new Set(todayReports.map(report => report.objectName));

    // Обрабатываем каждую организацию
    for (const [orgName, orgChatInfo] of Object.entries(generalGroupChatIds)) {
      if (!orgChatInfo || !orgChatInfo.chatId) {
        continue; // Пропускаем организации без группы
      }

      try {
        // Получаем объекты организации
        const orgObjects = await getOrganizationObjects(orgName);
        
        // Фильтруем только объекты со статусом "В работе"
        const objectsInWork = orgObjects.filter(objName => {
          const objInfo = allObjects.find(obj => obj.name === objName);
          return objInfo && objInfo.status === 'В работе';
        });
        
        // Объекты без отчетов за сегодня
        const objectsWithoutReports = objectsInWork.filter(objName => !reportedObjects.has(objName));
        
        // Формируем сообщение
        let statsMessage = `⚠️Статистика за день:\nОбъектов в работе: ${objectsInWork.length}\n`;
        if (objectsWithoutReports.length > 0) {
          statsMessage += `Не поданы отчеты по объектам: ${objectsWithoutReports.join(', ')}`;
        } else {
          statsMessage += `Не поданы отчеты по объектам: Нет`;
        }
        
        // Отправляем в группу организации
        await bot.telegram.sendMessage(orgChatInfo.chatId, statsMessage);
      } catch (error) {
        console.error(`Ошибка отправки статистики для организации ${orgName}:`, error);
      }
    }
  } catch (error) {
    console.error('Ошибка при отправке статистики:', error);
  }
}

async function setupAllNotificationCrons() {
  try {
    // Останавливаем все существующие задачи
    for (const [type, task] of Object.entries(cronTasks)) {
      if (task) {
        task.stop();
      }
    }
    cronTasks = {};
    
    // Получаем все настройки уведомлений
    const allSettings = await getAllNotificationSettings();
    
    // Настраиваем задачу для отчетов
    if (allSettings.reports && allSettings.reports.enabled) {
      try {
        const cronExpression = parseTimeToCron(allSettings.reports.time, allSettings.reports.timezone);
        cronTasks['reports'] = cron.schedule(cronExpression, () => {
          console.log(`Запуск задачи отправки напоминаний об отчетах в ${allSettings.reports.time}`);
          sendReportReminders();
        }, {
          timezone: allSettings.reports.timezone || "Europe/Moscow"
        });
        console.log(`Настроена задача уведомлений об отчетах: ${allSettings.reports.time} (${allSettings.reports.timezone})`);
      } catch (error) {
        console.error('Ошибка настройки задачи уведомлений об отчетах:', error);
      }
    }
    
    // Настраиваем задачу для статистики
    if (allSettings.statistics && allSettings.statistics.enabled) {
      try {
        const cronExpression = parseTimeToCron(allSettings.statistics.time, allSettings.statistics.timezone);
        cronTasks['statistics'] = cron.schedule(cronExpression, () => {
          console.log(`Запуск задачи отправки статистики в ${allSettings.statistics.time}`);
          sendStatisticsNotifications();
        }, {
          timezone: allSettings.statistics.timezone || "Europe/Moscow"
        });
        console.log(`Настроена задача уведомлений статистики: ${allSettings.statistics.time} (${allSettings.statistics.timezone})`);
      } catch (error) {
        console.error('Ошибка настройки задачи уведомлений статистики:', error);
      }
    }
    
  } catch (error) {
    console.error('Ошибка настройки задач уведомлений:', error);
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
bot.setupReminderCron = setupAllNotificationCrons; // Для обратной совместимости
bot.setupAllNotificationCrons = setupAllNotificationCrons;

module.exports = bot;