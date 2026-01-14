const { Markup } = require('telegraf');
const ExcelJS = require('exceljs');
const { loadUsers, saveUser } = require('../../database/userModel');
const { loadUserReports, loadAllReports, saveReport } = require('../../database/reportModel');
const { clearPreviousMessages, formatDate, parseAndFormatDate } = require('../utils');
const { getOrganizationObjects, getObjects, getObjectGroups, getGeneralGroupChatIds, getAllOrganizationObjectsMap, getReportUsers, getAllReportUsersMap, getAllNeedUsersMap } = require('../../database/configService');
const { addMessageId } = require('../utils/stateHelper');
const { escapeHtml } = require('../utils/htmlHelper');

async function showReportsMenu(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId] || {};

    await clearPreviousMessages(ctx, userId);

    const buttons = [];

    // Показываем кнопку "Создать отчет" всем пользователям с выбранными объектами
    if (user.organization && user.selectedObjects && user.selectedObjects.length > 0) {
        buttons.push([Markup.button.callback('📝 Создать отчет', 'create_report')]);
    }

    buttons.push([Markup.button.callback('📋 Мои отчеты', 'view_reports')]);

    if (user.isApproved) {
        buttons.push([Markup.button.callback('📤 Выгрузить отчеты', 'download_reports')]);
    }

    buttons.push([Markup.button.callback('↩️ Назад', 'main_menu')]);

    const menuText = `
📋 ОТЧЕТЫ
➖➖➖➖➖➖➖➖➖➖➖
    `.trim();

    const message = await ctx.reply(menuText, Markup.inlineKeyboard(buttons));
    addMessageId(ctx, message.message_id);
}

async function showDownloadReport(ctx, page = 0) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();

    if (!users[userId]?.isApproved) {
        return ctx.reply('У вас нет прав для выгрузки отчетов.');
    }

    // Показываем только объекты организации пользователя
    if (!users[userId]) {
        return ctx.reply('Ошибка: пользователь не найден в базе данных.');
    }
    const userOrganization = users[userId].organization;
    const availableObjects = await getOrganizationObjects(userOrganization);

    if (!availableObjects.length) {
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
        return ctx.reply('Ошибка: нет объектов для отображения.');
    }

    const buttons = currentObjects.map((obj, index) =>
        [Markup.button.callback(obj, `download_report_file_${availableObjects.indexOf(obj)}`)]
    );

    const paginationButtons = [];
    if (totalPages > 1) {
        if (pageNum > 0) paginationButtons.push(Markup.button.callback('⬅️ Назад', `download_report_page_${pageNum - 1}`));
        if (pageNum < totalPages - 1) paginationButtons.push(Markup.button.callback('Вперед ➡️', `download_report_page_${pageNum + 1}`));
    }
    if (paginationButtons.length > 0) buttons.push(paginationButtons);
        buttons.push([Markup.button.callback('↩️ Назад', 'reports_menu')]);

    const message = await ctx.reply(
        `Выберите объект для выгрузки отчета (Страница ${pageNum + 1} из ${totalPages}):`,
        Markup.inlineKeyboard(buttons)
    );
    addMessageId(ctx, message.message_id);
}

function parseDateFromDDMMYYYY(dateString) {
    const [day, month, year] = dateString.split('.').map(Number);
    return new Date(year, month - 1, day);
}

