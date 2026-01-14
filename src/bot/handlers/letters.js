const { Markup } = require('telegraf');
const ExcelJS = require('exceljs');
const { google } = require('googleapis');
const { loadUsers } = require('../../database/userModel');
const { clearPreviousMessages } = require('../utils');
const { getOrganizationObjects } = require('../../database/configService');
const { addMessageId } = require('../utils/stateHelper');

// Google Sheets API setup
let authClient = null;

async function getGoogleAuthClient() {
    if (authClient) {
        return authClient;
    }
    
    try {
        let authConfig = {
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets.readonly',
                'https://www.googleapis.com/auth/drive.readonly'
            ],
        };

        // Поддержка трех вариантов:
        // 1. Secret File на Render: /etc/secrets/<filename>
        // 2. Локальный файл через переменную окружения
        // 3. JSON из переменной окружения
        const fs = require('fs');
        
        // Проверяем Secret File на Render (приоритет)
        const renderSecretPath = '/etc/secrets/office-484311-c559451bf1b3.json';
        if (fs.existsSync(renderSecretPath)) {
            authConfig.keyFile = renderSecretPath;
        } else if (process.env.GOOGLE_SERVICE_ACCOUNT_KEYFILE) {
            // Для локальной разработки: используем путь к файлу
            authConfig.keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEYFILE;
        } else if (process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS) {
            // Для Render через переменную окружения: используем JSON
            const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS);
            authConfig.credentials = credentials;
        } else {
            throw new Error('Не настроены credentials для Google Sheets API. Используйте Secret File, GOOGLE_SERVICE_ACCOUNT_KEYFILE или GOOGLE_SERVICE_ACCOUNT_CREDENTIALS');
        }

        const auth = new google.auth.GoogleAuth(authConfig);
        authClient = await auth.getClient();
        return authClient;
    } catch (error) {
        console.error('Ошибка при инициализации Google Auth:', error);
        throw error;
    }
}

// Функция для поиска папки "Офис" и таблицы "Журнал писем"
async function findLettersSheet() {
    try {
        const auth = await getGoogleAuthClient();
        const drive = google.drive({ version: 'v3', auth });
        
        // Ищем папку "Офис"
        const folderResponse = await drive.files.list({
            q: "name='Офис' and mimeType='application/vnd.google-apps.folder' and trashed=false",
            fields: 'files(id, name)',
        });
        
        if (!folderResponse.data.files || folderResponse.data.files.length === 0) {
            throw new Error('Папка "Офис" не найдена');
        }
        
        const officeFolderId = folderResponse.data.files[0].id;
        
        // Ищем таблицу "Журнал писем" в папке "Офис"
        const sheetResponse = await drive.files.list({
            q: `name='Журнал писем' and mimeType='application/vnd.google-apps.spreadsheet' and '${officeFolderId}' in parents and trashed=false`,
            fields: 'files(id, name)',
        });
        
        if (!sheetResponse.data.files || sheetResponse.data.files.length === 0) {
            throw new Error('Таблица "Журнал писем" не найдена в папке "Офис"');
        }
        
        return sheetResponse.data.files[0].id;
    } catch (error) {
        console.error('Ошибка при поиске таблицы:', error);
        throw error;
    }
}

// Функция для чтения данных из таблицы
async function readLettersData() {
    try {
        const auth = await getGoogleAuthClient();
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = await findLettersSheet();
        
        // Читаем данные из первого листа (или можно указать конкретный лист)
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'A:Z', // Читаем все колонки
        });
        
        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return [];
        }
        
        // Первая строка - заголовки
        const headers = rows[0];
        const data = [];
        
        // Преобразуем данные в объекты
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            
            const rowData = {};
            headers.forEach((header, index) => {
                rowData[header] = row[index] || '';
            });
            data.push(rowData);
        }
        
        return data;
    } catch (error) {
        console.error('Ошибка при чтении данных из таблицы:', error);
        throw error;
    }
}

// Вспомогательная функция для получения значения "Организации" с учетом возможных вариантов названия
function getOrganizationsValue(letter) {
    if (letter['Организации']) {
        return letter['Организации'];
    } else if (letter['Организация']) {
        return letter['Организация'];
    } else if (letter['организации']) {
        return letter['организации'];
    } else if (letter['организация']) {
        return letter['организация'];
    }
    return '';
}

