const { Markup, Telegraf } = require('telegraf');
const Queue = require('bull');
const ExcelJS = require('exceljs');
const NodeCache = require('node-cache');
const { loadUsers, saveUser } = require('../../database/userModel');
const { loadUserReports, loadAllReports, saveReport } = require('../../database/reportModel');
const { ORGANIZATION_OBJECTS } = require('../../config/config');
const { formatDate, parseAndFormatDate } = require('../utils');

// Инициализация Telegram-клиента
const botToken = process.env.BOT_TOKEN;
const telegram = new Telegraf(botToken).telegram;

// Инициализация кэша и очереди с Redis
const reportCache = new NodeCache({ stdTTL: 1800 }); // 30 минут
const reportQueue = new Queue('report-generation', process.env.REDIS_URL || 'redis://localhost:6379', {
    defaultJobOptions: { timeout: 60000 }
});

reportQueue.on('error', (error) => console.error('Redis queue error:', error));

// Предварительная загрузка кэша
async function preloadCache() {
    const users = await loadUsers();
    const allReports = await loadAllReports();
    reportCache.set('users', users);
    reportCache.set('all_reports', allReports);
    console.log('Cache preloaded with users and reports');
}

preloadCache().catch(console.error);

// Дебounce для предотвращения множественных нажатий
const debounceTimeouts = new Map();
function debounceAction(userId, action, delay = 300) {
    if (debounceTimeouts.has(userId)) clearTimeout(debounceTimeouts.get(userId));
    return new Promise((resolve) => {
        debounceTimeouts.set(userId, setTimeout(() => {
            debounceTimeouts.delete(userId);
            resolve(action());
        }, delay));
    });
}

async function clearPreviousMessages(ctx, userId) {
    const userState = ctx.state.userStates[userId];
    if (userState?.lastMessageId) {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, userState.lastMessageId);
            userState.lastMessageId = null;
        } catch (error) {
            console.error(`Failed to delete message ${userState.lastMessageId}:`, error);
        }
    }
}

// Фоновая обработка генерации Excel (без изменений для краткости)
reportQueue.process(async (job) => {
    const { userId, objectName, chatId } = job.data;
    console.log(`Processing report for user ${userId}, object: ${objectName}`);
    // ... (логика генерации Excel остается прежней, см. предыдущий код)
});

function parseDateFromDDMMYYYY(dateString) {
    const [day, month, year] = dateString.split('.').map(Number);
    return new Date(year, month - 1, day);
}

async function showDownloadReport(ctx, page = 0) {
    const userId = ctx.from.id.toString();
    const users = reportCache.get('users') || await loadUsers();
    if (!users[userId]?.isApproved) return;

    const userOrganization = users[userId].organization;
    const availableObjects = ORGANIZATION_OBJECTS[userOrganization] || [];
    if (!availableObjects.length) return;

    const itemsPerPage = 10;
    const totalPages = Math.ceil(availableObjects.length / itemsPerPage);
    const startIndex = page * itemsPerPage;
    const currentObjects = availableObjects.slice(startIndex, startIndex + itemsPerPage);

    await clearPreviousMessages(ctx, userId);

    const buttons = currentObjects.map((obj, index) => [
        Markup.button.callback(obj, `download_report_file_${availableObjects.indexOf(obj)}`)
    ]);
    if (totalPages > 1) {
        const pagination = [];
        if (page > 0) pagination.push(Markup.button.callback('⬅️ Назад', `download_report_page_${page - 1}`));
        if (page < totalPages - 1) pagination.push(Markup.button.callback('Вперед ➡️', `download_report_page_${page + 1}`));
        if (pagination.length) buttons.push(pagination);
    }
    buttons.push([Markup.button.callback('↩️ Вернуться в главное меню', 'main_menu')]);

    const lastMessageId = ctx.state.userStates[userId]?.lastMessageId;
    const text = `Выберите объект для выгрузки отчета (Страница ${page + 1} из ${totalPages}):`;
    if (lastMessageId) {
        await ctx.telegram.editMessageText(ctx.chat.id, lastMessageId, null, text, Markup.inlineKeyboard(buttons))
            .catch(async () => {
                const message = await ctx.reply(text, Markup.inlineKeyboard(buttons));
                ctx.state.userStates[userId].lastMessageId = message.message_id;
            });
    } else {
        const message = await ctx.reply(text, Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].lastMessageId = message.message_id;
    }
}

