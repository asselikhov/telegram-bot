const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { loadUserReports, saveReport, getReportText } = require('../../database/reportModel');
const { OBJECTS_LIST_CYRILLIC, OBJECT_GROUPS, GENERAL_GROUP_CHAT_ID } = require('../../config/config');
const { sendMenu } = require('../utils');

const steps = {
    workDone: { next: 'materials', prompt: '💡 Введите информацию о выполненных работах:' },
    materials: { next: null, prompt: '💡 Введите информацию о поставленных материалах:', handler: 'handleReportText' },
    editWorkDone: { next: 'editMaterials', prompt: '💡 Введите новую информацию о выполненных работах:' },
    editMaterials: { next: null, prompt: '💡 Введите новую информацию о поставленных материалах:', handler: 'handleEditedReport' }
};

async function showDownloadReport(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    if (!users[userId]?.isApproved) return ctx.reply('У вас нет прав для выгрузки отчетов.');

    const buttons = OBJECTS_LIST_CYRILLIC.map((obj, index) => [Markup.button.callback(obj, `download_report_file_${index}`)]);
    buttons.push([Markup.button.callback('↩️ Вернуться в главное меню', 'main_menu')]);
    await sendMenu(ctx, userId, 'Выберите объект для выгрузки отчета:', buttons);
}

async function downloadReportFile(ctx, objectIndex) {
    const userId = ctx.from.id.toString();
    const objectName = OBJECTS_LIST_CYRILLIC[objectIndex];
    if (!objectName) return ctx.reply('Ошибка: объект не найден.');

    const reportText = await getReportText(objectName);
    if (!reportText) return ctx.reply(`Отчет для объекта "${objectName}" не найден.`);

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

    const buttons = users[userId].selectedObjects.map((obj, index) => [Markup.button.callback(obj, `select_object_${index}`)]);
    await sendMenu(ctx, userId, 'Выберите объект из списка:', buttons);
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
        generalMessageId: null,
        fullName: users[userId].fullName
    };

    const reportText = `
📅 ОТЧЕТ ЗА ${date}  
🏢 ${report.objectName}  
➖➖➖➖➖➖➖➖➖➖➖ 
👷 ${report.fullName} 

ВЫПОЛНЕННЫЕ РАБОТЫ:  
${report.workDone}  

ПОСТАВЛЕННЫЕ МАТЕРИАЛЫ:  
${report.materials}  
➖➖➖➖➖➖➖➖➖➖➖
    `.trim();

    const groupChatId = OBJECT_GROUPS[report.objectName] || GENERAL_GROUP_CHAT_ID;
    const groupMessage = await ctx.telegram.sendMessage(groupChatId, reportText);
    const generalMessage = await ctx.telegram.sendMessage(GENERAL_GROUP_CHAT_ID, reportText);

    report.groupMessageId = groupMessage.message_id;
    report.generalMessageId = generalMessage.message_id;

    await saveReport(userId, report);
    await saveUser(userId, users[userId]);

    await ctx.reply(`✅ Ваш отчет опубликован:\n\n${reportText}`);
}

async function showReportObjects(ctx) {
    const userId = ctx.from.id.toString();
    const reports = await loadUserReports(userId);
    if (Object.keys(reports).length === 0) return ctx.reply('У вас пока нет отчетов.');

    const uniqueObjects = [...new Set(Object.values(reports).map(r => r.objectName))];
    const buttons = uniqueObjects.map((obj, index) => [Markup.button.callback(obj, `select_report_object_${index}`)]);
    buttons.push([Markup.button.callback('↩️ Назад', 'profile')]);
    await sendMenu(ctx, userId, 'Выберите объект для просмотра отчетов:', buttons);
}

async function showReportDates(ctx, objectIndex) {
    const userId = ctx.from.id.toString();
    const reports = await loadUserReports(userId);
    const uniqueObjects = [...new Set(Object.values(reports).map(r => r.objectName))];
    const objectName = uniqueObjects[objectIndex];

    const objectReports = Object.values(reports).filter(r => r.objectName === objectName);
    const uniqueDates = [...new Set(objectReports.map(r => r.date))];
    const buttons = uniqueDates.map((date, index) => [Markup.button.callback(date, `select_report_date_${objectIndex}_${index}`)]);
    buttons.push([Markup.button.callback('↩️ Назад', 'view_reports')]);
    await sendMenu(ctx, userId, `Выберите дату для объекта "${objectName}":`, buttons);
}

async function showReportTimestamps(ctx, objectIndex, dateIndex) {
    const userId = ctx.from.id.toString();
    const reports = await loadUserReports(userId);
    const uniqueObjects = [...new Set(Object.values(reports).map(r => r.objectName))];
    const objectName = uniqueObjects[objectIndex];
    const objectReports = Object.entries(reports).filter(([_, r]) => r.objectName === objectName);
    const uniqueDates = [...new Set(objectReports.map(([_, r]) => r.date))];
    const selectedDate = uniqueDates[dateIndex];

    const dateReports = objectReports.filter(([_, r]) => r.date === selectedDate);
    const buttons = dateReports.map(([reportId, report]) => {
        const time = new Date(report.timestamp).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' });
        return [Markup.button.callback(time, `select_report_time_${reportId}`)];
    });
    buttons.push([Markup.button.callback('↩️ Назад', `select_report_object_${objectIndex}`)]);
    await sendMenu(ctx, userId, `Выберите время отчета для "${objectName}" за ${selectedDate}:`, buttons);
}

