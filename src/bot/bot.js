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
const { loadUsers, saveUser } = require('../database/userModel');
const { loadUserReports, saveReport } = require('../database/reportModel');
const { clearPreviousMessages } = require('./utils');
const { ADMIN_ID, OBJECT_GROUPS, GENERAL_GROUP_CHAT_ID } = require('../config/config');
const { Markup } = require('telegraf');

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
    try {
      const message = await originalReply(text, extra);
      if (userStates[userId]) {
        userStates[userId].messageIds.push(message.message_id);
        console.log(`[ctx.reply] Сообщение ${message.message_id} добавлено в messageIds для userId ${userId}. Массив:`, userStates[userId].messageIds);
      } else {
        console.log(`Ошибка: userStates для ${userId} не инициализировано при ctx.reply`);
      }
      return message;
    } catch (error) {
      console.error(`[ctx.reply] Ошибка при отправке сообщения для userId ${userId}:`, error.message);
      throw error;
    }
  };

  return next();
});

// Перехват ctx.telegram.sendMessage
const originalSendMessage = bot.telegram.sendMessage.bind(bot.telegram);
bot.telegram.sendMessage = async (chatId, text, extra) => {
  try {
    const message = await originalSendMessage(chatId, text, extra);
    const userId = chatId.toString();
    if (userStates[userId]) {
      userStates[userId].messageIds.push(message.message_id);
      console.log(`[sendMessage] Сообщение ${message.message_id} добавлено в messageIds для userId ${userId}. Массив:`, userStates[userId].messageIds);
    } else {
      console.log(`Ошибка: userStates для ${userId} не инициализировано при sendMessage`);
    }
    return message;
  } catch (error) {
    console.error(`[sendMessage] Ошибка при отправке сообщения для chatId ${chatId}:`, error.message);
    throw error;
  }
};

