const { Markup } = require('telegraf');
const ExcelJS = require('exceljs');
const { loadUsers, saveUser } = require('../../database/userModel');
const { loadUserReports, loadAllReports } = require('../../database/reportModel');
const { ORGANIZATION_OBJECTS } = require('../../config/config');
const { clearPreviousMessages, formatDate, parseAndFormatDate } = require('../utils');

async function showDownloadReport(ctx, page = 0) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();

    if (!users[userId]?.isApproved) {
        console.log(`[showDownloadReport] Пользователь ${userId} не одобрен`);
        return ctx.reply('У вас нет прав для выгрузки отчетов.');
    }

    const userOrganization = users[userId].organization;
    const availableObjects = ORGANIZATION_OBJECTS[userOrganization] || [];

    if (!availableObjects.length) {
        console.log(`[showDownloadReport] Для организации ${userOrganization} нет доступных объектов`);
        return ctx.reply('Для вашей организации нет доступных объектов для выгрузки.');
    }

    const pageNum = typeof page === 'number' ? page : 0;
    await clearPreviousMessages(ctx, userId);

    const itemsPerPage = 10;
    const totalObjects = availableObjects.length;
    const totalPages = Math.ceil(totalObjects / itemsPerPage);

    const startIndex = pageNum * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalObjects);
    const currentObjects = availableObjects.slice(startIndex, endIndex);

    if (currentObjects.length === 0) {
        console.log(`[showDownloadReport] Нет объектов для отображения на странице ${pageNum}`);
        return ctx.reply('Ошибка: нет объектов для отображения.');
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
}

async function downloadReportFile(ctx, objectIndex) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const userOrganization = users[userId].organization;
    const availableObjects = ORGANIZATION_OBJECTS[userOrganization] || [];
    const objectName = availableObjects[objectIndex];

    if (!objectName) {
        console.log(`[downloadReportFile] Объект с индексом ${objectIndex} не найден для организации ${userOrganization}`);
        return ctx.reply('Ошибка: объект не найден.');
    }

    const allReports = await loadAllReports();
    const objectReports = Object.values(allReports).filter(report => report.objectName === objectName);

    if (objectReports.length === 0) {
        console.log(`[downloadReportFile] Отчеты для объекта "${objectName}" не найдены`);
        return ctx.reply(`Отчеты для объекта "${objectName}" не найдены.`);
    }

    await clearPreviousMessages(ctx, userId);

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
        return dateB.localeCompare(dateA); // Сравниваем как строки DD.MM.YYYY
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
        const itrText = `${user.position || 'Не указано'}\n${user.organization || 'Не указано'}\n${report.fullName || user.fullName || 'Не указано'}`;
        const photosText = report.photos && report.photos.length > 0 ? `${report.photos.length} фото` : 'Нет';
        const formattedDate = parseAndFormatDate(report.date); // Преобразуем дату в DD.MM.YYYY

        worksheet.getRow(currentRow).values = [
            formattedDate, // Используем преобразованную дату
            report.workDone,
            report.materials,
            itrText,
            photosText
        ];

        worksheet.getCell(`A${currentRow}`).style = centeredCellStyle;
        worksheet.getCell(`B${currentRow}`).style = paddedCellStyle;
        worksheet.getCell(`C${currentRow}`).style = paddedCellStyle;
        worksheet.getCell(`D${currentRow}`).style = centeredCellStyle;
        worksheet.getCell(`E${currentRow}`).style = centeredCellStyle;

        const maxLines = Math.max(
            report.workDone.split('\n').length,
            report.materials.split('\n').length,
            itrText.split('\n').length,
            photosText.split('\n').length
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
    const filename = `${objectName}_reports_${formatDate(new Date())}.xlsx`; // DD.MM.YYYY в имени файла

    await ctx.replyWithDocument({
        source: buffer,
        filename: filename
    });
    console.log(`[downloadReportFile] Excel-файл с отчетами для "${objectName}" отправлен пользователю ${userId}, отчетов: ${objectReports.length}`);
}