async function showLettersMenu(ctx) {
    const userId = ctx.from.id.toString();
    await clearPreviousMessages(ctx, userId);
    const state = ctx.state.userStates && ctx.state.userStates[userId];
    if (state) {
        state.messageIds = [];
    }

    const menuText = `
📬 КОРРЕСПОНДЕНЦИЯ
➖➖➖➖➖➖➖➖➖➖➖
    `.trim();

    const buttons = [
        [Markup.button.callback('📤 Выгрузить письма', 'download_letters')],
        [Markup.button.callback('📤 Выгрузить записи АН', 'download_an_records')],
        [Markup.button.callback('↩️ Назад', 'main_menu')]
    ];

    const message = await ctx.reply(menuText, Markup.inlineKeyboard(buttons));
    addMessageId(ctx, message.message_id);
}

async function showDownloadLetters(ctx, page = 0) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();

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

    const buttons = currentObjects.map((obj) =>
        [Markup.button.callback(obj, `download_letters_file_${availableObjects.indexOf(obj)}`)]
    );

    const paginationButtons = [];
    if (totalPages > 1) {
        if (pageNum > 0) paginationButtons.push(Markup.button.callback('⬅️ Назад', `download_letters_page_${pageNum - 1}`));
        if (pageNum < totalPages - 1) paginationButtons.push(Markup.button.callback('Вперед ➡️', `download_letters_page_${pageNum + 1}`));
    }
    if (paginationButtons.length > 0) buttons.push(paginationButtons);
    
    // Для организации "ООО "Стройка58"" добавляем кнопку "Все письма"
    if (userOrganization === 'ООО "Стройка58"') {
        buttons.push([Markup.button.callback('Все письма', 'download_all_letters')]);
    }
    
    buttons.push([Markup.button.callback('↩️ Назад', 'letters_menu')]);

    const message = await ctx.reply(
        `Выберите объект для выгрузки писем (Страница ${pageNum + 1} из ${totalPages}):`,
        Markup.inlineKeyboard(buttons)
    );
    addMessageId(ctx, message.message_id);
}