async function downloadReportFile(ctx, objectIndex) {
    const userId = ctx.from.id.toString();
    const users = reportCache.get('users') || await loadUsers();
    const objectName = ORGANIZATION_OBJECTS[users[userId].organization]?.[objectIndex];
    if (!objectName) return;

    await clearPreviousMessages(ctx, userId);
    const message = await ctx.reply('⏳ Отчет генерируется, вы получите его скоро.');
    ctx.state.userStates[userId].lastMessageId = message.message_id;

    await reportQueue.add({ userId, objectName, chatId: ctx.chat.id });
    console.log(`Report job added to queue for ${objectName}`);
}

async function createReport(ctx) {
    const userId = ctx.from.id.toString();
    const users = reportCache.get('users') || await loadUsers();
    const user = users[userId];
    if (user.position !== 'Производитель работ' || !user.isApproved) return;

    const userObjects = user.selectedObjects;
    if (!userObjects?.length) return;

    await clearPreviousMessages(ctx, userId);
    const buttons = userObjects.map((obj, index) => [Markup.button.callback(obj, `select_object_${index}`)]);
    buttons.push([Markup.button.callback('↩️ Вернуться в главное меню', 'main_menu')]);

    const lastMessageId = ctx.state.userStates[userId]?.lastMessageId;
    if (lastMessageId) {
        await ctx.telegram.editMessageText(ctx.chat.id, lastMessageId, null, 'Выберите объект из списка:', Markup.inlineKeyboard(buttons))
            .catch(async () => {
                const message = await ctx.reply('Выберите объект из списка:', Markup.inlineKeyboard(buttons));
                ctx.state.userStates[userId].lastMessageId = message.message_id;
            });
    } else {
        const message = await ctx.reply('Выберите объект из списка:', Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].lastMessageId = message.message_id;
    }
}

async function showReportObjects(ctx) {
    const userId = ctx.from.id.toString();
    const cachedReports = reportCache.get(`user_${userId}`) || await loadUserReports(userId);
    reportCache.set(`user_${userId}`, cachedReports);

    await clearPreviousMessages(ctx, userId);
    if (!Object.keys(cachedReports).length) {
        const message = await ctx.reply('У вас пока нет отчетов.');
        ctx.state.userStates[userId].lastMessageId = message.message_id;
        return;
    }

    const uniqueObjects = [...new Set(Object.values(cachedReports).map(r => r.objectName))];
    const buttons = uniqueObjects.map((obj, index) => [Markup.button.callback(obj, `select_report_object_${index}`)]);
    buttons.push([Markup.button.callback('↩️ Назад', 'profile')]);

    const lastMessageId = ctx.state.userStates[userId]?.lastMessageId;
    if (lastMessageId) {
        await ctx.telegram.editMessageText(ctx.chat.id, lastMessageId, null, 'Выберите объект для просмотра отчетов:', Markup.inlineKeyboard(buttons))
            .catch(async () => {
                const message = await ctx.reply('Выберите объект для просмотра отчетов:', Markup.inlineKeyboard(buttons));
                ctx.state.userStates[userId].lastMessageId = message.message_id;
            });
    } else {
        const message = await ctx.reply('Выберите объект для просмотра отчетов:', Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].lastMessageId = message.message_id;
    }
}

