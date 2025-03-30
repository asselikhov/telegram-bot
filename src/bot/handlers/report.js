const { Markup } = require('telegraf');
const ExcelJS = require('exceljs');
const { loadUsers, saveUser } = require('../../database/userModel');
const { loadUserReports, saveReport, getReportText, loadAllReports } = require('../../database/reportModel');
const { OBJECTS_LIST_CYRILLIC, OBJECT_GROUPS, GENERAL_GROUP_CHAT_ID } = require('../../config/config');
const { clearPreviousMessages } = require('../utils');

async function showDownloadReport(ctx, page = 0) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();

    if (!users[userId]?.isApproved) {
        console.log(`[showDownloadReport] Пользователь ${userId} не одобрен`);
        return ctx.reply('У вас нет прав для выгрузки отчетов.');
    }

    console.log(`[showDownloadReport] Загружены пользователи для userId ${userId}:`, users[userId]);
    console.log(`[showDownloadReport] OBJECTS_LIST_CYRILLIC:`, OBJECTS_LIST_CYRILLIC);

    const pageNum = typeof page === 'number' ? page : 0;
    console.log(`[showDownloadReport] Используемая страница: ${pageNum}`);

    await clearPreviousMessages(ctx, userId);

    if (!OBJECTS_LIST_CYRILLIC || OBJECTS_LIST_CYRILLIC.length === 0) {
        console.log(`[showDownloadReport] OBJECTS_LIST_CYRILLIC пуст или не определён`);
        return ctx.reply('Список объектов пуст. Обратитесь к администратору.');
    }

    const itemsPerPage = 10;
    const totalObjects = OBJECTS_LIST_CYRILLIC.length;
    const totalPages = Math.ceil(totalObjects / itemsPerPage);

    const startIndex = pageNum * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalObjects);
    const currentObjects = OBJECTS_LIST_CYRILLIC.slice(startIndex, endIndex);

    console.log(`[showDownloadReport] Страница ${pageNum}: startIndex=${startIndex}, endIndex=${endIndex}, currentObjects=`, currentObjects);

    if (currentObjects.length === 0) {
        console.log(`[showDownloadReport] Нет объектов для отображения на странице ${pageNum}`);
        return ctx.reply('Ошибка: нет объектов для отображения.');
    }

    const buttons = currentObjects.map((obj, index) =>
        [Markup.button.callback(obj, `download_report_file_${startIndex + index}`)]
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

    console.log(`[showDownloadReport] Кнопки для страницы ${pageNum}:`, buttons);

    const message = await ctx.reply(
        `Выберите объект для выгрузки отчета (Страница ${pageNum + 1} из ${totalPages}):`,
        Markup.inlineKeyboard(buttons)
    );
    ctx.state.userStates[userId].messageIds.push(message.message_id);
    console.log(`[showDownloadReport] Отправлено сообщение с ID ${message.message_id} для userId ${userId}`);
}