async function downloadReportFile(ctx, objectIndex) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    
    // Получаем объект из списка объектов организации пользователя
    if (!users[userId]) {
        return ctx.reply('Ошибка: пользователь не найден в базе данных.');
    }
    const userOrganization = users[userId].organization;
    const availableObjects = await getOrganizationObjects(userOrganization);
    const objectName = availableObjects[objectIndex];

    if (!objectName) {
        return ctx.reply('Ошибка: объект не найден.');
    }

    // Фильтруем отчеты только по названию объекта (независимо от организации)
    const allReports = await loadAllReports();
    const normalizedObjectName = objectName.trim();
    const objectReports = Object.values(allReports).filter(report => {
        if (!report.objectName) return false;
        const normalizedReportObjectName = report.objectName.trim();
        return normalizedReportObjectName === normalizedObjectName;
    });

    if (objectReports.length === 0) {
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
        alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
        border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    };

    worksheet.mergeCells('A1:E1');
    worksheet.getCell('A1').value = objectName;
    worksheet.getCell('A1').style = titleStyle;

    const headerRow = worksheet.getRow(2);
    headerRow.values = ['Дата', 'Выполненные работы', 'Поставленные материалы', 'ИТР', 'Изображения'];
    headerRow.eachCell(cell => { cell.style = headerStyle; });
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

        const dateCompare = dateObjB.getTime() - dateObjA.getTime();
        if (dateCompare === 0) {
            return b.timestamp.localeCompare(a.timestamp);
        }
        return dateCompare;
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

        worksheet.getRow(currentRow).values = [formattedDate, report.workDone, report.materials, itrText, photosCount];

        worksheet.getCell(`A${currentRow}`).style = centeredCellStyle;
        worksheet.getCell(`B${currentRow}`).style = paddedCellStyle;
        worksheet.getCell(`C${currentRow}`).style = paddedCellStyle;
        worksheet.getCell(`D${currentRow}`).style = centeredCellStyle;

        const photosCell = worksheet.getCell(`E${currentRow}`);
        if (report.photos && report.photos.length > 0 && report.messageLink) {
            photosCell.value = { text: photosCount, hyperlink: report.messageLink };
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
            if (dateCount > 1) worksheet.mergeCells(`A${dateStartRow}:A${currentRow}`);
            if (itrCount > 1) worksheet.mergeCells(`D${itrStartRow}:D${currentRow}`);
        }

        currentRow++;
    }

    // Настройка ширины колонок по содержимому с ограничением до 40
    worksheet.columns.forEach((column) => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: false }, (cell) => {
            const cellValue = cell.value ? cell.value.toString() : '';
            const cellLength = cellValue.length;
            if (cellLength > maxLength) {
                maxLength = cellLength;
            }
        });
        // Устанавливаем ширину = длина + минимальный отступ (1), но не менее 10 и не более 40
        column.width = Math.max(10, Math.min(maxLength + 1, 40));
    });

    // Устанавливаем высоту строки заголовка
    headerRow.height = 20;

    // Замораживаем строку заголовка (строка 2)
    worksheet.views = [{ state: 'frozen', ySplit: 2 }];

    // Добавляем автофильтры
    worksheet.autoFilter = 'A2:E2';

    // Настройки печати
    worksheet.pageSetup = {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        printTitlesRow: '2:2',
        margins: {
            left: 0.7,
            right: 0.7,
            top: 0.75,
            bottom: 0.75,
            header: 0.3,
            footer: 0.3
        }
    };

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `${objectName}_reports_${formatDate(new Date())}.xlsx`;

    const documentMessage = await ctx.replyWithDocument({ source: buffer, filename });
    ctx.state.userStates[userId].messageIds.push(documentMessage.message_id);
}

async function showDownloadUsers(ctx, page = 0) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();

    if (!users[userId]?.isApproved) {
        return ctx.reply('У вас нет прав для выгрузки данных.');
    }

    // Показываем только объекты организации пользователя
    if (!users[userId]) {
        return ctx.reply('Ошибка: пользователь не найден в базе данных.');
    }
    const userOrganization = users[userId].organization;
    const availableObjects = await getOrganizationObjects(userOrganization);

    if (!availableObjects.length) {
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
        return ctx.reply('Ошибка: нет объектов для отображения.');
    }

    const buttons = currentObjects.map((obj, index) =>
        [Markup.button.callback(obj, `download_users_file_${availableObjects.indexOf(obj)}`)]
    );

    const paginationButtons = [];
    if (totalPages > 1) {
        if (pageNum > 0) paginationButtons.push(Markup.button.callback('⬅️ Назад', `download_users_page_${pageNum - 1}`));
        if (pageNum < totalPages - 1) paginationButtons.push(Markup.button.callback('Вперед ➡️', `download_users_page_${pageNum + 1}`));
    }
    if (paginationButtons.length > 0) buttons.push(paginationButtons);
    buttons.push([Markup.button.callback('↩️ Назад', 'profile')]);

    const message = await ctx.reply(
        `Выберите объект для выгрузки людей (Страница ${pageNum + 1} из ${totalPages}):`,
        Markup.inlineKeyboard(buttons)
    );
    addMessageId(ctx, message.message_id);
}