async function showReportDates(ctx, objectIndex, page = 0) {
    const userId = ctx.from.id.toString();
    const cachedReports = reportCache.get(`user_${userId}`) || await loadUserReports(userId);
    const uniqueObjects = [...new Set(Object.values(cachedReports).map(r => r.objectName))];
    const objectName = uniqueObjects[objectIndex];

    await clearPreviousMessages(ctx, userId);
    const objectReports = Object.values(cachedReports).filter(r => r.objectName === objectName);
    const uniqueDates = [...new Set(objectReports.map(r => parseAndFormatDate(r.date)))];

    const itemsPerPage = 10;
    const totalPages = Math.ceil(uniqueDates.length / itemsPerPage);
    const startIndex = page * itemsPerPage;
    const currentDates = uniqueDates.slice(startIndex, startIndex + itemsPerPage).reverse();

    const buttons = currentDates.map((date, index) => [
        Markup.button.callback(date, `select_report_date_${objectIndex}_${uniqueDates.indexOf(date)}`)
    ]);
    if (totalPages > 1) {
        const pagination = [];
        if (page > 0) pagination.push(Markup.button.callback('⬅️ Назад', `report_dates_page_${objectIndex}_${page - 1}`));
        if (page < totalPages - 1) pagination.push(Markup.button.callback('Вперед ➡️', `report_dates_page_${objectIndex}_${page + 1}`));
        if (pagination.length) buttons.unshift(pagination);
    }
    buttons.push([Markup.button.callback('↩️ Назад', 'view_reports')]);

    const text = `Выберите дату для объекта "${objectName}" (Страница ${page + 1} из ${totalPages}):`;
    const lastMessageId = ctx.state.userStates[userId]?.lastMessageId;
    if (lastMessageId) {
        await ctx.telegram.editMessageText(ctx.chat.id, lastMessageId, null, text, Markup.inlineKeyboard(buttons))
            .catch(async () => {
                const message = await ctx.reply(text, Markup.inlineKeyboard(buttons));
                ctx.state.userStates[userId].lastMessageId = message.message_id;
            });
    } else {
        const message = await ctx.reply(text, Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].lastMessageId = message.message_id;
    }
}

