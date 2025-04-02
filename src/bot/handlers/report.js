const { Markup } = require('telegraf');
const Queue = require('bull');
const ExcelJS = require('exceljs');
const NodeCache = require('node-cache');
const { loadUsers } = require('../../database/userModel');
const { loadUserReports, loadAllReports, saveReport } = require('../../database/reportModel');
const { ORGANIZATION_OBJECTS } = require('../../config/config');
const { clearPreviousMessages, formatDate, parseAndFormatDate } = require('../utils');

// Инициализация кэша и очереди с Redis
const reportCache = new NodeCache({ stdTTL: 300 }); // Кэш на 5 минут
const reportQueue = new Queue('report-generation', process.env.REDIS_URL || 'redis://localhost:6379', {
    defaultJobOptions: { timeout: 60000 } // Тайм-аут 60 секунд для больших отчетов
});

// Фоновая обработка генерации Excel
reportQueue.process(async (job) => {
    const { userId, objectName, chatId } = job.data;
    console.log(`Processing report for user ${userId}, object: ${objectName}`);

    const users = await loadUsers();
    const allReports = await loadAllReports();
    const objectReports = Object.values(allReports).filter(report => report.objectName === objectName);

    if (objectReports.length === 0) {
        await job.data.ctx.telegram.sendMessage(chatId, `Отчеты для объекта "${objectName}" не найдены.`);
        console.log(`No reports found for ${objectName}`);
        return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Отчеты');

    const titleStyle = { font: { name: 'Arial', size: 12, bold: true }, alignment: { horizontal: 'center' } };
    const headerStyle = {
        font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    };
    const centeredCellStyle = {
        font: { name: 'Arial', size: 9 },
        alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
        border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    };
    const paddedCellStyle = {
        font: { name: 'Arial', size: 9 },
        alignment: { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 },
        border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    };

    worksheet.mergeCells('A1:E1');
    worksheet.getCell('A1').value = objectName;
    worksheet.getCell('A1').style = titleStyle;

    worksheet.getRow(2).values = ['Дата', 'Выполненные работы', 'Поставленные материалы', 'ИТР', 'Изображения'];
    worksheet.getRow(2).eachCell(cell => { cell.style = headerStyle; });
    worksheet.columns = [
        { key: 'date', width: 12 },
        { key: 'workDone', width: 40 },
        { key: 'materials', width: 40 },
        { key: 'itr', width: 30 },
        { key: 'photos', width: 20 }
    ];

    objectReports.sort((a, b) => {
        const dateA = parseAndFormatDate(a.date);
        const dateB = parseAndFormatDate(b.date);
        const dateObjA = parseDateFromDDMMYYYY(dateA);
        const dateObjB = parseDateFromDDMMYYYY(dateB);
        const dateCompare = dateObjB - dateObjA;
        return dateCompare === 0 ? b.timestamp.localeCompare(a.timestamp) : dateCompare;
    });

    let currentRow = 3;
    let lastDate = null, lastUserId = null, dateStartRow = null, itrStartRow = null, dateCount = 0, itrCount = 0;

    for (let i = 0; i < objectReports.length; i++) {
        const report = objectReports[i];
        const user = users[report.userId] || {};
        const position = user.position === 'Инженер пто' ? 'Инженер ПТО' : user.position;
        const itrText = `${position || 'Не указано'}\n${user.organization || 'Не указано'}\n${report.fullName || 'Не указано'}`;
        const photosCount = report.photos?.length > 0 ? `${report.photos.length} фото` : 'Нет';
        const formattedDate = parseAndFormatDate(report.date);

        worksheet.getRow(currentRow).values = [formattedDate, report.workDone, report.materials, itrText, photosCount];
        worksheet.getCell(`A${currentRow}`).style = centeredCellStyle;
        worksheet.getCell(`B${currentRow}`).style = paddedCellStyle;
        worksheet.getCell(`C${currentRow}`).style = paddedCellStyle;
        worksheet.getCell(`D${currentRow}`).style = centeredCellStyle;

        const photosCell = worksheet.getCell(`E${currentRow}`);
        if (report.photos?.length > 0 && report.messageLink) {
            photosCell.value = { text: photosCount, hyperlink: report.messageLink };
            photosCell.style = { ...centeredCellStyle, font: { ...centeredCellStyle.font, color: { argb: 'FF0000FF' }, underline: true } };
        } else {
            photosCell.style = centeredCellStyle;
        }

        const maxLines = Math.max(report.workDone.split('\n').length, report.materials.split('\n').length, itrText.split('\n').length, photosCount.split('\n').length);
        worksheet.getRow(currentRow).height = Math.max(15, maxLines * 15);

        if (lastDate !== formattedDate && lastDate !== null && dateCount > 1) worksheet.mergeCells(`A${dateStartRow}:A${currentRow - 1}`);
        if (lastUserId !== report.userId && lastUserId !== null && itrCount > 1) worksheet.mergeCells(`D${itrStartRow}:D${currentRow - 1}`);

        if (lastDate !== formattedDate) {
            lastDate = formattedDate;
            dateStartRow = currentRow;
            dateCount = 1;
        } else dateCount++;

        if (lastUserId !== report.userId || lastDate !== formattedDate) {
            lastUserId = report.userId;
            itrStartRow = currentRow;
            itrCount = 1;
        } else itrCount++;

        if (i === objectReports.length - 1) {
            if (dateCount > 1) worksheet.mergeCells(`A${dateStartRow}:A${currentRow}`);
            if (itrCount > 1) worksheet.mergeCells(`D${itrStartRow}:D${currentRow}`);
        }
        currentRow++;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `${objectName}_reports_${formatDate(new Date())}.xlsx`;
    await job.data.ctx.telegram.sendDocument(chatId, { source: buffer, filename });
    console.log(`Report generated and sent for ${objectName}`);
});

function parseDateFromDDMMYYYY(dateString) {
    const [day, month, year] = dateString.split('.').map(Number);
    return new Date(year, month - 1, day);
}

async function showDownloadReport(ctx, page = 0) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
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
    const users = await loadUsers();
    const objectName = ORGANIZATION_OBJECTS[users[userId].organization]?.[objectIndex];
    if (!objectName) return;

    await clearPreviousMessages(ctx, userId);
    const message = await ctx.reply('⏳ Отчет генерируется, вы получите его скоро.');
    ctx.state.userStates[userId].lastMessageId = message.message_id;

    // Добавляем задачу в очередь
    await reportQueue.add({ userId, objectName, chatId: ctx.chat.id, ctx });
    console.log(`Report job added to queue for ${objectName}`);
}

async function createReport(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    if (users[userId].position !== 'Производитель работ' || !users[userId].isApproved) return;

    const userObjects = users[userId].selectedObjects;
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

    if (report.photos?.length > 0) await ctx.telegram.sendMediaGroup(ctx.chat.id, report.photos.map(photoId => ({ type: 'photo', media: photoId })));
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
    bot.action('download_report', async (ctx) => await showDownloadReport(ctx, 0));
    bot.action(/download_report_page_(\d+)/, async (ctx) => await showDownloadReport(ctx, parseInt(ctx.match[1], 10)));
    bot.action(/download_report_file_(\d+)/, async (ctx) => await downloadReportFile(ctx, parseInt(ctx.match[1], 10)));
    bot.action('create_report', createReport);
    bot.action(/select_object_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const objectIndex = parseInt(ctx.match[1], 10);
        const users = await loadUsers();
        const selectedObject = users[userId].selectedObjects[objectIndex];
        if (!selectedObject) return;

        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId] = { step: 'workDone', report: { objectName: selectedObject, photos: [] }, lastMessageId: null };
        const message = await ctx.reply('💡 Введите информацию о выполненных работах:');
        ctx.state.userStates[userId].lastMessageId = message.message_id;
    });
    bot.action('view_reports', showReportObjects);
    bot.action(/select_report_object_(\d+)/, (ctx) => showReportDates(ctx, parseInt(ctx.match[1], 10), 0));
    bot.action(/report_dates_page_(\d+)_(\d+)/, (ctx) => showReportDates(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10)));
    bot.action(/select_report_date_(\d+)_(\d+)/, (ctx) => showReportTimestamps(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10), 0));
    bot.action(/report_timestamps_page_(\d+)_(\d+)_(\d+)/, (ctx) => showReportTimestamps(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10), parseInt(ctx.match[3], 10)));
    bot.action(/select_report_time_(.+)/, (ctx) => showReportDetails(ctx, ctx.match[1]));
    bot.action(/edit_report_(.+)/, (ctx) => editReport(ctx, ctx.match[1]));
    bot.action(/delete_all_photos_(.+)/, (ctx) => deleteAllPhotos(ctx, ctx.match[1]));
};