const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const { BOT_TOKEN } = require('../config/config');
const startHandler = require('./handlers/start');
const menuHandler = require('./handlers/menu');
const reportHandler = require('./handlers/report');
const needsHandler = require('./handlers/needs');
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
const { getNotificationSettings, getAllNotificationSettings, getObjectGroups, getGeneralGroupChatIds, getOrganizationObjects, getReportUsers } = require('../database/configService');
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

bot.action(/.*/, async (ctx, next) => {
  try {
    return await next();
  } catch (error) {
    console.error('Ошибка в action handler:', error);
    
    // Не пытаемся отправлять сообщение об ошибке, если сама ошибка связана с отправкой сообщения
    const isNetworkError = error.code === 'ETIMEDOUT' || 
                          error.code === 'ECONNRESET' || 
                          error.code === 'ENOTFOUND' ||
                          error.type === 'system' ||
                          (error.message && error.message.includes('sendMessage'));
    
    if (!isNetworkError) {
      try {
        await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
      } catch (e) {
        // Игнорируем ошибки при отправке сообщения об ошибке
      }
    } else {
      console.error('Сетевая ошибка при обработке action, пропускаем отправку сообщения об ошибке');
    }
  }
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

    // Проверяем каждого пользователя
    for (const [userId, user] of Object.entries(users)) {
      // Пропускаем пользователей, которые не одобрены или находятся в отпуске
      if (!user.isApproved || user.status !== 'Online') {
        continue;
      }

      const reports = await loadUserReports(userId);
      const todayReports = Object.values(reports).filter(report => report.date === formattedDate);

      // Проверяем каждый объект пользователя
      for (const objectName of user.selectedObjects) {
        // Получаем список пользователей, которые должны подавать отчеты для пары организация+объект
        const reportUsers = await getReportUsers(user.organization, objectName);
        
        // Проверяем, должен ли этот пользователь подавать отчет по этому объекту
        if (reportUsers && reportUsers.includes(userId)) {
          // Нормализуем названия объектов для сравнения (убираем пробелы в начале и конце)
          const normalizedObjectName = objectName && objectName.trim();
          const hasReport = todayReports.some(report => 
              report.objectName && report.objectName.trim() === normalizedObjectName
          );
          if (!hasReport) {
            const groupChatId = objectGroups[objectName];
            if (groupChatId) {
              // Форматируем сообщение с использованием шаблона
              let template = settings.messageTemplate;
              // Исправляем шаблон, если он не содержит blockquote
              if (template && !template.includes('<blockquote>')) {
                // Если шаблон начинается с "⚠️ Напоминание\n", оборачиваем остальное в blockquote
                if (template.startsWith('⚠️ Напоминание\n')) {
                  const content = template.substring('⚠️ Напоминание\n'.length);
                  template = `⚠️ Напоминание\n<blockquote>${content}</blockquote>`;
                } else {
                  // Иначе просто оборачиваем весь шаблон в blockquote
                  template = `<blockquote>${template}</blockquote>`;
                }
              }
              // Исправляем шаблон, если он не содержит "г." после {date}
              if (template && !template.includes('{date}г.')) {
                template = template.replace(/\{date\}(\.|)/g, '{date}г.');
              }
              const reminderText = formatNotificationMessage(template, {
                fullName: user.fullName,
                date: formattedDate
              });
              
              try {
                await bot.telegram.sendMessage(groupChatId, reminderText, {
                  parse_mode: 'HTML',
                  link_preview_options: { is_disabled: true }
                });
              } catch (error) {
                console.error(`Ошибка отправки напоминания для ${userId} в чат ${groupChatId}:`, error);
              }
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
    // Нормализуем названия объектов из отчетов (убираем пробелы в начале и конце)
    const reportedObjects = new Set(
      todayReports
        .map(report => report.objectName ? report.objectName.trim() : null)
        .filter(objName => objName !== null)
    );

    // Обрабатываем каждую организацию
    for (const [orgName, orgChatInfo] of Object.entries(generalGroupChatIds)) {
      if (!orgChatInfo || !orgChatInfo.chatId) {
        continue; // Пропускаем организации без группы
      }

      try {
        // Получаем объекты организации
        const orgObjects = await getOrganizationObjects(orgName);
        
        // Фильтруем только объекты со статусом "В работе" (исключаем "Заморожен" и другие статусы)
        const objectsInWork = orgObjects.filter(objName => {
          const objInfo = allObjects.find(obj => obj.name === objName);
          // Включаем только объекты со статусом "В работе", исключаем "Заморожен"
          return objInfo && objInfo.status === 'В работе';
        });
        
        // Объекты без отчетов за сегодня (используем нормализованное сравнение)
        const objectsWithoutReports = objectsInWork.filter(objName => {
          const normalizedObjName = objName ? objName.trim() : objName;
          return !reportedObjects.has(normalizedObjName);
        });
        
        // Функция для обрезки длинных названий объектов
        function truncateObjectName(name, maxLength = 30) {
          if (name.length <= maxLength) {
            return name;
          }
          return name.substring(0, maxLength - 3) + '...';
        }
        
        // Формируем список объектов со ссылками
        const objectsWithLinks = await Promise.all(
          objectsWithoutReports.map(async (objName) => {
            // Обрезаем название для отображения
            const displayName = truncateObjectName(objName);
            
            const objInfo = allObjects.find(obj => obj.name === objName);
            if (objInfo && objInfo.telegramGroupId) {
              try {
                const chat = await bot.telegram.getChat(objInfo.telegramGroupId);
                let objUrl;
                if (chat.username) {
                  objUrl = `https://t.me/${chat.username}`;
                } else {
                  try {
                    // Создаем новую постоянную ссылку без ограничений по времени и количеству использований
                    // Это гарантирует, что ссылка будет работать, даже если старая устарела
                    const inviteLink = await bot.telegram.createChatInviteLink(objInfo.telegramGroupId, {
                      name: `Объект ${objName}`,
                      creates_join_request: false
                    });
                    objUrl = inviteLink.invite_link;
                  } catch (inviteError) {
                    console.error(`Ошибка при создании invite link для объекта ${objName}:`, inviteError);
                    // Если не удалось создать новую ссылку, пытаемся получить существующую
                    try {
                      objUrl = await bot.telegram.exportChatInviteLink(objInfo.telegramGroupId);
                    } catch (exportError) {
                      console.error(`Не удалось получить ссылку для объекта ${objName}:`, exportError);
                      // Оставляем текст без ссылки, экранируем для HTML
                      let escaped = displayName.replace(/[<>&"]/g, (match) => {
                        const map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' };
                        return map[match];
                      });
                      // Заменяем пробелы на неразрывные (Unicode U+00A0)
                      return escaped.replace(/ /g, '\u00A0');
                    }
                  }
                }
                if (objUrl) {
                  // Экранируем HTML символы в отображаемом названии
                  let escapedObjName = displayName.replace(/[<>&"]/g, (match) => {
                    const map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' };
                    return map[match];
                  });
                  // Заменяем обычные пробелы на неразрывные пробелы (Unicode U+00A0), чтобы название не переносилось
                  escapedObjName = escapedObjName.replace(/ /g, '\u00A0');
                  return `<a href="${objUrl}">${escapedObjName}</a>`;
                }
              } catch (error) {
                console.error(`Ошибка при получении информации о чате объекта ${objName}:`, error);
                // Оставляем текст без ссылки, экранируем для HTML
                let escaped = displayName.replace(/[<>&"]/g, (match) => {
                  const map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' };
                  return map[match];
                });
                // Заменяем пробелы на неразрывные (Unicode U+00A0)
                return escaped.replace(/ /g, '\u00A0');
              }
            }
            // Экранируем для HTML, если ссылки нет или нет telegramGroupId
            let escaped = displayName.replace(/[<>&"]/g, (match) => {
              const map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' };
              return map[match];
            });
            // Заменяем пробелы на неразрывные (Unicode U+00A0)
            return escaped.replace(/ /g, '\u00A0');
          })
        );
        
        // Формируем сообщение
        let statsMessage = `⚠️ Статистика за день:\n<blockquote>`;
        statsMessage += `1) Объектов в работе: ${objectsInWork.length}\n`;
        if (objectsWithoutReports.length > 0) {
          statsMessage += `2) Не поданы отчеты по объектам:\n`;
          objectsWithLinks.forEach(objLink => {
            statsMessage += `   · ${objLink}\n`;
          });
        } else {
          statsMessage += `2) Не поданы отчеты по объектам: нет\n`;
        }
        statsMessage += `</blockquote>`;
        
        // Отправляем в группу организации
        await bot.telegram.sendMessage(orgChatInfo.chatId, statsMessage, {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true }
        });
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
needsHandler(bot);
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