async function downloadUsersFile(ctx, objectIndex) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();

    // Получаем объект из списка объектов организации пользователя
    if (!users[userId]) {
        return ctx.reply('Ошибка: пользователь не найден в базе данных.');
    }
    const userOrganization = users[userId].organization;
    const availableObjects = await getOrganizationObjects(userOrganization);
    const objectName = availableObjects[objectIndex];

    if (!objectName) {
        return ctx.reply('Ошибка: объект не найден.');
    }

    // Получаем всех пользователей, у которых выбранный объект есть в selectedObjects (независимо от организации)
    // Используем нормализованное сравнение названий объектов
    const normalizedObjectName = objectName.trim();
    const allUsers = await loadUsers();
    const objectUsers = Object.entries(allUsers).filter(([_, user]) => {
        if (!Array.isArray(user.selectedObjects)) return false;
        return user.selectedObjects.some(obj => obj && obj.trim() === normalizedObjectName);
    });

    if (objectUsers.length === 0) {
        return ctx.reply(`Пользователи для объекта "${objectName}" не найдены.`);
    }

    await clearPreviousMessages(ctx, userId);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Люди');

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
        alignment: { horizontal: 'left', vertical: 'middle', wrapText: true },
        border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    };

    // Получаем карты ответственных пользователей для отчетов и потребностей
    const reportUsersMap = await getAllReportUsersMap();
    const needUsersMap = await getAllNeedUsersMap();
    
    // Функция для определения ответственности пользователя
    const getUserResponsibilities = (userId, user) => {
        if (!user.organization || !user.selectedObjects || user.selectedObjects.length === 0) {
            return '-';
        }
        
        const orgName = user.organization;
        const userObjects = Array.isArray(user.selectedObjects) ? user.selectedObjects : [];
        
        let isReportUser = false;
        let isNeedUser = false;
        
        // Проверяем для каждого объекта пользователя
        for (const objName of userObjects) {
            const reportKey = `${orgName}_${objName}`;
            const needKey = `${orgName}_${objName}`;
            
            if (reportUsersMap[reportKey] && reportUsersMap[reportKey].includes(userId)) {
                isReportUser = true;
            }
            if (needUsersMap[needKey] && needUsersMap[needKey].includes(userId)) {
                isNeedUser = true;
            }
        }
        
        if (isReportUser && isNeedUser) {
            return 'Отчеты, потребности';
        } else if (isReportUser) {
            return 'Отчеты';
        } else if (isNeedUser) {
            return 'Потребности';
        }
        
        return '-';
    };

    // Заголовок
    worksheet.mergeCells('A1:G1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = objectName;
    titleCell.style = titleStyle;

    // Заголовки колонок
    const headerRow = worksheet.getRow(2);
    headerRow.values = ['Должность', 'Организация', 'ФИО', 'Контактный телефон', 'Дата рождения', 'Ответственный', 'Статус'];
    headerRow.eachCell((cell, colNumber) => {
        cell.style = headerStyle;
    });

    // Определяем колонки (нужно для вычисления ширины)
    worksheet.columns = [
        { key: 'position', width: 10 },
        { key: 'organization', width: 10 },
        { key: 'fullName', width: 10 },
        { key: 'phone', width: 10 },
        { key: 'birthdate', width: 10 },
        { key: 'responsible', width: 10 },
        { key: 'status', width: 10 }
    ];

    // Данные
    let currentRow = 3;
    for (const [uid, user] of objectUsers) {
        const responsible = getUserResponsibilities(uid, user);
        const row = worksheet.getRow(currentRow);
        row.values = [
            user.position || 'Не указано',
            user.organization || 'Не указано',
            user.fullName || 'Не указано',
            user.phone || 'Не указано',
            user.birthdate || 'Не указано',
            responsible,
            user.status || 'Не указан'
        ];
        
        // Применяем стили
        row.eachCell((cell) => {
            cell.style = centeredCellStyle;
        });
        
        currentRow++;
    }

    // Настройка ширины колонок по содержимому с ограничением до 40
    worksheet.columns.forEach((column) => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: false }, (cell) => {
            const cellValue = cell.value ? cell.value.toString() : '';
            const cellLength = cellValue.length;
            if (cellLength > maxLength) {
                maxLength = cellLength;
            }
        });
        // Устанавливаем ширину = длина + минимальный отступ (1), но не менее 10 и не более 40
        column.width = Math.max(10, Math.min(maxLength + 1, 40));
    });

    // Устанавливаем высоту строки заголовка
    headerRow.height = 20;

    // Замораживаем строку заголовка (строка 2)
    worksheet.views = [{ state: 'frozen', ySplit: 2 }];

    // Добавляем автофильтры
    worksheet.autoFilter = 'A2:G2';

    // Настройки печати
    worksheet.pageSetup = {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        printTitlesRow: '2:2',
        margins: {
            left: 0.7,
            right: 0.7,
            top: 0.75,
            bottom: 0.75,
            header: 0.3,
            footer: 0.3
        }
    };

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `${objectName}_users_${formatDate(new Date())}.xlsx`;

    const documentMessage = await ctx.replyWithDocument({ source: buffer, filename });
    ctx.state.userStates[userId].messageIds.push(documentMessage.message_id);
}