async function showReportTimestamps(ctx, objectIndex, dateIndex, page = 0) {
    const userId = ctx.from.id.toString();
    const cachedReports = reportCache.get(`user_${userId}`) || await loadUserReports(userId);
    const uniqueObjects = [...new Set(Object.values(cachedReports).map(r => r.objectName))];
    const objectName = uniqueObjects[objectIndex];
    const objectReports = Object.entries(cachedReports).filter(([_, r]) => r.objectName === objectName);
    const uniqueDates = [...new Set(objectReports.map(([, r]) => parseAndFormatDate(r.date)))];
    const selectedDate = uniqueDates[dateIndex];

    await clearPreviousMessages(ctx, userId);
    const dateReports = objectReports.filter(([_, r]) => parseAndFormatDate(r.date) === selectedDate)
        .sort((a, b) => a[1].timestamp.localeCompare(b[1].timestamp));

    const itemsPerPage = 10;
    const totalPages = Math.ceil(dateReports.length / itemsPerPage);
    const startIndex = page * itemsPerPage;
    const currentReports = dateReports.slice(startIndex, startIndex + itemsPerPage).reverse();

    const buttons = currentReports.map(([reportId, report]) => [
        Markup.button.callback(new Date(report.timestamp).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' }), `select_report_time_${reportId}`)
    ]);
    if (totalPages > 1) {
        const pagination = [];
        if (page > 0) pagination.push(Markup.button.callback('⬅️ Назад', `report_timestamps_page_${objectIndex}_${dateIndex}_${page - 1}`));
        if (page < totalPages - 1) pagination.push(Markup.button.callback('Вперед ➡️', `report_timestamps_page_${objectIndex}_${dateIndex}_${page + 1}`));
        if (pagination.length) buttons.unshift(pagination);
    }
    buttons.push([Markup.button.callback('↩️ Назад', `select_report_object_${objectIndex}`)]);

    const text = `Выберите время отчета для "${objectName}" за ${selectedDate} (Страница ${page + 1} из ${totalPages}):`;
    const lastMessageId = ctx.state.userStates[userId]?.lastMessageId;
    if (lastMessageId) {
        await ctx.telegram.editMessageText(ctx.chat.id, lastMessageId, null, text, Markup.inlineKeyboard(buttons))
            .catch(async () => {
                const message = await ctx.reply(text, Markup.inlineKeyboard(buttons));
                ctx.state.userStates[userId].lastMessageId = message.message_id;
            });
    } else {
        const message = await ctx.reply(text, Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].lastMessageId = message.message_id;
    }
}

async function showReportDetails(ctx, reportId) {
    const userId = ctx.from.id.toString();
    const cachedReports = reportCache.get(`user_${userId}`) || await loadUserReports(userId);
    const report = cachedReports[reportId];

    await clearPreviousMessages(ctx, userId);
    if (!report) return;

    const formattedDate = parseAndFormatDate(report.date);
    const time = new Date(report.timestamp).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' });
    const reportText = `
📅 ОТЧЕТ ЗА ${formattedDate}  
🏢 ${report.objectName}  
➖➖➖➖➖➖➖➖➖➖➖ 
👷 ${report.fullName}  
ВЫПОЛНЕННЫЕ РАБОТЫ: ${report.workDone}  
ПОСТАВЛЕННЫЕ МАТЕРИАЛЫ: ${report.materials}  
➖➖➖➖➖➖➖➖➖➖➖
Время: ${time}
    `.trim();

    const uniqueObjects = [...new Set(Object.values(cachedReports).map(r => r.objectName))];
    const uniqueDates = [...new Set(Object.values(cachedReports).filter(r => r.objectName === report.objectName).map(r => parseAndFormatDate(r.date)))];
    const buttons = [
        [Markup.button.callback('✏️ Редактировать', `edit_report_${reportId}`)],
        [Markup.button.callback('↩️ Назад', `select_report_date_${uniqueObjects.indexOf(report.objectName)}_${uniqueDates.indexOf(formattedDate)}`)]
    ];

    if (report.photos?.length > 0) ctx.telegram.sendMediaGroup(ctx.chat.id, report.photos.map(photoId => ({ type: 'photo', media: photoId }))).catch(console.error);
    const message = await ctx.reply(reportText, Markup.inlineKeyboard(buttons));
    ctx.state.userStates[userId].lastMessageId = message.message_id;
}

async function editReport(ctx, reportId) {
    const userId = ctx.from.id.toString();
    const cachedReports = reportCache.get(`user_${userId}`) || await loadUserReports(userId);
    const report = cachedReports[reportId];
    if (!report) return;

    await clearPreviousMessages(ctx, userId);
    ctx.state.userStates[userId] = { step: 'editWorkDone', report: { ...report, originalReportId: reportId }, lastMessageId: null };
    const message = await ctx.reply('💡 Введите новую информацию о выполненных работах:');
    ctx.state.userStates[userId].lastMessageId = message.message_id;
}

async function deleteAllPhotos(ctx, reportId) {
    const userId = ctx.from.id.toString();
    const userState = ctx.state.userStates[userId];
    if (!userState?.report?.originalReportId === reportId) return;

    await clearPreviousMessages(ctx, userId);
    userState.report.photos = [];
    userState.step = 'editPhotos';

    const message = await ctx.reply('Все фото удалены. Отправьте новые или нажмите "Готово".', Markup.inlineKeyboard([
        [Markup.button.callback('Готово', `finish_edit_${reportId}`)]
    ]));
    ctx.state.userStates[userId].lastMessageId = message.message_id;
}

module.exports = (bot) => {
    bot.action('download_report', async (ctx) => await debounceAction(ctx.from.id.toString(), () => showDownloadReport(ctx, 0)));
    bot.action(/download_report_page_(\d+)/, async (ctx) => await debounceAction(ctx.from.id.toString(), () => showDownloadReport(ctx, parseInt(ctx.match[1], 10))));
    bot.action(/download_report_file_(\d+)/, async (ctx) => await debounceAction(ctx.from.id.toString(), () => downloadReportFile(ctx, parseInt(ctx.match[1], 10))));
    bot.action('create_report', async (ctx) => await debounceAction(ctx.from.id.toString(), () => createReport(ctx)));
    bot.action(/select_object_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const objectIndex = parseInt(ctx.match[1], 10);
        const users = reportCache.get('users') || await loadUsers();
        const selectedObject = users[userId].selectedObjects[objectIndex];
        if (!selectedObject) return;

        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId] = {
            step: 'workDone',
            report: { objectName: selectedObject, photos: [], timestamp: new Date().toISOString(), userId, fullName: users[userId].fullName },
            lastMessageId: null
        };
        const message = await ctx.reply('💡 Введите информацию о выполненных работах:');
        ctx.state.userStates[userId].lastMessageId = message.message_id;
    });

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id.toString();
        const userState = ctx.state.userStates[userId];
        if (!userState || !userState.report) return;

        await clearPreviousMessages(ctx, userId);

        if (userState.step === 'workDone') {
            userState.report.workDone = ctx.message.text;
            userState.step = 'materials';
            const message = await ctx.reply('💡 Введите информацию о поставленных материалах:');
            userState.lastMessageId = message.message_id;
        } else if (userState.step === 'materials') {
            userState.report.materials = ctx.message.text;
            userState.step = 'photos';
            userState.report.date = formatDate(new Date());
            const message = await ctx.reply('📸 Отправьте фотографии (или нажмите "Готово", если их нет):', Markup.inlineKeyboard([
                [Markup.button.callback('Готово', 'finish_report')]
            ]));
            userState.lastMessageId = message.message_id;
        } else if (userState.step === 'editWorkDone') {
            userState.report.workDone = ctx.message.text;
            userState.step = 'editMaterials';
            const message = await ctx.reply('💡 Введите новую информацию о поставленных материалах:');
            userState.lastMessageId = message.message_id;
        } else if (userState.step === 'editMaterials') {
            userState.report.materials = ctx.message.text;
            userState.step = 'editPhotos';
            const message = await ctx.reply('📸 Отправьте новые фотографии (или нажмите "Готово"):', Markup.inlineKeyboard([
                [Markup.button.callback('Готово', `finish_edit_${userState.report.originalReportId}`)]
            ]));
            userState.lastMessageId = message.message_id;
        }
    });

    bot.on('photo', async (ctx) => {
        const userId = ctx.from.id.toString();
        const userState = ctx.state.userStates[userId];
        if (!userState || (userState.step !== 'photos' && userState.step !== 'editPhotos')) return;

        const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        userState.report.photos.push(photoId);

        await clearPreviousMessages(ctx, userId);

        if (userState.report.photos.length > 0) {
            ctx.telegram.sendMediaGroup(ctx.chat.id, userState.report.photos.map(photoId => ({
                type: 'photo',
                media: photoId
            }))).catch(console.error);
        }

        const action = userState.step === 'photos' ? 'finish_report' : `finish_edit_${userState.report.originalReportId}`;
        const message = await ctx.reply(`Добавлено ${userState.report.photos.length} фото. Отправьте еще или нажмите "Готово".`, Markup.inlineKeyboard([
            [Markup.button.callback('Готово', action)]
        ]));
        userState.lastMessageId = message.message_id;
    });

    bot.action('finish_report', async (ctx) => {
        const userId = ctx.from.id.toString();
        const userState = ctx.state.userStates[userId];
        if (!userState || !userState.report) return;

        await clearPreviousMessages(ctx, userId);

        const users = reportCache.get('users') || await loadUsers();
        const reportId = `${userId}_${users[userId].nextReportId || 1}`;
        userState.report.reportId = reportId;

        await saveReport(userId, userState.report);

        users[userId].nextReportId = (users[userId].nextReportId || 1) + 1;
        await saveUser(userId, users[userId]);
        reportCache.set('users', users);

        const message = await ctx.reply('✅ Отчет успешно сохранен!');
        userState.lastMessageId = message.message_id;

        delete ctx.state.userStates[userId];
    });

    bot.action(/finish_edit_(.+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const reportId = ctx.match[1];
        const userState = ctx.state.userStates[userId];
        if (!userState || !userState.report || userState.report.originalReportId !== reportId) return;

        await clearPreviousMessages(ctx, userId);

        await saveReport(userId, { ...userState.report, reportId });

        const message = await ctx.reply('✅ Отчет успешно отредактирован!');
        userState.lastMessageId = message.message_id;

        delete ctx.state.userStates[userId];
    });

    bot.action('view_reports', async (ctx) => await debounceAction(ctx.from.id.toString(), () => showReportObjects(ctx)));
    bot.action(/select_report_object_(\d+)/, async (ctx) => await debounceAction(ctx.from.id.toString(), () => showReportDates(ctx, parseInt(ctx.match[1], 10), 0)));
    bot.action(/report_dates_page_(\d+)_(\d+)/, async (ctx) => await debounceAction(ctx.from.id.toString(), () => showReportDates(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10))));
    bot.action(/select_report_date_(\d+)_(\d+)/, async (ctx) => await debounceAction(ctx.from.id.toString(), () => showReportTimestamps(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10), 0)));
    bot.action(/report_timestamps_page_(\d+)_(\d+)_(\d+)/, async (ctx) => await debounceAction(ctx.from.id.toString(), () => showReportTimestamps(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10), parseInt(ctx.match[3], 10))));
    bot.action(/select_report_time_(.+)/, async (ctx) => await debounceAction(ctx.from.id.toString(), () => showReportDetails(ctx, ctx.match[1])));
    bot.action(/edit_report_(.+)/, async (ctx) => await debounceAction(ctx.from.id.toString(), () => editReport(ctx, ctx.match[1])));
    bot.action(/delete_all_photos_(.+)/, async (ctx) => await debounceAction(ctx.from.id.toString(), () => deleteAllPhotos(ctx, ctx.match[1])));
};