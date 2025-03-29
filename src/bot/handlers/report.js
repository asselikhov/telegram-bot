const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { loadUserReports, saveReport, getReportText } = require('../../database/reportModel');
const { OBJECTS_LIST_CYRILLIC, OBJECT_GROUPS, GENERAL_GROUP_CHAT_ID } = require('../../config/config');
const { clearPreviousMessages } = require('../bot');

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
👷 ИТР: ${users[userId].fullName} 
🔧 ВЫПОЛНЕННЫЕ РАБОТЫ:  
${state.report.workDone}  
📦 ПОСТАВЛЕННЫЕ МАТЕРИАЛЫ:  
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

module.exports = (bot) => {
    bot.action('download_report', showDownloadReport);
    bot.action(/download_report_file_(\d+)/, (ctx) => downloadReportFile(ctx, parseInt(ctx.match[1], 10)));
    bot.action('create_report', createReport);
    bot.action(/select_object_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const objectIndex = parseInt(ctx.match[1], 10);
        const selectedObject = OBJECTS_LIST_CYRILLIC[objectIndex];
        if (!selectedObject) return;

        await clearPreviousMessages(ctx, userId);

        ctx.state.userStates[userId] = { step: 'workDone', report: { objectName: selectedObject } };
        await ctx.reply('Введите наименование проделанных работ (или "работы не производились"):');
    });

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state.userStates[userId];
        if (!state || (!state.step.includes('workDone') && !state.step.includes('materials') && !state.step.includes('editFullName'))) return;

        await clearPreviousMessages(ctx, userId);

        if (state.step === 'workDone') {
            state.report.workDone = ctx.message.text.trim();
            state.step = 'materials';
            await ctx.reply('Введите информацию о поставленных материалах (или "доставки не было"):');
        } else if (state.step === 'materials') {
            state.report.materials = ctx.message.text.trim();
            await handleReportText(ctx, userId, state);
            delete ctx.state.userStates[userId];
        } else if (state.step === 'editFullName') {
            const users = await loadUsers();
            users[userId].fullName = ctx.message.text.trim();
            await saveUser(userId, users[userId]);
            await ctx.reply(`ФИО обновлено на "${users[userId].fullName}".`);
            delete ctx.state.userStates[userId];
            await require('./menu').showProfile(ctx);
        }
    });

    bot.action('edit_fullName', async (ctx) => {
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId] = { step: 'editFullName' };
        await ctx.reply('Введите ваше новое ФИО:');
    });

    bot.action('view_reports', async (ctx) => {
        const userId = ctx.from.id.toString();
        const users = await loadUsers();
        const reports = await loadUserReports(userId);

        await clearPrevious