async function createReport(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId];
    
    if (!user) {
        return ctx.reply('У вас нет прав для создания отчетов.');
    }

    await clearPreviousMessages(ctx, userId);

    const userObjects = user.selectedObjects;
    if (!userObjects || userObjects.length === 0) {
        return ctx.reply('У вас не выбрано ни одного объекта в личном кабинете.');
    }

    const buttons = userObjects.map((obj, index) => [Markup.button.callback(obj, `select_object_${index}`)]);
    buttons.push([Markup.button.callback('↩️ Назад', 'reports_menu')]);

    const message = await ctx.reply('Выберите объект из списка:', Markup.inlineKeyboard(buttons));
    addMessageId(ctx, message.message_id);
}

async function showReportObjects(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const reports = await loadUserReports(userId).catch(err => {
        return {};
    });

    await clearPreviousMessages(ctx, userId);

    if (Object.keys(reports).length === 0) {
        const message = await ctx.reply('У вас пока нет отчетов.');
        addMessageId(ctx, message.message_id);
        return;
    }

    const uniqueObjects = [...new Set(Object.values(reports).map(r => r.objectName))];
    const buttons = uniqueObjects.map((obj, index) => [Markup.button.callback(obj, `select_report_object_${index}`)]);
    buttons.push([Markup.button.callback('↩️ Назад', 'reports_menu')]);

    const message = await ctx.reply('Выберите объект для просмотра отчетов:', Markup.inlineKeyboard(buttons));
    addMessageId(ctx, message.message_id);
}

async function showReportDates(ctx, objectIndex, page = 0) {
    const userId = ctx.from.id.toString();
    const reports = await loadUserReports(userId);
    const uniqueObjects = [...new Set(Object.values(reports).map(r => r.objectName))];
    const objectName = uniqueObjects[objectIndex];

    await clearPreviousMessages(ctx, userId);

    // Нормализуем названия объектов для сравнения (убираем пробелы в начале и конце)
    const normalizedObjectName = objectName && objectName.trim();
    const objectReports = Object.values(reports).filter(r => 
        r.objectName && r.objectName.trim() === normalizedObjectName
    );
    const sortedReports = objectReports.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const uniqueDates = [...new Set(sortedReports.map(r => parseAndFormatDate(r.date)))];

    const itemsPerPage = 10;
    const totalPages = Math.ceil(uniqueDates.length / itemsPerPage);
    const pageNum = typeof page === 'number' ? page : 0;

    const startIndex = pageNum * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, uniqueDates.length);
    const currentDates = uniqueDates.slice(startIndex, endIndex);

    if (currentDates.length === 0) {
        return ctx.reply('Ошибка: нет дат для отображения.');
    }

    const dateButtons = currentDates.map((date, index) =>
        [Markup.button.callback(date, `select_report_date_${objectIndex}_${startIndex + index}`)]
    ).reverse();

    const buttons = [];
    const paginationButtons = [];
    if (totalPages > 1) {
        if (pageNum > 0) paginationButtons.push(Markup.button.callback('⬅️ Назад', `report_dates_page_${objectIndex}_${pageNum - 1}`));
        if (pageNum < totalPages - 1) paginationButtons.push(Markup.button.callback('Вперед ➡️', `report_dates_page_${objectIndex}_${pageNum + 1}`));
    }
    if (paginationButtons.length > 0) buttons.push(paginationButtons);
    buttons.push(...dateButtons);
    buttons.push([Markup.button.callback('↩️ Назад', 'view_reports')]);

    const message = await ctx.reply(
        `Выберите дату для объекта "${objectName}" (Страница ${pageNum + 1} из ${totalPages}):`,
        Markup.inlineKeyboard(buttons)
    );
    addMessageId(ctx, message.message_id);
}

