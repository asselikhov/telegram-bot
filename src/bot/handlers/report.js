console.log('[DEBUG] report.js загружен, версия: 2024-04-01 12:01');
const { Markup } = require('telegraf');
const ExcelJS = require('exceljs');
const { loadUsers, saveUser } = require('../../database/userModel');
const { loadUserReports, loadAllReports } = require('../../database/reportModel');
const { ORGANIZATION_OBJECTS } = require('../../config/config');
const { clearPreviousMessages, formatDate, parseAndFormatDate } = require('../utils');

// Универсальная функция для очистки всех сообщений
async function clearAllMessages(ctx, userId) {
    const state = ctx.state.userStates[userId];
    const messageIds = state.messageIds || [];
    const lastReportMessageId = state.lastReportMessageId;

    // Удаляем все сообщения из messageIds
    if (messageIds.length > 0) {
        console.log(`[clearAllMessages] Найдено ${messageIds.length} сообщений для удаления:`, messageIds);
        for (const msgId of messageIds) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, msgId);
                console.log(`[clearAllMessages] Сообщение ${msgId} успешно удалено`);
            } catch (err) {
                console.error(`[clearAllMessages] Не удалось удалить сообщение ${msgId}: ${err.message}`);
            }
        }
        state.messageIds = [];
    }

    // Удаляем сообщение с отчетом, если есть
    if (lastReportMessageId) {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, lastReportMessageId);
            console.log(`[clearAllMessages] Сообщение с отчетом ${lastReportMessageId} удалено`);
        } catch (err) {
            console.error(`[clearAllMessages] Не удалось удалить сообщение с отчетом ${lastReportMessageId}: ${err.message}`);
        }
        state.lastReportMessageId = null;
    }

    console.log(`[clearAllMessages] Очистка завершена для userId ${userId}, состояние:`, state);
}

async function showDownloadReport(ctx, page = 0) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();

    if (!users[userId]?.isApproved) {
        console.log(`[showDownloadReport] Пользователь ${userId} не одобрен`);
        await clearAllMessages(ctx, userId);
        const message = await ctx.reply('У вас нет прав для выгрузки отчетов.');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        return;
    }

    const userOrganization = users[userId].organization;
    const availableObjects = ORGANIZATION_OBJECTS[userOrganization] || [];

    if (!availableObjects.length) {
        console.log(`[showDownloadReport] Для организации ${userOrganization} нет доступных объектов`);
        await clearAllMessages(ctx, userId);
        const message = await ctx.reply('Для вашей организации нет доступных объектов для выгрузки.');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        return;
    }

    const pageNum = typeof page === 'number' ? page : 0;
    await clearAllMessages(ctx, userId);

    const itemsPerPage = 10;
    const totalObjects = availableObjects.length;
    const totalPages = Math.ceil(totalObjects / itemsPerPage);

    const startIndex = pageNum * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalObjects);
    const currentObjects = availableObjects.slice(startIndex, endIndex);

    if (currentObjects.length === 0) {
        console.log(`[showDownloadReport] Нет объектов для отображения на странице ${pageNum}`);
        const message = await ctx.reply('Ошибка: нет объектов для отображения.');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        return;
    }

    const buttons = currentObjects.map((obj, index) =>
        [Markup.button.callback(obj, `download_report_file_${availableObjects.indexOf(obj)}`)]
    );

    const paginationButtons = [];
    if (totalPages > 1) {
        if (pageNum > 0) {
            paginationButtons.push(Markup.button.callback('⬅️ Назад', `download_report_page_${pageNum - 1}`));
        }
        if (pageNum < totalPages - 1) {
            paginationButtons.push(Markup.button.callback('Вперед ➡️', `download_report_page_${pageNum + 1}`));
        }
    }
    if (paginationButtons.length > 0) {
        buttons.push(paginationButtons);
    }
    buttons.push([Markup.button.callback('↩️ Вернуться в главное меню', 'main_menu')]);

    const message = await ctx.reply(
        `Выберите объект для выгрузки отчета (Страница ${pageNum + 1} из ${totalPages}):`,
        Markup.inlineKeyboard(buttons)
    );
    ctx.state.userStates[userId].messageIds.push(message.message_id);
    console.log(`[DEBUG] messageIds после добавления ${message.message_id}:`, ctx.state.userStates[userId].messageIds);
}

