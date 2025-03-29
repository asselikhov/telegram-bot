const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { loadUserReports, saveReport, getReportText } = require('../../database/reportModel');
const { OBJECTS_LIST_CYRILLIC, OBJECT_GROUPS, GENERAL_GROUP_CHAT_ID } = require('../../config/config');
const { clearPreviousMessages } = require('../utils');

async function showDownloadReport(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();

    if (!users[userId]?.isApproved) {
        return ctx.reply('У вас нет прав для выгрузки отчетов.');
    }

    await clearPreviousMessages(ctx, userId);

    const buttons = OBJECTS_LIST_CYRILLIC.map((obj, index) =>
        [Markup.button.callback(obj, `download_report_file_${index}`)]
    );
    buttons.push([Markup.button.callback('↩️ Вернуться в главное меню', 'main_menu')]);

    await ctx.reply('Выберите объект для выгрузки отчета:', Markup.inlineKeyboard(buttons));
}

async function downloadReportFile(ctx, objectIndex) {
    const userId = ctx.from.id.toString();
    const objectName = OBJECTS_LIST_CYRILLIC[objectIndex];
    if (!objectName) return ctx.reply('Ошибка: объект не найден.');

    const reportText = await getReportText(objectName);
    if (!reportText) {
        return ctx.reply(`Отчет для объекта "${objectName}" не найден.`);
    }

    await clearPreviousMessages(ctx, userId);

    await ctx.replyWithDocument({
        source: Buffer.from(reportText, 'utf-8'),
        filename: `${objectName}_report_${new Date().toISOString().split('T')[0]}.txt`
    });
}

async function createReport(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    if (users[userId].position !== 'Производитель работ' || !users[userId].isApproved) {
        return ctx.reply('У вас нет прав для создания отчетов.');
    }

    await clearPreviousMessages(ctx, userId);

    const buttons = users[userId].selectedObjects.map((obj, index) =>
        [Markup.button.callback(obj, `select_object_${index}`)]
    );
    await ctx.reply('Выберите объект из списка:', Markup.inlineKeyboard(buttons));
}

async function handleReportText(ctx, userId, state) {
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
        generalMessageId: null
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

    await clearPreviousMessages(ctx, userId);

    await ctx.reply(`✅ Ваш отчет опубликован:\n\n${reportText}`);
}

async function showReportObjects(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const reports = await loadUserReports(userId);

    await clearPreviousMessages(ctx, userId);

    if (Object.keys(reports).length === 0) {
        return ctx.reply('У вас пока нет отчетов.');
    }

    const uniqueObjects = [...new Set(Object.values(reports).map(r => r.objectName))];
    const buttons = uniqueObjects.map((obj, index) =>
        [Markup.button.callback(obj, `select_report_object_${index}`)]
    );
    buttons.push([Markup.button.callback('↩️ Назад', 'profile')]);

    await ctx.reply('Выберите объект для просмотра отчетов:', Markup.inlineKeyboard(buttons));
}

async function showReportDates(ctx, objectIndex) {
    const userId = ctx.from.id.toString();
    const reports = await loadUserReports(userId);
    const uniqueObjects = [...new Set(Object.values(reports).map(r => r.objectName))];
    const objectName = uniqueObjects[objectIndex];

    await clearPreviousMessages(ctx, userId);

    const objectReports = Object.values(reports).filter(r => r.objectName === objectName);
    const uniqueDates = [...new Set(objectReports.map(r => r.date))];
    const buttons = uniqueDates.map((date, index) =>
        [Markup.button.callback(date, `select_report_date_${objectIndex}_${index}`)]
    );
    buttons.push([Markup.button.callback('↩️ Назад', 'view_reports')]);

    await ctx.reply(`Выберите дату для объекта "${objectName}":`, Markup.inlineKeyboard(buttons));
}