async function showReportTimestamps(ctx, objectIndex, dateIndex, page = 0) {
    const userId = ctx.from.id.toString();
    const reports = await loadUserReports(userId);
    const uniqueObjects = [...new Set(Object.values(reports).map(r => r.objectName))];
    const objectName = uniqueObjects[objectIndex];
    // Нормализуем названия объектов для сравнения (убираем пробелы в начале и конце)
    const normalizedObjectName = objectName && objectName.trim();
    const objectReports = Object.entries(reports).filter(([_, r]) => 
        r.objectName && r.objectName.trim() === normalizedObjectName
    );

    const sortedReports = objectReports.sort((a, b) => a[1].timestamp.localeCompare(b[1].timestamp));
    const uniqueDates = [...new Set(sortedReports.map(([, r]) => parseAndFormatDate(r.date)))];
    const selectedDate = uniqueDates[dateIndex];

    await clearPreviousMessages(ctx, userId);

    const dateReports = sortedReports.filter(([_, r]) => parseAndFormatDate(r.date) === selectedDate);

    const itemsPerPage = 10;
    const totalPages = Math.ceil(dateReports.length / itemsPerPage);
    const pageNum = typeof page === 'number' ? page : 0;

    const startIndex = pageNum * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, dateReports.length);
    const currentReports = dateReports.slice(startIndex, endIndex);

    if (currentReports.length === 0) {
        return ctx.reply('Ошибка: нет отчетов для отображения.');
    }

    const timeButtons = currentReports.map(([reportId, report]) => {
        const time = new Date(report.timestamp).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' });
        return [Markup.button.callback(time, `select_report_time_${reportId}`)];
    }).reverse();

    const buttons = [];
    const paginationButtons = [];
    if (totalPages > 1) {
        if (pageNum > 0) paginationButtons.push(Markup.button.callback('⬅️ Назад', `report_timestamps_page_${objectIndex}_${dateIndex}_${pageNum - 1}`));
        if (pageNum < totalPages - 1) paginationButtons.push(Markup.button.callback('Вперед ➡️', `report_timestamps_page_${objectIndex}_${dateIndex}_${pageNum + 1}`));
    }
    if (paginationButtons.length > 0) buttons.push(paginationButtons);
    buttons.push(...timeButtons);
    buttons.push([Markup.button.callback('↩️ Назад', `select_report_object_${objectIndex}`)]);

    const message = await ctx.reply(
        `Выберите время отчета для "${objectName}" за ${selectedDate} (Страница ${pageNum + 1} из ${totalPages}):`,
        Markup.inlineKeyboard(buttons)
    );
    addMessageId(ctx, message.message_id);
}

async function showReportDetails(ctx, reportId) {
    const userId = ctx.from.id.toString();
    const reports = await loadUserReports(userId);
    const report = reports[reportId];

    await clearPreviousMessages(ctx, userId);

    if (!report) {
        return ctx.reply('Ошибка: отчёт не найден.');
    }

    const formattedDate = parseAndFormatDate(report.date);
    const time = new Date(report.timestamp).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' });
    const reportText = `
📅 ОТЧЕТ ЗА ${formattedDate}  
🏢 ${escapeHtml(report.objectName)}
👷 ${escapeHtml(report.fullName)}

<blockquote><b>ВЫПОЛНЕННЫЕ РАБОТЫ:</b>
${escapeHtml(report.workDone)}</blockquote>
<blockquote><b>ПОСТАВЛЕННЫЕ МАТЕРИАЛЫ:</b>
${escapeHtml(report.materials)}</blockquote>
Время: ${time}  
    `.trim();

    const uniqueObjects = [...new Set(Object.values(reports).map(r => r.objectName))];
    // Нормализуем названия объектов для сравнения
    const normalizedReportObjectName = report.objectName && report.objectName.trim();
    const uniqueDates = [...new Set(Object.values(reports).filter(r => 
        r.objectName && r.objectName.trim() === normalizedReportObjectName
    ).map(r => parseAndFormatDate(r.date)))];
    const buttons = [
        [Markup.button.callback('✏️ Редактировать', `edit_report_${reportId}`)],
        [Markup.button.callback('↩️ Назад', `select_report_date_${uniqueObjects.indexOf(report.objectName)}_${uniqueDates.indexOf(formattedDate)}`)]
    ];

    if (report.photos && report.photos.length > 0) {
        const mediaGroup = await ctx.telegram.sendMediaGroup(ctx.chat.id, report.photos.map(photoId => ({ type: 'photo', media: photoId })));
        mediaGroup.forEach(msg => ctx.state.userStates[userId].messageIds.push(msg.message_id));
    }
    const message = await ctx.reply(reportText, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
    });
    addMessageId(ctx, message.message_id);
}

