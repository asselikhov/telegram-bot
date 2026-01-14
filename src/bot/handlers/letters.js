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

async function showLettersMenu(ctx) {
    const userId = ctx.from.id.toString();
    await clearPreviousMessages(ctx, userId);
    const state = ctx.state.userStates && ctx.state.userStates[userId];
    if (state) {
        state.messageIds = [];
    }

    const menuText = `
✉️ ПИСЬМА
➖➖➖➖➖➖➖➖➖➖➖
    `.trim();

    const buttons = [
        [Markup.button.callback('📤 Выгрузить письма', 'download_letters')],
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
            alignment: { horizontal: 'left', vertical: 'middle', wrapText: true },
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

        // Настраиваем ширину колонок
        worksheet.columns = [
            { key: 'type', width: 12 },
            { key: 'organizations', width: 20 },
            { key: 'incoming', width: 12 },
            { key: 'outgoing', width: 12 },
            { key: 'docDate', width: 15 },
            { key: 'regDate', width: 15 },
            { key: 'counterparty', width: 20 },
            { key: 'role', width: 15 },
            { key: 'object', width: 20 },
            { key: 'counterpartyOutgoing', width: 18 },
            { key: 'content', width: 40 },
            { key: 'fileLink', width: 30 }
        ];

        // Данные
        let currentRow = 3;
        for (const letter of objectLetters) {
            const row = worksheet.getRow(currentRow);
            row.values = [
                letter['Тип'] || '',
                letter['Организации'] || '',
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
                linkCell.value = { text: linkUrl, hyperlink: linkUrl };
                linkCell.style = {
                    ...cellStyle,
                    font: { ...cellStyle.font, color: { argb: 'FF0000FF' }, underline: true }
                };
            }
            
            currentRow++;
        }

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

module.exports.showLettersMenu = showLettersMenu;

module.exports = (bot) => {
    bot.action('letters_menu', async (ctx) => await showLettersMenu(ctx));
    bot.action('download_letters', async (ctx) => await showDownloadLetters(ctx, 0));
    bot.action(/download_letters_page_(\d+)/, async (ctx) => await showDownloadLetters(ctx, parseInt(ctx.match[1], 10)));
    bot.action(/download_letters_file_(\d+)/, (ctx) => downloadLettersFile(ctx, parseInt(ctx.match[1], 10)));
};