async function downloadReportFile(ctx, objectIndex) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const userOrganization = users[userId].organization;
    const availableObjects = ORGANIZATION_OBJECTS[userOrganization] || [];
    const objectName = availableObjects[objectIndex];

    if (!objectName) {
        console.log(`[downloadReportFile] Объект с индексом ${objectIndex} не найден для организации ${userOrganization}`);
        await clearAllMessages(ctx, userId);
        const message = await ctx.reply('Ошибка: объект не найден.');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        return;
    }

    const allReports = await loadAllReports();
    console.log(`[downloadReportFile] Загружено ${Object.keys(allReports).length} отчетов для проверки объекта "${objectName}"`);
    const objectReports = Object.values(allReports).filter(report => {
        const match = report.objectName === objectName;
        if (!match) {
            console.log(`[downloadReportFile] Отчет ${report.reportId} не совпадает: "${report.objectName}" !== "${objectName}"`);
        }
        return match;
    });

    if (objectReports.length === 0) {
        console.log(`[downloadReportFile] Отчеты для объекта "${objectName}" не найдены`);
        await clearAllMessages(ctx, userId);
        const message = await ctx.reply(`Отчеты для объекта "${objectName}" не найдены.`);
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        return;
    }

    await clearAllMessages(ctx, userId);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Отчеты');

    const titleStyle = {
        font: { name: 'Arial', size: 12, bold: true },
        alignment: { horizontal: 'center' }
    };
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
        if (dateA === dateB) return a.userId.localeCompare(b.userId);
        return dateB.localeCompare(dateA);
    });

    let currentRow = 3;
    let lastDate = null;
    let lastUserId = null;
    let dateStartRow = null;
    let itrStartRow = null;
    let dateCount = 0;
    let itrCount = 0;

    for (let i = 0; i < objectReports.length; i++) {
        const report = objectReports[i];
        const user = users[report.userId] || {};
        const position = user.position === 'Инженер пто' ? 'Инженер ПТО' : user.position;
        const itrText = `${position || 'Не указано'}\n${user.organization || 'Не указано'}\n${report.fullName || user.fullName || 'Не указано'}`;
        const photosCount = report.photos && report.photos.length > 0 ? `${report.photos.length} фото` : 'Нет';
        const formattedDate = parseAndFormatDate(report.date);

        worksheet.getRow(currentRow).values = [
            formattedDate,
            report.workDone,
            report.materials,
            itrText,
            photosCount
        ];

        worksheet.getCell(`A${currentRow}`).style = centeredCellStyle;
        worksheet.getCell(`B${currentRow}`).style = paddedCellStyle;
        worksheet.getCell(`C${currentRow}`).style = paddedCellStyle;
        worksheet.getCell(`D${currentRow}`).style = centeredCellStyle;

        const photosCell = worksheet.getCell(`E${currentRow}`);
        if (report.photos && report.photos.length > 0 && report.messageLink) {
            photosCell.value = {
                text: photosCount,
                hyperlink: report.messageLink
            };
            photosCell.style = {
                ...centeredCellStyle,
                font: { ...centeredCellStyle.font, color: { argb: 'FF0000FF' }, underline: true }
            };
        } else {
            photosCell.style = centeredCellStyle;
        }

        const maxLines = Math.max(
            report.workDone.split('\n').length,
            report.materials.split('\n').length,
            itrText.split('\n').length,
            photosCount.split('\n').length
        );
        worksheet.getRow(currentRow).height = Math.max(15, maxLines * 15);

        if (lastDate !== formattedDate && lastDate !== null && dateCount > 1) {
            worksheet.mergeCells(`A${dateStartRow}:A${currentRow - 1}`);
        }
        if (lastUserId !== report.userId && lastUserId !== null && itrCount > 1) {
            worksheet.mergeCells(`D${itrStartRow}:D${currentRow - 1}`);
        }

        if (lastDate !== formattedDate) {
            lastDate = formattedDate;
            dateStartRow = currentRow;
            dateCount = 1;
        } else {
            dateCount++;
        }

        if (lastUserId !== report.userId || lastDate !== formattedDate) {
            lastUserId = report.userId;
            itrStartRow = currentRow;
            itrCount = 1;
        } else {
            itrCount++;
        }

        if (i === objectReports.length - 1) {
            if (dateCount > 1) {
                worksheet.mergeCells(`A${dateStartRow}:A${currentRow}`);
            }
            if (itrCount > 1) {
                worksheet.mergeCells(`D${itrStartRow}:D${currentRow}`);
            }
        }

        currentRow++;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `${objectName}_reports_${formatDate(new Date())}.xlsx`;

    const documentMessage = await ctx.replyWithDocument({
        source: buffer,
        filename: filename
    });
    ctx.state.userStates[userId].lastReportMessageId = documentMessage.message_id;
    console.log(`[downloadReportFile] Excel-файл с отчетами для "${objectName}" отправлен пользователю ${userId}, message_id: ${documentMessage.message_id}, отчетов: ${objectReports.length}`);
}