async function downloadLettersFile(ctx, objectIndex) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();

    if (!users[userId]) {
        return ctx.reply('Ошибка: пользователь не найден в базе данных.');
    }

    const userOrganization = users[userId].organization;
    const availableObjects = await getOrganizationObjects(userOrganization);
    const objectName = availableObjects[objectIndex];

    if (!objectName) {
        return ctx.reply('Ошибка: объект не найден.');
    }

    try {
        await ctx.reply('Загрузка данных из Google Sheets...');

        // Читаем данные из Google Sheets
        const allLetters = await readLettersData();

        // Фильтруем письма по объекту
        const normalizedObjectName = objectName.trim();
        const objectLetters = allLetters.filter(letter => {
            const letterObject = letter['Объект'] ? letter['Объект'].toString().trim() : '';
            return letterObject === normalizedObjectName;
        });

        if (objectLetters.length === 0) {
            return ctx.reply(`Письма для объекта "${objectName}" не найдены.`);
        }

        await clearPreviousMessages(ctx, userId);

        // Создаем Excel файл
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Письма');

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
            alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
            border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
        };

        // Заголовок
        worksheet.mergeCells('A1:L1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = objectName;
        titleCell.style = titleStyle;

        // Заголовки колонок
        const headers = ['Тип', 'Организации', 'ВХ №', 'ИС №', 'Дата документа', 'Дата регистрации', 
                        'Контрагент', 'Роль', 'Объект', 'Исх. № контрагента', 'Содержание', 'Ссылка на файл'];
        const headerRow = worksheet.getRow(2);
        headerRow.values = headers;
        headerRow.eachCell((cell) => {
            cell.style = headerStyle;
        });

        // Определяем колонки (нужно для вычисления ширины)
        worksheet.columns = [
            { key: 'type', width: 10 },
            { key: 'organizations', width: 10 },
            { key: 'incoming', width: 10 },
            { key: 'outgoing', width: 10 },
            { key: 'docDate', width: 10 },
            { key: 'regDate', width: 10 },
            { key: 'counterparty', width: 10 },
            { key: 'role', width: 10 },
            { key: 'object', width: 10 },
            { key: 'counterpartyOutgoing', width: 10 },
            { key: 'content', width: 10 },
            { key: 'fileLink', width: 10 }
        ];

        // Данные
        let currentRow = 3;
        for (const letter of objectLetters) {
            const row = worksheet.getRow(currentRow);
            
            row.values = [
                letter['Тип'] || '',
                getOrganizationsValue(letter),
                letter['ВХ №'] || '',
                letter['ИС №'] || '',
                letter['Дата документа'] || '',
                letter['Дата регистрации'] || '',
                letter['Контрагент'] || '',
                letter['Роль'] || '',
                letter['Объект'] || '',
                letter['Исх. № контрагента'] || '',
                letter['Содержание'] || '',
                letter['Ссылка на файл'] || ''
            ];
            
            row.eachCell((cell) => {
                cell.style = cellStyle;
            });
            
            // Если есть ссылка на файл, делаем её гиперссылкой
            if (letter['Ссылка на файл'] && letter['Ссылка на файл'].toString().trim()) {
                const linkCell = worksheet.getCell(`L${currentRow}`);
                const linkUrl = letter['Ссылка на файл'].toString().trim();
                linkCell.value = { text: 'Открыть', hyperlink: linkUrl };
                linkCell.style = {
                    ...cellStyle,
                    font: { ...cellStyle.font, color: { argb: 'FF0000FF' }, underline: true }
                };
            }
            
            currentRow++;
        }

        // Настройка ширины колонок по содержимому с ограничением до 40
        worksheet.columns.forEach((column, index) => {
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
        worksheet.autoFilter = 'A2:L2';

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
        const { formatDate } = require('../utils');
        const filename = `${objectName}_letters_${formatDate(new Date())}.xlsx`;

        const documentMessage = await ctx.replyWithDocument({ source: buffer, filename });
        if (ctx.state.userStates && ctx.state.userStates[userId]) {
            ctx.state.userStates[userId].messageIds.push(documentMessage.message_id);
        }
    } catch (error) {
        console.error('Ошибка при выгрузке писем:', error);
        await ctx.reply(`Ошибка при выгрузке писем: ${error.message}`);
    }
}

async function downloadAllLetters(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();

    if (!users[userId]) {
        return ctx.reply('Ошибка: пользователь не найден в базе данных.');
    }

    const userOrganization = users[userId].organization;
    
    // Проверяем, что пользователь из организации "ООО "Стройка58""
    if (userOrganization !== 'ООО "Стройка58"') {
        return ctx.reply('У вас нет прав для выгрузки всех писем.');
    }

    try {
        await ctx.reply('Загрузка данных из Google Sheets...');

        // Читаем все данные из Google Sheets без фильтрации
        const allLetters = await readLettersData();

        if (allLetters.length === 0) {
            return ctx.reply('Письма не найдены в таблице.');
        }

        await clearPreviousMessages(ctx, userId);

        // Создаем Excel файл
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Все письма');

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
            alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
            border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
        };

        // Заголовок
        worksheet.mergeCells('A1:M1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = 'Все письма';
        titleCell.style = titleStyle;

        // Заголовки колонок
        const headers = ['№ п/п', 'Тип', 'Организации', 'ВХ №', 'ИС №', 'Дата документа', 'Дата регистрации', 
                        'Контрагент', 'Роль', 'Объект', 'Исх. № контрагента', 'Содержание', 'Ссылка на файл'];
        const headerRow = worksheet.getRow(2);
        headerRow.values = headers;
        headerRow.eachCell((cell) => {
            cell.style = headerStyle;
        });

        // Определяем колонки (нужно для вычисления ширины)
        worksheet.columns = [
            { key: 'number', width: 10 },
            { key: 'type', width: 10 },
            { key: 'organizations', width: 10 },
            { key: 'incoming', width: 10 },
            { key: 'outgoing', width: 10 },
            { key: 'docDate', width: 10 },
            { key: 'regDate', width: 10 },
            { key: 'counterparty', width: 10 },
            { key: 'role', width: 10 },
            { key: 'object', width: 10 },
            { key: 'counterpartyOutgoing', width: 10 },
            { key: 'content', width: 10 },
            { key: 'fileLink', width: 10 }
        ];

        // Данные
        let currentRow = 3;
        let rowNumber = 1;
        for (const letter of allLetters) {
            const row = worksheet.getRow(currentRow);
            row.values = [
                rowNumber++,
                letter['Тип'] || '',
                getOrganizationsValue(letter),
                letter['ВХ №'] || '',
                letter['ИС №'] || '',
                letter['Дата документа'] || '',
                letter['Дата регистрации'] || '',
                letter['Контрагент'] || '',
                letter['Роль'] || '',
                letter['Объект'] || '',
                letter['Исх. № контрагента'] || '',
                letter['Содержание'] || '',
                letter['Ссылка на файл'] || ''
            ];
            
            row.eachCell((cell) => {
                cell.style = cellStyle;
            });
            
            // Если есть ссылка на файл, делаем её гиперссылкой
            if (letter['Ссылка на файл'] && letter['Ссылка на файл'].toString().trim()) {
                const linkCell = worksheet.getCell(`M${currentRow}`);
                const linkUrl = letter['Ссылка на файл'].toString().trim();
                linkCell.value = { text: 'Открыть', hyperlink: linkUrl };
                linkCell.style = {
                    ...cellStyle,
                    font: { ...cellStyle.font, color: { argb: 'FF0000FF' }, underline: true }
                };
            }
            
            currentRow++;
        }

        // Настройка ширины колонок по содержимому с ограничением до 40
        worksheet.columns.forEach((column, index) => {
            // Для столбца "№ п/п" устанавливаем фиксированную небольшую ширину
            if (column.key === 'number') {
                column.width = 8;
                return;
            }
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
        worksheet.autoFilter = 'A2:M2';

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
        const { formatDate } = require('../utils');
        const filename = `Все_письма_${formatDate(new Date())}.xlsx`;

        const documentMessage = await ctx.replyWithDocument({ source: buffer, filename });
        if (ctx.state.userStates && ctx.state.userStates[userId]) {
            ctx.state.userStates[userId].messageIds.push(documentMessage.message_id);
        }
    } catch (error) {
        console.error('Ошибка при выгрузке всех писем:', error);
        await ctx.reply(`Ошибка при выгрузке всех писем: ${error.message}`);
    }
}

// Функция для поиска таблицы "Журнал АН"
async function findANSheet() {
    try {
        const auth = await getGoogleAuthClient();
        const drive = google.drive({ version: 'v3', auth });
        
        // Ищем папку "Офис"
        const folderResponse = await drive.files.list({
            q: "name='Офис' and mimeType='application/vnd.google-apps.folder' and trashed=false",
            fields: 'files(id, name)',
        });
        
        if (!folderResponse.data.files || folderResponse.data.files.length === 0) {
            throw new Error('Папка "Офис" не найдена');
        }
        
        const officeFolderId = folderResponse.data.files[0].id;
        
        // Ищем таблицу "Журнал АН" в папке "Офис"
        const sheetResponse = await drive.files.list({
            q: `name='Журнал АН' and mimeType='application/vnd.google-apps.spreadsheet' and '${officeFolderId}' in parents and trashed=false`,
            fields: 'files(id, name)',
        });
        
        if (!sheetResponse.data.files || sheetResponse.data.files.length === 0) {
            throw new Error('Таблица "Журнал АН" не найдена в папке "Офис"');
        }
        
        return sheetResponse.data.files[0].id;
    } catch (error) {
        console.error('Ошибка при поиске таблицы "Журнал АН":', error);
        throw error;
    }
}

// Функция для чтения данных из таблицы "Журнал АН"
async function readANData() {
    try {
        const auth = await getGoogleAuthClient();
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = await findANSheet();
        
        // Читаем данные из первого листа
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'A:Z', // Читаем все колонки
        });
        
        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return [];
        }
        
        // Первая строка - заголовки
        const headers = rows[0];
        const data = [];
        
        // Преобразуем данные в объекты
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            
            const rowData = {};
            headers.forEach((header, index) => {
                rowData[header] = row[index] || '';
            });
            data.push(rowData);
        }
        
        return data;
    } catch (error) {
        console.error('Ошибка при чтении данных из таблицы "Журнал АН":', error);
        throw error;
    }
}