async function createReport(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    if (users[userId].position !== 'Производитель работ' || !users[userId].isApproved) {
        return ctx.reply('У вас нет прав для создания отчетов.');
    }

    await clearPreviousMessages(ctx, userId);

    const userObjects = users[userId].selectedObjects;
    if (!userObjects || userObjects.length === 0) {
        return ctx.reply('У вас не выбрано ни одного объекта в личном кабинете.');
    }

    const buttons = userObjects.map((obj, index) =>
        [Markup.button.callback(obj, `select_object_${index}`)]
    );
    buttons.push([Markup.button.callback('↩️ Вернуться в главное меню', 'main_menu')]);

    const message = await ctx.reply('Выберите объект из списка:', Markup.inlineKeyboard(buttons));
    ctx.state.userStates[userId].messageIds.push(message.message_id);
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
    const uniqueDates = [...new Set(objectReports.map(r => parseAndFormatDate(r.date)))]; // Преобразуем даты
    const buttons = uniqueDates.map((date, index) =>
        [Markup.button.callback(date, `select_report_date_${objectIndex}_${index}`)]
    );
    buttons.push([Markup.button.callback('↩️ Назад', `select_report_object_${objectIndex}`)]);

    await ctx.reply(`Выберите дату для объекта "${objectName}":`, Markup.inlineKeyboard(buttons));
}

async function showReportTimestamps(ctx, objectIndex, dateIndex) {
    const userId = ctx.from.id.toString();
    const reports = await loadUserReports(userId);

    const uniqueObjects = [...new Set(Object.values(reports).map(r => r.objectName))];
    const objectName = uniqueObjects[objectIndex];
    const objectReports = Object.entries(reports).filter(([_, r]) => r.objectName === objectName);
    const uniqueDates = [...new Set(objectReports.map(([, r]) => parseAndFormatDate(r.date)))];
    const selectedDate = uniqueDates[dateIndex];

    await clearPreviousMessages(ctx, userId);

    const dateReports = objectReports.filter(([_, r]) => parseAndFormatDate(r.date) === selectedDate);
    const buttons = dateReports.map(([reportId, report]) => {
        const time = new Date(report.timestamp).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' });
        return [Markup.button.callback(time, `select_report_time_${reportId}`)];
    });
    buttons.push([Markup.button.callback('↩️ Назад', `select_report_object_${objectIndex}`)]);

    await ctx.reply(`Выберите время отчета для "${objectName}" за ${selectedDate}:`, Markup.inlineKeyboard(buttons));
}

async function showReportDetails(ctx, reportId) {
    const userId = ctx.from.id.toString();
    const reports = await loadUserReports(userId);
    const report = reports[reportId];

    await clearPreviousMessages(ctx, userId);

    if (!report) {
        console.log(`[showReportDetails] Отчёт с ID ${reportId} не найден`);
        return ctx.reply('Ошибка: отчёт не найден.');
    }

    const formattedDate = parseAndFormatDate(report.date); // Преобразуем дату в DD.MM.YYYY
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
    await ctx.reply(reportText, Markup.inlineKeyboard(buttons));
}

async function editReport(ctx, reportId) {
    const userId = ctx.from.id.toString();
    const reports = await loadUserReports(userId);
    const report = reports[reportId];

    if (!report) {
        await clearPreviousMessages(ctx, userId);
        console.log(`[editReport] Ошибка: отчёт с ID ${reportId} не найден`);
        return ctx.reply('Ошибка: не удалось найти отчёт для редактирования.');
    }

    await clearPreviousMessages(ctx, userId);

    ctx.state.userStates[userId] = {
        step: 'editWorkDone',
        report: { ...report, originalReportId: reportId },
        messageIds: ctx.state.userStates[userId].messageIds || []
    };
    await ctx.reply('💡 Введите новую информацию о выполненных работах:');
}

module.exports = (bot) => {
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

        await clearPreviousMessages(ctx, userId);

        ctx.state.userStates[userId] = {
            step: 'workDone',
            report: { objectName: selectedObject, photos: [] },
            messageIds: ctx.state.userStates[userId].messageIds || []
        };
        await ctx.reply('💡 Введите информацию о выполненных работах:');
    });

    bot.action('view_reports', showReportObjects);
    bot.action(/select_report_object_(\d+)/, (ctx) => showReportDates(ctx, parseInt(ctx.match[1], 10)));
    bot.action(/select_report_date_(\d+)_(\d+)/, (ctx) => showReportTimestamps(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10)));
    bot.action(/select_report_time_(.+)/, (ctx) => showReportDetails(ctx, ctx.match[1]));
    bot.action(/edit_report_(.+)/, (ctx) => editReport(ctx, ctx.match[1]));
};