async function createReport(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    if (users[userId].position !== 'Производитель работ' || !users[userId].isApproved) {
        await clearAllMessages(ctx, userId);
        const message = await ctx.reply('У вас нет прав для создания отчетов.');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        return;
    }

    await clearAllMessages(ctx, userId);

    const userObjects = users[userId].selectedObjects;
    if (!userObjects || userObjects.length === 0) {
        const message = await ctx.reply('У вас не выбрано ни одного объекта в личном кабинете.');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        return;
    }

    const buttons = userObjects.map((obj, index) =>
        [Markup.button.callback(obj, `select_object_${index}`)]
    );
    buttons.push([Markup.button.callback('↩️ Вернуться в главное меню', 'main_menu')]);

    const message = await ctx.reply('Выберите объект из списка:', Markup.inlineKeyboard(buttons));
    ctx.state.userStates[userId].messageIds.push(message.message_id);
    console.log(`[DEBUG] messageIds после добавления ${message.message_id}:`, ctx.state.userStates[userId].messageIds);
}

async function showReportObjects(ctx) {
    const userId = ctx.from.id.toString();
    console.log(`[showReportObjects] Вызов для userId ${userId}`);

    const users = await loadUsers();
    const reports = await loadUserReports(userId).catch(err => {
        console.error(`[showReportObjects] Ошибка загрузки отчетов для userId ${userId}: ${err.message}`);
        return {};
    });

    await clearAllMessages(ctx, userId);

    if (Object.keys(reports).length === 0) {
        console.log(`[showReportObjects] Отчеты для userId ${userId} не найдены`);
        const message = await ctx.reply('У вас пока нет отчетов.');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        return;
    }

    const uniqueObjects = [...new Set(Object.values(reports).map(r => r.objectName))];
    console.log(`[showReportObjects] Найдено ${uniqueObjects.length} уникальных объектов: ${uniqueObjects.join(', ')}`);

    const buttons = uniqueObjects.map((obj, index) =>
        [Markup.button.callback(obj, `select_report_object_${index}`)]
    );
    buttons.push([Markup.button.callback('↩️ Назад', 'profile')]);

    const message = await ctx.reply('Выберите объект для просмотра отчетов:', Markup.inlineKeyboard(buttons));
    ctx.state.userStates[userId].messageIds.push(message.message_id);
    console.log(`[DEBUG] messageIds после добавления ${message.message_id}:`, ctx.state.userStates[userId].messageIds);
}