// Обработчик всех текстовых сообщений (кроме команд)
bot.on('text', async (ctx) => {
  const userId = ctx.from.id.toString();
  const text = ctx.message.text;
  const state = ctx.state.userStates[userId];
  console.log(`Получен текст от userId ${userId}: "${text}". Текущее состояние:`, state);

  if (text.startsWith('/')) {
    return; // Пропускаем команды, они обрабатываются отдельно
  }

  if (!state || !state.step) {
    return; // Игнорируем сообщения, если нет активного шага
  }

  await clearPreviousMessages(ctx, userId);

  if (state.step === 'custom  customPositionInput') {
    const users = await loadUsers();
    users[userId].position = text.trim();
    await saveUser(userId, users[userId]);
    state.step = 'selectOrganization';
    await require('./actions/organization').showOrganizationSelection(ctx, userId);
  } else if (state.step === 'customOrganizationInput') {
    const users = await loadUsers();
    users[userId].organization = text.trim();
    await saveUser(userId, users[userId]);
    state.step = 'enterFullName';
    const message = await ctx.reply('Введите ваше ФИО:');
    state.messageIds.push(message.message_id);
  } else if (state.step === 'enterFullName') {
    const users = await loadUsers();
    users[userId].fullName = text.trim();
    await saveUser(userId, users[userId]);

    const message = await ctx.reply('Ваша заявка на рассмотрении, ожидайте');
    state.messageIds.push(message.message_id);

    const adminText = `\n${users[userId].fullName} - ${users[userId].position} (${users[userId].organization})\n\n${users[userId].selectedObjects.join(', ') || 'Не выбраны'}`;
    await ctx.telegram.sendMessage(ADMIN_ID, `📝 СПИСОК ЗАЯВОК${adminText}`, Markup.inlineKeyboard([
      [Markup.button.callback(`✅ Одобрить (${users[userId].fullName})`, `approve_${userId}`)],
      [Markup.button.callback(`❌ Отклонить (${users[userId].fullName})`, `reject_${userId}`)]
    ]));

    ctx.state.userStates[userId] = { step: null, selectedObjects: [], report: {}, messageIds: [] };
  } else if (state.step === 'editFullName') {
    const users = await loadUsers();
    users[userId].fullName = text.trim();
    await saveUser(userId, users[userId]);
    await ctx.reply(`ФИО обновлено на "${users[userId].fullName}".`);
    state.step = null;
    await require('./handlers/menu').showProfile(ctx);
  } else if (state.step === 'customPositionEditInput') {
    const users = await loadUsers();
    users[userId].position = text.trim();
    await saveUser(userId, users[userId]);
    state.step = null;
    await ctx.reply(`Должность обновлена на "${users[userId].position}".`);
    await require('./handlers/menu').showProfile(ctx);
  } else if (state.step === 'customOrgEditInput') {
    const users = await loadUsers();
    users[userId].organization = text.trim();
    await saveUser(userId, users[userId]);
    state.step = null;
    const message = await ctx.reply(`Организация обновлена на "${users[userId].organization}".`, Markup.inlineKeyboard([[Markup.button.callback('↩️ Назад', 'profile')]]));
    state.messageIds.push(message.message_id);
  } else if (state.step === 'workDone') {
    state.report.workDone = text.trim();
    state.step = 'materials';
    await ctx.reply('💡 Введите информацию о поставленных материалах:');
  } else if (state.step === 'materials') {
    state.report.materials = text.trim();
    const users = await loadUsers();
    const date = new Date().toISOString().split('T')[0];
    const timestamp = new Date().toISOString();
    const reportId = `${date}_${users[userId].nextReportId++}`;
    const report = {
      reportId,
      userId,
      objectName: state.report.objectName,
      date,
      timestamp,
      workDone: state.report.workDone,
      materials: state.report.materials,
      groupMessageId: null,
      generalMessageId: null,
      fullName: users[userId].fullName
    };

    const reportText = `
📅 ОТЧЕТ ЗА ${date}  
🏢 ${state.report.objectName}  
➖➖➖➖➖➖➖➖➖➖➖ 
👷 ${users[userId].fullName} 

ВЫПОЛНЕННЫЕ РАБОТЫ:  
${state.report.workDone}  

ПОСТАВЛЕННЫЕ МАТЕРИАЛЫ:  
${state.report.materials}  
➖➖➖➖➖➖➖➖➖➖➖
    `.trim();

    const groupChatId = OBJECT_GROUPS[state.report.objectName] || GENERAL_GROUP_CHAT_ID;
    const groupMessage = await ctx.telegram.sendMessage(groupChatId, reportText);
    const generalMessage = await ctx.telegram.sendMessage(GENERAL_GROUP_CHAT_ID, reportText);

    report.groupMessageId = groupMessage.message_id;
    report.generalMessageId = generalMessage.message_id;

    await saveReport(userId, report);
    await saveUser(userId, users[userId]);

    await ctx.reply(`✅ Ваш отчет опубликован:\n\n${reportText}`);
    state.step = null;
    state.report = {};
  } else if (state.step === 'editWorkDone') {
    state.report.workDone = text.trim();
    state.step = 'editMaterials';
    await ctx.reply('💡 Введите новую информацию о поставленных материалах:');
  } else if (state.step === 'editMaterials') {
    state.report.materials = text.trim();
    const users = await loadUsers();
    const originalReportId = state.report.originalReportId;
    let originalReport = null;

    if (originalReportId) {
      const userReports = await loadUserReports(userId);
      originalReport = userReports[originalReportId];
    }

    const newTimestamp = new Date().toISOString();
    const newReportId = `${state.report.date}_${users[userId].nextReportId++}`;
    const newReport = {
      reportId: newReportId,
      userId,
      objectName: state.report.objectName,
      date: state.report.date,
      timestamp: newTimestamp,
      workDone: state.report.workDone,
      materials: state.report.materials,
      groupMessageId: null,
      generalMessageId: null,
      fullName: users[userId].fullName
    };

    const reportText = `
📅 ОТЧЕТ ЗА ${newReport.date} (ОБНОВЛЁН)  
🏢 ${newReport.objectName}  
➖➖➖➖➖➖➖➖➖➖➖ 
👷 ${users[userId].fullName} 

ВЫПОЛНЕННЫЕ РАБОТЫ:  
${newReport.workDone}  

ПОСТАВЛЕННЫЕ МАТЕРИАЛЫ:  
${newReport.materials}  
➖➖➖➖➖➖➖➖➖➖➖
    `.trim();

    const groupChatId = OBJECT_GROUPS[newReport.objectName] || GENERAL_GROUP_CHAT_ID;

    if (originalReport) {
      if (originalReport.groupMessageId) {
        await ctx.telegram.deleteMessage(groupChatId, originalReport.groupMessageId)
            .catch(e => console.log(`Не удалось удалить старое сообщение ${originalReport.groupMessageId}: ${e.message}`));
      }
      if (originalReport.generalMessageId) {
        await ctx.telegram.deleteMessage(GENERAL_GROUP_CHAT_ID, originalReport.generalMessageId)
            .catch(e => console.log(`Не удалось удалить старое сообщение ${originalReport.generalMessageId}: ${e.message}`));
      }

      const client = await require('../database/db').pool.connect();
      try {
        await client.query('DELETE FROM reports WHERE reportId = $1', [originalReportId]);
      } finally {
        client.release();
      }
    }

    const groupMessage = await ctx.telegram.sendMessage(groupChatId, reportText);
    const generalMessage = await ctx.telegram.sendMessage(GENERAL_GROUP_CHAT_ID, reportText);

    newReport.groupMessageId = groupMessage.message_id;
    newReport.generalMessageId = generalMessage.message_id;

    await saveReport(userId, newReport);
    await saveUser(userId, users[userId]);

    await ctx.reply(`✅ Ваш отчёт обновлён:\n\n${reportText}`, Markup.inlineKeyboard([
      [Markup.button.callback('↩️ Вернуться в личный кабинет', 'profile')]
    ]));
    state.step = null;
    state.report = {};
  }
});

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