async function showReportTimestamps(ctx, objectIndex, dateIndex) {
    const userId = ctx.from.id.toString();
    const reports = await loadUserReports(userId);
    const uniqueObjects = [...new Set(Object.values(reports).map(r => r.objectName))];
    const objectName = uniqueObjects[objectIndex];
    const objectReports = Object.values(reports).filter(r => r.objectName === objectName);
    const uniqueDates = [...new Set(objectReports.map(r => r.date))];
    const selectedDate = uniqueDates[dateIndex];

    await clearPreviousMessages(ctx, userId);

    const dateReports = objectReports.filter(r => r.date === selectedDate);
    const buttons = dateReports.map((report, index) => {
        const time = new Date(report.timestamp).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' });
        return [Markup.button.callback(time, `select_report_time_${objectIndex}_${dateIndex}_${index}`)];
    });
    buttons.push([Markup.button.callback('↩️ Назад', `select_report_object_${objectIndex}`)]);

    await ctx.reply(`Выберите время отчета для "${objectName}" за ${selectedDate}:`, Markup.inlineKeyboard(buttons));
}

async function showReportDetails(ctx, objectIndex, dateIndex, timeIndex) {
    const userId = ctx.from.id.toString();
    const reports = await loadUserReports(userId);
    const uniqueObjects = [...new Set(Object.values(reports).map(r => r.objectName))];
    const objectName = uniqueObjects[objectIndex];
    const objectReports = Object.values(reports).filter(r => r.objectName === objectName);
    const uniqueDates = [...new Set(objectReports.map(r => r.date))];
    const selectedDate = uniqueDates[dateIndex];
    const dateReports = objectReports.filter(r => r.date === selectedDate);
    const report = dateReports[timeIndex];

    await clearPreviousMessages(ctx, userId);

    const reportText = `
📅 ОТЧЕТ ЗА ${report.date}  
🏢 ${report.objectName}  
➖➖➖➖➖➖➖➖➖➖➖ 
Время: ${new Date(report.timestamp).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}  
👷 ${ctx.from.first_name}  

ВЫПОЛНЕННЫЕ РАБОТЫ:  
${report.workDone}  

ПОСТАВЛЕННЫЕ МАТЕРИАЛЫ:  
${report.materials}  
➖➖➖➖➖➖➖➖➖➖➖
    `.trim();

    const buttons = [
        [Markup.button.callback('✏️ Редактировать', `edit_report_${objectIndex}_${dateIndex}_${timeIndex}`)],
        [Markup.button.callback('↩️ Назад', `select_report_date_${objectIndex}_${dateIndex}`)]
    ];

    await ctx.reply(reportText, Markup.inlineKeyboard(buttons));
}

async function editReport(ctx, objectIndex, dateIndex, timeIndex) {
    const userId = ctx.from.id.toString();
    const reports = await loadUserReports(userId);
    const uniqueObjects = [...new Set(Object.values(reports).map(r => r.objectName))];
    const objectName = uniqueObjects[objectIndex];
    const objectReports = Object.values(reports).filter(r => r.objectName === objectName);
    const uniqueDates = [...new Set(objectReports.map(r => r.date))];
    const selectedDate = uniqueDates[dateIndex];
    const dateReports = objectReports.filter(r => r.date === selectedDate);
    const report = dateReports[timeIndex];

    if (!report || !report.reportId) {
        await clearPreviousMessages(ctx, userId);
        return ctx.reply('Ошибка: не удалось найти отчёт для редактирования.');
    }

    await clearPreviousMessages(ctx, userId);

    ctx.state.userStates[userId] = {
        step: 'editWorkDone',
        report: { ...report, originalReportId: report.reportId },
        messageIds: ctx.state.userStates[userId].messageIds
    };
    await ctx.reply('💡 Введите новую информацию о выполненных работах:');
}

async function handleEditedReport(ctx, userId, state) {
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
        generalMessageId: null
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

    // Удаляем старые сообщения, если они есть
    if (originalReport) {
        if (originalReport.groupMessageId) {
            await ctx.telegram.deleteMessage(groupChatId, originalReport.groupMessageId)
                .catch(e => console.log(`Не удалось удалить старое сообщение ${originalReport.groupMessageId}: ${e.message}`));
        }
        if (originalReport.generalMessageId) {
            await ctx.telegram.deleteMessage(GENERAL_GROUP_CHAT_ID, originalReport.generalMessageId)
                .catch(e => console.log(`Не удалось удалить старое сообщение ${originalReport.generalMessageId}: ${e.message}`));
        }

        // Удаляем старый отчёт из базы данных
        const client = await require('../../database/db').pool.connect();
        try {
            await client.query('DELETE FROM reports WHERE reportId = $1', [originalReportId]);
        } finally {
            client.release();
        }
    } else {
        console.log(`Предупреждение: старый отчёт с ID ${originalReportId} не найден для userId ${userId}`);
    }

    // Публикуем новый отчёт
    const groupMessage = await ctx.telegram.sendMessage(groupChatId, reportText);
    const generalMessage = await ctx.telegram.sendMessage(GENERAL_GROUP_CHAT_ID, reportText);

    newReport.groupMessageId = groupMessage.message_id;
    newReport.generalMessageId = generalMessage.message_id;

    // Сохраняем новый отчёт
    await saveReport(userId, newReport);
    await saveUser(userId, users[userId]);

    await clearPreviousMessages(ctx, userId);

    await ctx.reply(`✅ Ваш отчёт обновлён:\n\n${reportText}`, Markup.inlineKeyboard([
        [Markup.button.callback('↩️ Вернуться в личный кабинет', 'profile')]
    ]));
}