async function showReportDates(ctx, objectIndex, page = 0) {
    const userId = ctx.from.id.toString();
    const reports = await loadUserReports(userId);
    const uniqueObjects = [...new Set(Object.values(reports).map(r => r.objectName))];
    const objectName = uniqueObjects[objectIndex];

    await clearAllMessages(ctx, userId);

    const objectReports = Object.values(reports).filter(r => r.objectName === objectName);
    const sortedReports = objectReports.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const uniqueDates = [...new Set(sortedReports.map(r => parseAndFormatDate(r.date)))];

    const itemsPerPage = 10;
    const totalPages = Math.ceil(uniqueDates.length / itemsPerPage);
    const pageNum = typeof page === 'number' ? page : 0;

    const startIndex = pageNum * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, uniqueDates.length);
    const currentDates = uniqueDates.slice(startIndex, endIndex);

    if (currentDates.length === 0) {
        console.log(`[showReportDates] Нет дат для отображения на странице ${pageNum} для объекта ${objectName}`);
        const message = await ctx.reply('Ошибка: нет дат для отображения.');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        return;
    }

    const dateButtons = currentDates.map((date, index) =>
        [Markup.button.callback(date, `select_report_date_${objectIndex}_${startIndex + index}`)]
    ).reverse();

    const buttons = [];
    const paginationButtons = [];
    if (totalPages > 1) {
        if (pageNum > 0) {
            paginationButtons.push(Markup.button.callback('⬅️ Назад', `report_dates_page_${objectIndex}_${pageNum - 1}`));
        }
        if (pageNum < totalPages - 1) {
            paginationButtons.push(Markup.button.callback('Вперед ➡️', `report_dates_page_${objectIndex}_${pageNum + 1}`));
        }
    }
    if (paginationButtons.length > 0) {
        buttons.push(paginationButtons);
    }
    buttons.push(...dateButtons);
    buttons.push([Markup.button.callback('↩️ Назад', 'view_reports')]);

    const message = await ctx.reply(
        `Выберите дату для объекта "${objectName}" (Страница ${pageNum + 1} из ${totalPages}):`,
        Markup.inlineKeyboard(buttons)
    );
    ctx.state.userStates[userId].messageIds.push(message.message_id);
    console.log(`[DEBUG] messageIds после добавления ${message.message_id}:`, ctx.state.userStates[userId].messageIds);
}

async function showReportTimestamps(ctx, objectIndex, dateIndex, page = 0) {
    const userId = ctx.from.id.toString();
    const reports = await loadUserReports(userId);

    const uniqueObjects = [...new Set(Object.values(reports).map(r => r.objectName))];
    const objectName = uniqueObjects[objectIndex];
    const objectReports = Object.entries(reports).filter(([_, r]) => r.objectName === objectName);

    const sortedReports = objectReports.sort((a, b) => a[1].timestamp.localeCompare(b[1].timestamp));
    const uniqueDates = [...new Set(sortedReports.map(([, r]) => parseAndFormatDate(r.date)))];
    const selectedDate = uniqueDates[dateIndex];

    await clearAllMessages(ctx, userId);

    const dateReports = sortedReports.filter(([_, r]) => parseAndFormatDate(r.date) === selectedDate);

    const itemsPerPage = 10;
    const totalPages = Math.ceil(dateReports.length / itemsPerPage);
    const pageNum = typeof page === 'number' ? page : 0;

    const startIndex = pageNum * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, dateReports.length);
    const currentReports = dateReports.slice(startIndex, endIndex);

    if (currentReports.length === 0) {
        console.log(`[showReportTimestamps] Нет отчетов для отображения на странице ${pageNum} для даты ${selectedDate}`);
        const message = await ctx.reply('Ошибка: нет отчетов для отображения.');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        return;
    }

    const timeButtons = currentReports.map(([reportId, report]) => {
        const time = new Date(report.timestamp).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' });
        return [Markup.button.callback(time, `select_report_time_${reportId}`)];
    }).reverse();

    const buttons = [];
    const paginationButtons = [];
    if (totalPages > 1) {
        if (pageNum > 0) {
            paginationButtons.push(Markup.button.callback('⬅️ Назад', `report_timestamps_page_${objectIndex}_${dateIndex}_${pageNum - 1}`));
        }
        if (pageNum < totalPages - 1) {
            paginationButtons.push(Markup.button.callback('Вперед ➡️', `report_timestamps_page_${objectIndex}_${dateIndex}_${pageNum + 1}`));
        }
    }
    if (paginationButtons.length > 0) {
        buttons.push(paginationButtons);
    }
    buttons.push(...timeButtons);
    buttons.push([Markup.button.callback('↩️ Назад', `select_report_object_${objectIndex}`)]);

    const message = await ctx.reply(
        `Выберите время отчета для "${objectName}" за ${selectedDate} (Страница ${pageNum + 1} из ${totalPages}):`,
        Markup.inlineKeyboard(buttons)
    );
    ctx.state.userStates[userId].messageIds.push(message.message_id);
    console.log(`[DEBUG] messageIds после добавления ${message.message_id}:`, ctx.state.userStates[userId].messageIds);
}