async function showDownloadANRecords(ctx, page = 0) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();

    if (!users[userId]) {
        return ctx.reply('Ошибка: пользователь не найден в базе данных.');
    }

    const userOrganization = users[userId].organization;
    const allObjects = await getOrganizationObjects(userOrganization);
    
    // Убираем объект "Офис" из списка
    const availableObjects = allObjects.filter(obj => obj !== 'Офис');

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

    const buttons = currentObjects.map((obj) =>
        [Markup.button.callback(obj, `download_an_file_${availableObjects.indexOf(obj)}`)]
    );

    const paginationButtons = [];
    if (totalPages > 1) {
        if (pageNum > 0) paginationButtons.push(Markup.button.callback('⬅️ Назад', `download_an_page_${pageNum - 1}`));
        if (pageNum < totalPages - 1) paginationButtons.push(Markup.button.callback('Вперед ➡️', `download_an_page_${pageNum + 1}`));
    }
    if (paginationButtons.length > 0) buttons.push(paginationButtons);
    
    // Добавляем кнопку "Все записи АН" перед кнопкой "Назад"
    buttons.push([Markup.button.callback('Все записи АН', 'download_all_an_records')]);
    buttons.push([Markup.button.callback('↩️ Назад', 'letters_menu')]);

    const message = await ctx.reply(
        `Выберите объект для выгрузки записей АН (Страница ${pageNum + 1} из ${totalPages}):`,
        Markup.inlineKeyboard(buttons)
    );
    addMessageId(ctx, message.message_id);
}