async function showReportDetails(ctx, reportId) {
    const userId = ctx.from.id.toString();
    const reports = await loadUserReports(userId);
    const report = reports[reportId];
    if (!report) return ctx.reply('Ошибка: отчёт не найден.');

    const reportText = `
📅 ОТЧЕТ ЗА ${report.date}  
🏢 ${report.objectName}  
➖➖➖➖➖➖➖➖➖➖➖ 
Время: ${new Date(report.timestamp).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}  
👷 ${report.fullName}  

ВЫПОЛНЕННЫЕ РАБОТЫ:  
${report.workDone}  

ПОСТАВЛЕННЫЕ МАТЕРИАЛЫ:  
${report.materials}  
➖➖➖➖➖➖➖➖➖➖➖
    `.trim();

    const uniqueObjects = [...new Set(Object.values(reports).map(r => r.objectName))];
    const uniqueDates = [...new Set(Object.values(reports).filter(r => r.objectName === report.objectName).map(r => r.date))];
    const buttons = [
        [Markup.button.callback('✏️ Редактировать', `edit_report_${reportId}`)],
        [Markup.button.callback('↩️ Назад', `select_report_date_${uniqueObjects.indexOf(report.objectName)}_${uniqueDates.indexOf(report.date)}`)]
    ];
    await sendMenu(ctx, userId, reportText, buttons);
}

async function editReport(ctx, reportId) {
    const userId = ctx.from.id.toString();
    const reports = await loadUserReports(userId);
    const report = reports[reportId];
    if (!report) return ctx.reply('Ошибка: отчёт не найден.');

    ctx.state.step = 'editWorkDone';
    ctx.state.report = { ...report, originalReportId: reportId };
    await ctx.reply(steps.editWorkDone.prompt);
}

async function handleEditedReport(ctx, userId, state) {
    const users = await loadUsers();
    const originalReportId = state.report.originalReportId;
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
👷 ${newReport.fullName} 

ВЫПОЛНЕННЫЕ РАБОТЫ:  
${newReport.workDone}  

ПОСТАВЛЕННЫЕ МАТЕРИАЛЫ:  
${newReport.materials}  
➖➖➖➖➖➖➖➖➖➖➖
    `.trim();

    const groupChatId = OBJECT_GROUPS[newReport.objectName] || GENERAL_GROUP_CHAT_ID;
    const originalReport = await loadUserReports(userId)[originalReportId];
    if (originalReport) {
        if (originalReport.groupMessageId) await ctx.telegram.deleteMessage(groupChatId, originalReport.groupMessageId).catch(e => console.error(e.message));
        if (originalReport.generalMessageId) await ctx.telegram.deleteMessage(GENERAL_GROUP_CHAT_ID, originalReport.generalMessageId).catch(e => console.error(e.message));
        const client = await require('../../database/db').pool.connect();
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

    const buttons = [[Markup.button.callback('↩️ Вернуться в личный кабинет', 'profile')]];
    await sendMenu(ctx, userId, `✅ Ваш отчёт обновлён:\n\n${reportText}`, buttons);
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

        ctx.state.step = 'workDone';
        ctx.state.report = { objectName: selectedObject };
        await ctx.reply(steps.workDone.prompt);
    });

    bot.action('view_reports', showReportObjects);
    bot.action(/select_report_object_(\d+)/, (ctx) => showReportDates(ctx, parseInt(ctx.match[1], 10)));
    bot.action(/select_report_date_(\d+)_(\d+)/, (ctx) => showReportTimestamps(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10)));
    bot.action(/select_report_time_(.+)/, (ctx) => showReportDetails(ctx, ctx.match[1]));
    bot.action(/edit_report_(.+)/, (ctx) => editReport(ctx, ctx.match[1]));

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state;
        if (!state || !steps[state.step]) return;

        const text = ctx.message.text.trim();
        if (!text) {
            await ctx.reply('Поле не может быть пустым. Повторите ввод:');
            return;
        }

        state.report[state.step.includes('WorkDone') ? 'workDone' : 'materials'] = text;
        const stepConfig = steps[state.step];

        if (stepConfig.next) {
            state.step = stepConfig.next;
            await ctx.reply(steps[state.step].prompt);
        } else if (stepConfig.handler === 'handleReportText') {
            await handleReportText(ctx, userId, state);
            state.step = null;
            state.report = {};
        } else if (stepConfig.handler === 'handleEditedReport') {
            await handleEditedReport(ctx, userId, state);
            state.step = null;
            state.report = {};
        }
    });

    bot.action('edit_fullName', async (ctx) => {
        const userId = ctx.from.id.toString();
        ctx.state.step = 'editFullName';
        await ctx.reply('Введите ваше новое ФИО:');
    });

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state;
        if (state.step !== 'editFullName') return;

        const fullName = ctx.message.text.trim();
        if (!fullName) {
            await ctx.reply('ФИО не может быть пустым. Введите ваше ФИО:');
            return;
        }
        const users = await loadUsers();
        users[userId].fullName = fullName;
        await saveUser(userId, users[userId]);
        await ctx.reply(`ФИО обновлено на "${fullName}".`);
        state.step = null;
        await require('./menu').showProfile(ctx);
    });
};