async function showReportDetails(ctx, reportId) {
    const userId = ctx.from.id.toString();
    const reports = await loadUserReports(userId);
    const report = reports[reportId];

    await clearAllMessages(ctx, userId);

    if (!report) {
        console.log(`[showReportDetails] Отчёт с ID ${reportId} не найден`);
        const message = await ctx.reply('Ошибка: отчёт не найден.');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        return;
    }

    const formattedDate = parseAndFormatDate(report.date);
    const time = new Date(report.timestamp).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' });
    const reportText = `
📅 ОТЧЕТ ЗА ${formattedDate}  
🏢 ${report.objectName}  
➖➖➖➖➖➖➖➖➖➖➖ 
👷 ${report.fullName}  

ВЫПОЛНЕННЫЕ РАБОТЫ:  
${report.workDone}  

ПОСТАВЛЕННЫЕ МАТЕРИАЛЫ:  
${report.materials}  
➖➖➖➖➖➖➖➖➖➖➖
Время: ${time}  
    `.trim();

    const uniqueObjects = [...new Set(Object.values(reports).map(r => r.objectName))];
    const uniqueDates = [...new Set(Object.values(reports).filter(r => r.objectName === report.objectName).map(r => parseAndFormatDate(r.date)))];
    const buttons = [
        [Markup.button.callback('✏️ Редактировать', `edit_report_${reportId}`)],
        [Markup.button.callback('↩️ Назад', `select_report_date_${uniqueObjects.indexOf(report.objectName)}_${uniqueDates.indexOf(formattedDate)}`)]
    ];

    if (report.photos && report.photos.length > 0) {
        await ctx.telegram.sendMediaGroup(ctx.chat.id, report.photos.map(photoId => ({ type: 'photo', media: photoId })));
    }
    const message = await ctx.reply(reportText, Markup.inlineKeyboard(buttons));
    ctx.state.userStates[userId].messageIds.push(message.message_id);
    console.log(`[DEBUG] messageIds после добавления ${message.message_id}:`, ctx.state.userStates[userId].messageIds);
}

async function editReport(ctx, reportId) {
    const userId = ctx.from.id.toString();
    const reports = await loadUserReports(userId);
    const report = reports[reportId];

    if (!report) {
        await clearAllMessages(ctx, userId);
        console.log(`[editReport] Ошибка: отчёт с ID ${reportId} не найден`);
        const message = await ctx.reply('Ошибка: не удалось найти отчёт для редактирования.');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        return;
    }

    await clearAllMessages(ctx, userId);

    ctx.state.userStates[userId] = {
        step: 'editWorkDone',
        report: { ...report, originalReportId: reportId },
        messageIds: ctx.state.userStates[userId].messageIds || []
    };
    const message = await ctx.reply('💡 Введите новую информацию о выполненных работах:');
    ctx.state.userStates[userId].messageIds.push(message.message_id);
    console.log(`[DEBUG] messageIds после добавления ${message.message_id}:`, ctx.state.userStates[userId].messageIds);
}