async function downloadANFile(ctx, objectIndex) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();

    if (!users[userId]) {
        return ctx.reply('Ошибка: пользователь не найден в базе данных.');
    }

    const userOrganization = users[userId].organization;
    const allObjects = await getOrganizationObjects(userOrganization);
    // Убираем объект "Офис" из списка
    const availableObjects = allObjects.filter(obj => obj !== 'Офис');
    const objectName = availableObjects[objectIndex];

    if (!objectName) {
        return ctx.reply('Ошибка: объект не найден.');
    }

    try {
        await ctx.reply('Загрузка данных из Google Sheets...');

        // Читаем данные из Google Sheets
        const allANRecords = await readANData();

        // Фильтруем записи АН по объекту
        const normalizedObjectName = objectName.trim();
        const objectANRecords = allANRecords.filter(record => {
            const recordObject = record['Объект'] ? record['Объект'].toString().trim() : '';
            return recordObject === normalizedObjectName;
        });

        if (objectANRecords.length === 0) {
            return ctx.reply(`Записи АН для объекта "${objectName}" не найдены.`);
        }

        await clearPreviousMessages(ctx, userId);

        // Создаем Excel файл
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Записи АН');

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
            alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
            border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
        };

        // Заголовок
        worksheet.mergeCells('A1:H1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = objectName;
        titleCell.style = titleStyle;

        // Заголовки колонок
        const headers = ['Дата записи', 'Организации', '№ журнала', '№ учетного листа', '№ пункта', 'Объект', 'Содержание', 'Ссылка на файл'];
        const headerRow = worksheet.getRow(2);
        headerRow.values = headers;
        headerRow.eachCell((cell) => {
            cell.style = headerStyle;
        });

        // Определяем колонки (нужно для вычисления ширины)
        worksheet.columns = [
            { key: 'date', width: 10 },
            { key: 'organizations', width: 10 },
            { key: 'journalNumber', width: 10 },
            { key: 'sheetNumber', width: 10 },
            { key: 'pointNumber', width: 10 },
            { key: 'object', width: 10 },
            { key: 'content', width: 10 },
            { key: 'fileLink', width: 10 }
        ];

        // Данные
        let currentRow = 3;
        for (const record of objectANRecords) {
            const row = worksheet.getRow(currentRow);
            row.values = [
                record['Дата записи'] || '',
                record['Организации'] || '',
                record['№ журнала'] || '',
                record['№ учетного листа'] || '',
                record['№ пункта'] || '',
                record['Объект'] || '',
                record['Содержание'] || '',
                record['Ссылка на файл'] || ''
            ];
            
            row.eachCell((cell) => {
                cell.style = cellStyle;
            });
            
            // Если есть ссылка на файл, делаем её гиперссылкой
            if (record['Ссылка на файл'] && record['Ссылка на файл'].toString().trim()) {
                const linkCell = worksheet.getCell(`H${currentRow}`);
                const linkUrl = record['Ссылка на файл'].toString().trim();
                linkCell.value = { text: 'Открыть', hyperlink: linkUrl };
                linkCell.style = {
                    ...cellStyle,
                    font: { ...cellStyle.font, color: { argb: 'FF0000FF' }, underline: true }
                };
            }
            
            currentRow++;
        }

        // Настройка ширины колонок по содержимому с ограничением до 40
        worksheet.columns.forEach((column, index) => {
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
        worksheet.autoFilter = 'A2:H2';

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
        const { formatDate } = require('../utils');
        const filename = `${objectName}_AN_${formatDate(new Date())}.xlsx`;

        const documentMessage = await ctx.replyWithDocument({ source: buffer, filename });
        if (ctx.state.userStates && ctx.state.userStates[userId]) {
            ctx.state.userStates[userId].messageIds.push(documentMessage.message_id);
        }
    } catch (error) {
        console.error('Ошибка при выгрузке записей АН:', error);
        await ctx.reply(`Ошибка при выгрузке записей АН: ${error.message}`);
    }
}

async function downloadAllANRecords(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();

    if (!users[userId]) {
        return ctx.reply('Ошибка: пользователь не найден в базе данных.');
    }

    try {
        await ctx.reply('Загрузка данных из Google Sheets...');

        // Читаем все данные из Google Sheets без фильтрации
        const allANRecords = await readANData();

        if (allANRecords.length === 0) {
            return ctx.reply('Записи АН не найдены в таблице.');
        }

        await clearPreviousMessages(ctx, userId);

        // Создаем Excel файл
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Все записи АН');

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
            alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
            border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
        };

        // Заголовок
        worksheet.mergeCells('A1:H1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = 'Все записи АН';
        titleCell.style = titleStyle;

        // Заголовки колонок
        const headers = ['Дата записи', 'Организации', '№ журнала', '№ учетного листа', '№ пункта', 'Объект', 'Содержание', 'Ссылка на файл'];
        const headerRow = worksheet.getRow(2);
        headerRow.values = headers;
        headerRow.eachCell((cell) => {
            cell.style = headerStyle;
        });

        // Определяем колонки (нужно для вычисления ширины)
        worksheet.columns = [
            { key: 'date', width: 10 },
            { key: 'organizations', width: 10 },
            { key: 'journalNumber', width: 10 },
            { key: 'sheetNumber', width: 10 },
            { key: 'pointNumber', width: 10 },
            { key: 'object', width: 10 },
            { key: 'content', width: 10 },
            { key: 'fileLink', width: 10 }
        ];

        // Данные
        let currentRow = 3;
        for (const record of allANRecords) {
            const row = worksheet.getRow(currentRow);
            row.values = [
                record['Дата записи'] || '',
                record['Организации'] || '',
                record['№ журнала'] || '',
                record['№ учетного листа'] || '',
                record['№ пункта'] || '',
                record['Объект'] || '',
                record['Содержание'] || '',
                record['Ссылка на файл'] || ''
            ];
            
            row.eachCell((cell) => {
                cell.style = cellStyle;
            });
            
            // Если есть ссылка на файл, делаем её гиперссылкой
            if (record['Ссылка на файл'] && record['Ссылка на файл'].toString().trim()) {
                const linkCell = worksheet.getCell(`H${currentRow}`);
                const linkUrl = record['Ссылка на файл'].toString().trim();
                linkCell.value = { text: 'Открыть', hyperlink: linkUrl };
                linkCell.style = {
                    ...cellStyle,
                    font: { ...cellStyle.font, color: { argb: 'FF0000FF' }, underline: true }
                };
            }
            
            currentRow++;
        }

        // Настройка ширины колонок по содержимому с ограничением до 40
        worksheet.columns.forEach((column, index) => {
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
        worksheet.autoFilter = 'A2:H2';

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
        const { formatDate } = require('../utils');
        const filename = `Все_записи_АН_${formatDate(new Date())}.xlsx`;

        const documentMessage = await ctx.replyWithDocument({ source: buffer, filename });
        if (ctx.state.userStates && ctx.state.userStates[userId]) {
            ctx.state.userStates[userId].messageIds.push(documentMessage.message_id);
        }
    } catch (error) {
        console.error('Ошибка при выгрузке всех записей АН:', error);
        await ctx.reply(`Ошибка при выгрузке всех записей АН: ${error.message}`);
    }
}

module.exports.showLettersMenu = showLettersMenu;

module.exports = (bot) => {
    bot.action('letters_menu', async (ctx) => await showLettersMenu(ctx));
    bot.action('download_letters', async (ctx) => await showDownloadLetters(ctx, 0));
    bot.action(/download_letters_page_(\d+)/, async (ctx) => await showDownloadLetters(ctx, parseInt(ctx.match[1], 10)));
    bot.action(/download_letters_file_(\d+)/, (ctx) => downloadLettersFile(ctx, parseInt(ctx.match[1], 10)));
    bot.action('download_all_letters', async (ctx) => await downloadAllLetters(ctx));
    bot.action('download_an_records', async (ctx) => await showDownloadANRecords(ctx, 0));
    bot.action(/download_an_page_(\d+)/, async (ctx) => await showDownloadANRecords(ctx, parseInt(ctx.match[1], 10)));
    bot.action(/download_an_file_(\d+)/, (ctx) => downloadANFile(ctx, parseInt(ctx.match[1], 10)));
    bot.action('download_all_an_records', async (ctx) => await downloadAllANRecords(ctx));
};