async function editReport(ctx, reportId) {
    const userId = ctx.from.id.toString();
    const reports = await loadUserReports(userId);
    const report = reports[reportId];

    if (!report) {
        await clearPreviousMessages(ctx, userId);
        return ctx.reply('Ошибка: не удалось найти отчёт для редактирования.');
    }

    await clearPreviousMessages(ctx, userId);

    ctx.state.userStates[userId] = {
        step: 'editWorkDone',
        report: { ...report, originalReportId: reportId },
        messageIds: []
    };
    const message = await ctx.reply('💡 Введите новую информацию о выполненных работах:');
    addMessageId(ctx, message.message_id);
}

async function deleteAllPhotos(ctx, reportId) {
    const userId = ctx.from.id.toString();
    const userState = ctx.state.userStates[userId];

    if (!userState || !userState.report || userState.report.originalReportId !== reportId) {
        await clearPreviousMessages(ctx, userId);
        return ctx.reply('Ошибка: не удалось найти данные для редактирования.');
    }

    await clearPreviousMessages(ctx, userId);
    userState.report.photos = [];
    userState.step = 'editPhotos';

    const message = await ctx.reply(
        'Все фото удалены. Отправьте новые или нажмите "Готово" для завершения.',
        Markup.inlineKeyboard([
            [Markup.button.callback('Готово', `finish_edit_${reportId}`)]
        ])
    );
    ctx.state.userStates[userId].messageIds = [message.message_id];
}