module.exports = (bot) => {
    bot.command('start', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (!ctx.state.userStates[userId]) {
            ctx.state.userStates[userId] = {
                step: null,
                selectedObjects: [],
                report: {},
                messageIds: [],
                lastReportMessageId: null
            };
        }

        await clearAllMessages(ctx, userId);
        const message = await ctx.reply(
            '🚀 ГЛАВНОЕ МЕНЮ \n➖➖➖➖➖➖➖➖➖➖➖  \nВыберите действие ниже:',
            Markup.inlineKeyboard([
                [Markup.button.callback('📝 Создать отчет', 'create_report')],
                [Markup.button.callback('📋 Мои отчеты', 'view_reports')],
                [Markup.button.callback('📤 Выгрузить отчет', 'download_report')],
                [Markup.button.callback('👤 Личный кабинет', 'profile')]
            ])
        );
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        console.log(`[DEBUG] messageIds после добавления ${message.message_id}:`, ctx.state.userStates[userId].messageIds);
    });

    bot.action('main_menu', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (!ctx.state.userStates[userId]) {
            ctx.state.userStates[userId] = {
                step: null,
                selectedObjects: [],
                report: {},
                messageIds: [],
                lastReportMessageId: null
            };
        }

        await clearAllMessages(ctx, userId);
        const message = await ctx.reply(
            '🚀 ГЛАВНОЕ МЕНЮ \n➖➖➖➖➖➖➖➖➖➖➖  \nВыберите действие ниже:',
            Markup.inlineKeyboard([
                [Markup.button.callback('📝 Создать отчет', 'create_report')],
                [Markup.button.callback('📋 Мои отчеты', 'view_reports')],
                [Markup.button.callback('📤 Выгрузить отчет', 'download_report')],
                [Markup.button.callback('👤 Личный кабинет', 'profile')]
            ])
        );
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        console.log(`[DEBUG] messageIds после добавления ${message.message_id}:`, ctx.state.userStates[userId].messageIds);
    });

    bot.action('download_report', async (ctx) => {
        await showDownloadReport(ctx, 0);
    });
    bot.action(/download_report_page_(\d+)/, async (ctx) => {
        const page = parseInt(ctx.match[1], 10);
        await showDownloadReport(ctx, page);
    });
    bot.action(/download_report_file_(\d+)/, (ctx) => downloadReportFile(ctx, parseInt(ctx.match[1], 10)));
    bot.action('create_report', createReport);
    bot.action(/select_object_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const objectIndex = parseInt(ctx.match[1], 10);
        const users = await loadUsers();
        const selectedObject = users[userId].selectedObjects[objectIndex];
        if (!selectedObject) return;

        await clearAllMessages(ctx, userId);

        ctx.state.userStates[userId] = {
            step: 'workDone',
            report: { objectName: selectedObject, photos: [] },
            messageIds: ctx.state.userStates[userId].messageIds || []
        };
        const message = await ctx.reply('💡 Введите информацию о выполненных работах:');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        console.log(`[DEBUG] messageIds после добавления ${message.message_id}:`, ctx.state.userStates[userId].messageIds);
    });

    bot.action('view_reports', showReportObjects);
    bot.action(/select_report_object_(\d+)/, (ctx) => showReportDates(ctx, parseInt(ctx.match[1], 10), 0));
    bot.action(/report_dates_page_(\d+)_(\d+)/, (ctx) => {
        const objectIndex = parseInt(ctx.match[1], 10);
        const page = parseInt(ctx.match[2], 10);
        showReportDates(ctx, objectIndex, page);
    });
    bot.action(/select_report_date_(\d+)_(\d+)/, (ctx) => {
        const objectIndex = parseInt(ctx.match[1], 10);
        const dateIndex = parseInt(ctx.match[2], 10);
        showReportTimestamps(ctx, objectIndex, dateIndex, 0);
    });
    bot.action(/report_timestamps_page_(\d+)_(\d+)_(\d+)/, (ctx) => {
        const objectIndex = parseInt(ctx.match[1], 10);
        const dateIndex = parseInt(ctx.match[2], 10);
        const page = parseInt(ctx.match[3], 10);
        showReportTimestamps(ctx, objectIndex, dateIndex, page);
    });
    bot.action(/select_report_time_(.+)/, (ctx) => showReportDetails(ctx, ctx.match[1]));
    bot.action(/edit_report_(.+)/, (ctx) => editReport(ctx, ctx.match[1]));
};