async function downloadReportFile(ctx, objectIndex) {
    const userId = ctx.from.id.toString();
    const objectName = OBJECTS_LIST_CYRILLIC[objectIndex];
    if (!objectName) {
        console.log(`[downloadReportFile] Объект с индексом ${objectIndex} не найден в OBJECTS_LIST_CYRILLIC`);
        return ctx.reply('Ошибка: объект не найден.');
    }

    const allReports = await loadAllReports();
    console.log(`[downloadReportFile] Все отчеты из базы данных:`, allReports);

    const objectReports = Object.values(allReports).filter(report => report.objectName === objectName);
    console.log(`[downloadReportFile] Найдено отчетов для объекта "${objectName}": ${objectReports.length}`, objectReports);

    if (objectReports.length === 0) {
        console.log(`[downloadReportFile] Отчеты для объекта "${objectName}" не найдены`);
        return ctx.reply(`Отчеты для объекта "${objectName}" не найдены.`);
    }

    await clearPreviousMessages(ctx, userId);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Отчеты');

    // Стили
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
    const cellStyle = {
        font: { name: 'Arial', size: 9 },
        alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
        border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    };

    // Заголовок с наименованием объекта
    worksheet.mergeCells('A1:D1');
    worksheet.getCell('A1').value = objectName;
    worksheet.getCell('A1').style = titleStyle;

    // Заголовки столбцов (начиная со второй строки)
    worksheet.getRow(2).values = ['Дата', 'ИТР', 'Выполненные работы', 'Поставленные материалы'];
    worksheet.getRow(2).eachCell(cell => { cell.style = headerStyle; });
    worksheet.columns = [
        { key: 'date', width: 12 },
        { key: 'itr', width: 30 },
        { key: 'workDone', width: 40 },
        { key: 'materials', width: 40 }
    ];

    // Сортировка отчетов по дате и userId для правильного объединения
    objectReports.sort((a, b) => {
        if (a.date === b.date) return a.userId.localeCompare(b.userId);
        return a.date.localeCompare(b.date);
    });

    const users = await loadUsers();
    let currentRow = 3; // Начинаем с 3-й строки после заголовков
    let lastDate = null;
    let lastUserId = null;
    let dateStartRow = null;
    let itrStartRow = null;
    let dateCount = 0;
    let itrCount = 0;

    objectReports.forEach((report, index) => {
        const user = users[report.userId] || {};
        const itrText = `${user.position || 'Не указано'} ${user.organization || 'Не указано'} ${report.fullName || user.fullName || 'Не указано'}`;

        // Заполняем строку данными
        worksheet.getRow(currentRow).values = [
            report.date,
            itrText,
            report.workDone,
            report.materials
        ];
        worksheet.getRow(currentRow).eachCell(cell => { cell.style = cellStyle; });

        // Логика объединения ячеек для даты
        if (lastDate !== report.date) {
            if (dateCount > 1) {
                worksheet.mergeCells(`A${dateStartRow}:A${currentRow - 1}`);
            }
            lastDate = report.date;
            dateStartRow = currentRow;
            dateCount = 1;
        } else {
            dateCount++;
        }

        // Логика объединения ячеек для ИТР
        if (lastUserId !== report.userId || lastDate !== report.date) {
            if (itrCount > 1) {
                worksheet.mergeCells(`B${itrStartRow}:B${currentRow - 1}`);
            }
            lastUserId = report.userId;
            itrStartRow = currentRow;
            itrCount = 1;
        } else {
            itrCount++;
        }

        // Устанавливаем высоту строки
        const maxLines = Math.max(
            report.workDone.split('\n').length,
            report.materials.split('\n').length
        );
        worksheet.getRow(currentRow).height = Math.max(15, maxLines * 12);

        currentRow++;
    });

    // Объединяем последние группы, если они больше одной строки
    if (dateCount > 1) {
        worksheet.mergeCells(`A${dateStartRow}:A${currentRow - 1}`);
    }
    if (itrCount > 1) {
        worksheet.mergeCells(`B${itrStartRow}:B${currentRow - 1}`);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `${objectName}_reports_${new Date().toISOString().split('T')[0]}.xlsx`;

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
    console.log(`[showReportTimestamps] Отчёты для userId ${userId}:`, reports);

    const uniqueObjects = [...new Set(Object.values(reports).map(r => r.objectName))];
    const objectName = uniqueObjects[objectIndex];
    const objectReports = Object.entries(reports).filter(([_, r]) => r.objectName === objectName);
    const uniqueDates = [...new Set(objectReports.map(([, r]) => r.date))];
    const selectedDate = uniqueDates[dateIndex];

    await clearPreviousMessages(ctx, userId);

    const dateReports = objectReports.filter(([_, r]) => r.date === selectedDate);
    console.log(`[showReportTimestamps] Отчёты для "${objectName}" за ${selectedDate}:`, dateReports);

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
    console.log(`[showReportDetails] Отчёты для userId ${userId}:`, reports);
    console.log(`[showReportDetails] Поиск отчёта с reportId ${reportId}`);

    const report = reports[reportId];

    await clearPreviousMessages(ctx, userId);

    if (!report) {
        console.log(`[showReportDetails] Отчёт с ID ${reportId} не найден`);
        return ctx.reply('Ошибка: отчёт не найден.');
    }

    const reportText = `
📅 ОТЧЕТ ЗА ${report.date}  
🏢 ${report.objectName}  
➖➖➖➖➖➖➖➖➖➖➖ 
👷 ${report.fullName}  

ВЫПОЛНЕННЫЕ РАБОТЫ:  
${report.workDone}  

ПОСТАВЛЕННЫЕ МАТЕРИАЛЫ:  
${report.materials}  
➖➖➖➖➖➖➖➖➖➖➖
Время: ${new Date(report.timestamp).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}  
    `.trim();

    const uniqueObjects = [...new Set(Object.values(reports).map(r => r.objectName))];
    const uniqueDates = [...new Set(Object.values(reports).filter(r => r.objectName === report.objectName).map(r => r.date))];
    const buttons = [
        [Markup.button.callback('✏️ Редактировать', `edit_report_${reportId}`)],
        [Markup.button.callback('↩️ Назад', `select_report_date_${uniqueObjects.indexOf(report.objectName)}_${uniqueDates.indexOf(report.date)}`)]
    ];

    await ctx.reply(reportText, Markup.inlineKeyboard(buttons));
}

async function editReport(ctx, reportId) {
    const userId = ctx.from.id.toString();
    const reports = await loadUserReports(userId);
    console.log(`[editReport] Отчёты для userId ${userId}:`, reports);
    console.log(`[editReport] Поиск отчёта с reportId ${reportId}:`, reports[reportId]);

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
    console.log(`[editReport] Состояние установлено для userId ${userId}:`, ctx.state.userStates[userId]);
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

        const client = await require('../../database/db').pool.connect();
        try {
            await client.query('DELETE FROM reports WHERE reportId = $1', [originalReportId]);
        } finally {
            client.release();
        }
    } else {
        console.log(`Предупреждение: старый отчёт с ID ${originalReportId} не найден для userId ${userId}`);
    }

    const groupMessage = await ctx.telegram.sendMessage(groupChatId, reportText);
    const generalMessage = await ctx.telegram.sendMessage(GENERAL_GROUP_CHAT_ID, reportText);

    newReport.groupMessageId = groupMessage.message_id;
    newReport.generalMessageId = generalMessage.message_id;

    await saveReport(userId, newReport);
    await saveUser(userId, users[userId]);

    await clearPreviousMessages(ctx, userId);

    await ctx.reply(`✅ Ваш отчёт обновлён:\n\n${reportText}`, Markup.inlineKeyboard([
        [Markup.button.callback('↩️ Вернуться в личный кабинет', 'profile')]
    ]));
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
            report: { objectName: selectedObject },
            messageIds: ctx.state.userStates[userId].messageIds || []
        };
        await ctx.reply('💡 Введите информацию о выполненных работах:');
    });

    bot.action('view_reports', showReportObjects);
    bot.action(/select_report_object_(\d+)/, (ctx) => showReportDates(ctx, parseInt(ctx.match[1], 10)));
    bot.action(/select_report_date_(\d+)_(\d+)/, (ctx) => showReportTimestamps(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10)));
    bot.action(/select_report_time_(.+)/, (ctx) => showReportDetails(ctx, ctx.match[1]));
    bot.action(/edit_report_(.+)/, (ctx) => editReport(ctx, ctx.match[1]));

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state.userStates[userId];
        console.log(`Получен текст от userId ${userId}: "${ctx.message.text}". Текущее состояние:`, state);

        if (!state || !['workDone', 'materials', 'editWorkDone', 'editMaterials', 'editFullName'].includes(state.step)) {
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