async function finishEditReport(ctx, reportId) {
    const userId = ctx.from.id.toString();
    const state = ctx.state.userStates[userId];
    if (!state || state.step !== 'editPhotos' || state.report.originalReportId !== reportId) return;

    if (state.mediaGroupIds && state.mediaGroupIds.length > 0) {
        for (const msgId of state.mediaGroupIds) {
            await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(e => {});
        }
    }
    await clearPreviousMessages(ctx, userId);
    state.mediaGroupIds = [];
    state.messageIds = [];

    const users = await loadUsers();

    const newTimestamp = new Date().toISOString();
    const formattedDate = parseAndFormatDate(state.report.date);
    const newReportId = `${formattedDate.replace(/\./g, '_')}_${users[userId].nextReportId++}`;
    const newReport = {
        reportId: newReportId,
        userId,
        objectName: state.report.objectName,
        date: formattedDate,
        timestamp: newTimestamp,
        workDone: state.report.workDone,
        materials: state.report.materials,
        groupMessageIds: {},
        messageLink: null,
        fullName: users[userId].fullName,
        photos: state.report.photos
    };
    const newReportText = `
📅 ОТЧЕТ ЗА ${formattedDate} (ОБНОВЛЁН)  
🏢 ${escapeHtml(newReport.objectName)}
👷 ${escapeHtml(users[userId].fullName)}

<blockquote><b>ВЫПОЛНЕННЫЕ РАБОТЫ:</b>
${escapeHtml(newReport.workDone)}</blockquote>
<blockquote><b>ПОСТАВЛЕННЫЕ МАТЕРИАЛЫ:</b>
${escapeHtml(newReport.materials)}</blockquote>
    `.trim();

    const oldReportId = state.report.originalReportId;
    if (oldReportId) {
        const userReports = await loadUserReports(userId);
        const oldReport = userReports[oldReportId];
        if (oldReport?.groupMessageIds) {
            for (const [chatId, msgId] of Object.entries(oldReport.groupMessageIds)) {
                await ctx.telegram.deleteMessage(chatId, msgId).catch(e => {});
            }
            const db = await connectMongo();
            const reportsCollection = db.collection('reports');
            await reportsCollection.deleteOne({ reportid: oldReportId });
        }
    }

    const objectGroups = await getObjectGroups();
    const generalChatIds = await getGeneralGroupChatIds();
    const orgObjectsMap = await getAllOrganizationObjectsMap();
    const newGroupChatId = objectGroups[newReport.objectName] || generalChatIds['default']?.chatId || null;
    const userOrg = users[userId].organization;
    const targetOrgs = [
        userOrg,
        ...Object.keys(orgObjectsMap).filter(org => generalChatIds[org]?.reportSources?.includes(userOrg))
    ];
    const allChatIds = [newGroupChatId, ...targetOrgs.map(org => generalChatIds[org]?.chatId || generalChatIds['default']?.chatId).filter(Boolean)];

    if (newReport.photos.length > 0) {
        const mediaGroup = newReport.photos.map((photoId, index) => ({
            type: 'photo',
            media: photoId,
            caption: index === 0 ? newReportText.slice(0, 1024) : undefined
        }));
        for (const chatId of allChatIds) {
            try {
                const messages = await ctx.telegram.sendMediaGroup(chatId, mediaGroup);
                newReport.groupMessageIds[chatId] = messages[0].message_id;
                if (chatId === newGroupChatId) {
                    newReport.messageLink = `https://t.me/c/${chatId.toString().replace('-', '')}/${messages[0].message_id}`;
                }
            } catch (e) {}
        }
    } else {
        for (const chatId of allChatIds) {
            try {
                const message = await ctx.telegram.sendMessage(chatId, newReportText);
                newReport.groupMessageIds[chatId] = message.message_id;
                if (chatId === newGroupChatId) {
                    newReport.messageLink = `https://t.me/c/${chatId.toString().replace('-', '')}/${message.message_id}`;
                }
            } catch (e) {}
        }
    }

    await saveReport(userId, newReport);
    await saveUser(userId, users[userId]);
    await ctx.reply(`✅ Ваш отчёт обновлён:\n\n${newReportText}${newReport.photos.length > 0 ? '\n(С изображениями)' : ''}`, Markup.inlineKeyboard([
        [Markup.button.callback('↩️ Вернуться в личный кабинет', 'profile')]
    ]));
    state.step = null;
    state.report = {};
}

module.exports.showReportsMenu = showReportsMenu;

module.exports = (bot) => {
    bot.action('reports_menu', async (ctx) => await showReportsMenu(ctx));
    bot.action('download_reports', async (ctx) => await showDownloadReport(ctx, 0));
    bot.action('download_users', async (ctx) => await showDownloadUsers(ctx, 0));
    bot.action(/download_report_page_(\d+)/, async (ctx) => await showDownloadReport(ctx, parseInt(ctx.match[1], 10)));
    bot.action(/download_report_file_(\d+)/, (ctx) => downloadReportFile(ctx, parseInt(ctx.match[1], 10)));
    bot.action(/download_users_page_(\d+)/, async (ctx) => await showDownloadUsers(ctx, parseInt(ctx.match[1], 10)));
    bot.action(/download_users_file_(\d+)/, (ctx) => downloadUsersFile(ctx, parseInt(ctx.match[1], 10)));
    bot.action('create_report', createReport);
    bot.action(/select_object_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const objectIndex = parseInt(ctx.match[1], 10);
        const users = await loadUsers();
        if (!users[userId] || !Array.isArray(users[userId].selectedObjects)) {
            return ctx.reply('Ошибка: пользователь или объекты не найдены.');
        }
        const selectedObject = users[userId].selectedObjects[objectIndex];
        if (!selectedObject) return;

        await clearPreviousMessages(ctx, userId);

        ctx.state.userStates[userId] = {
            step: 'workDone',
            report: { objectName: selectedObject, photos: [] },
            messageIds: []
        };
        const message = await ctx.reply('💡 Введите информацию о выполненных работах:');
        addMessageId(ctx, message.message_id);
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
    bot.action(/delete_all_photos_(.+)/, (ctx) => deleteAllPhotos(ctx, ctx.match[1]));
    bot.action(/finish_edit_(.+)/, (ctx) => finishEditReport(ctx, ctx.match[1]));
};