module.exports = (bot) => {
    bot.action('download_report', showDownloadReport);
    bot.action(/download_report_file_(\d+)/, (ctx) => downloadReportFile(ctx, parseInt(ctx.match[1], 10)));
    bot.action('create_report', createReport);
    bot.action(/select_object_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const objectIndex = parseInt(ctx.match[1], 10);
        const users = await loadUsers();
        const selectedObject = users[userId].selectedObjects[objectIndex];
        if (!selectedObject) return;

        await clearPreviousMessages(ctx, userId);

        ctx.state.userStates[userId] = { step: 'workDone', report: { objectName: selectedObject }, messageIds: ctx.state.userStates[userId].messageIds };
        await ctx.reply('💡 Введите информацию о выполненных работ:');
    });

    bot.action('view_reports', showReportObjects);
    bot.action(/select_report_object_(\d+)/, (ctx) => showReportDates(ctx, parseInt(ctx.match[1], 10)));
    bot.action(/select_report_date_(\d+)_(\d+)/, (ctx) => showReportTimestamps(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10)));
    bot.action(/select_report_time_(\d+)_(\d+)_(\d+)/, (ctx) => showReportDetails(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10), parseInt(ctx.match[3], 10)));
    bot.action(/edit_report_(\d+)_(\d+)_(\d+)/, (ctx) => editReport(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10), parseInt(ctx.match[3], 10)));

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state.userStates[userId];
        console.log(`Получен текст от userId ${userId}: "${ctx.message.text}". Текущее состояние:`, state);

        if (!state || (!state.step?.includes('workDone') && !state.step?.includes('materials') && !state.step?.includes('editFullName') && !state.step?.includes('editWorkDone') && !state.step?.includes('editMaterials'))) {
            await clearPreviousMessages(ctx, userId);
            await ctx.reply('Пожалуйста, начните процесс заново, используя команды или кнопки.');
            return;
        }

        await clearPreviousMessages(ctx, userId);

        if (state.step === 'workDone') {
            state.report.workDone = ctx.message.text.trim();
            state.step = 'materials';
            await ctx.reply('💡 Введите информацию о поставленных материалах:');
        } else if (state.step === 'materials') {
            state.report.materials = ctx.message.text.trim();
            await handleReportText(ctx, userId, state);
            state.step = null;
            state.report = {};
        } else if (state.step === 'editFullName') {
            const users = await loadUsers();
            users[userId].fullName = ctx.message.text.trim();
            await saveUser(userId, users[userId]);
            await ctx.reply(`ФИО обновлено на "${users[userId].fullName}".`);
            state.step = null;
            await require('./menu').showProfile(ctx);
        } else if (state.step === 'editWorkDone') {
            state.report.workDone = ctx.message.text.trim();
            state.step = 'editMaterials';
            await ctx.reply('💡 Введите новую информацию о поставленных материалах:');
        } else if (state.step === 'editMaterials') {
            state.report.materials = ctx.message.text.trim();
            await handleEditedReport(ctx, userId, state);
            state.step = null;
            state.report = {};
        }
    });

    bot.action('edit_fullName', async (ctx) => {
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        const existingMessageIds = ctx.state.userStates[userId]?.messageIds || [];
        ctx.state.userStates[userId] = { step: 'editFullName', messageIds: existingMessageIds };
        console.log(`Установлено состояние editFullName для userId ${userId}. State:`, ctx.state.userStates[userId]);
        await ctx.reply('Введите ваше новое ФИО:');
    });
};