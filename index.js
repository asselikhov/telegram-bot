console.log('Скрипт запущен');
const { Telegraf, Markup } = require('telegraf');
const { Pool } = require('pg');
const schedule = require('node-schedule');
const express = require('express');
require('dotenv').config();

// Логируем переменные окружения
console.log('Запуск бота, BOT_TOKEN:', process.env.BOT_TOKEN?.substring(0, 5) + '...');
console.log('Запуск бота, ADMIN_ID:', process.env.ADMIN_ID || 'Не задан');
console.log('Запуск бота, DATABASE_URL:', process.env.DATABASE_URL ? 'Задан' : 'Не задан');

// Проверка BOT_TOKEN
if (!process.env.BOT_TOKEN) {
    console.error('Ошибка: BOT_TOKEN не задан');
    process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 3000;

// Константы
const ADMIN_ID = process.env.ADMIN_ID || 'YOUR_ADMIN_ID';
const GENERAL_GROUP_CHAT_ID = '-1002266023014';

// Подключение к PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect((err) => {
    if (err) console.error('Ошибка подключения к базе данных:', err.message);
    else console.log('Подключено к базе данных PostgreSQL');
});

// Инициализация таблиц
async function initializeDatabase() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                userId TEXT PRIMARY KEY,
                fullName TEXT,
                position TEXT,
                selectedObjects TEXT,
                status TEXT DEFAULT 'в работе',
                isApproved INTEGER DEFAULT 0,
                nextReportId INTEGER DEFAULT 1
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS reports (
                reportId TEXT PRIMARY KEY,
                userId TEXT,
                objectName TEXT,
                date TEXT,
                timestamp TEXT,
                workDone TEXT,
                materials TEXT,
                groupMessageId TEXT,
                generalMessageId TEXT,
                FOREIGN KEY (userId) REFERENCES users(userId)
            );
        `);
        console.log('Таблицы созданы или уже существуют');
    } catch (err) {
        console.error('Ошибка при создании таблиц:', err.message);
    } finally {
        client.release();
    }
}

initializeDatabase();

// Список объектов только на кириллице
const OBJECTS_LIST_CYRILLIC = [
    'Кольцевой МНПП',
    'Ярославль-Москва',
    'Ярославль-Кириши1',
    'Никулино-Пенза, 881,2-886,0км',
    'Ростовка-Никольское, 595,4-608,1км'
];

const POSITIONS_LIST = ['производитель работ', 'геодезист', 'делопроизводитель', 'инженер по комплектации', 'инженер пто', 'механик', 'бухгалтер', 'другая'];

// Группы для объектов (используем кириллические названия)
const OBJECT_GROUPS = {
    'Кольцевой МНПП': '-1002394790037',
    'Ярославль-Москва': '-1002318741372',
    'Ярославль-Кириши1': '-1002153878927',
    'Никулино-Пенза, 881,2-886,0км': '-1002597582709',
    'Ростовка-Никольское, 595,4-608,1км': '-1002627066168'
};

let userStates = {};
let lastMessageIds = {};

async function loadUsers() {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM users');
        const users = {};
        res.rows.forEach(row => {
            users[row.userid] = {
                fullName: row.fullname || '',
                position: row.position || '',
                selectedObjects: row.selectedobjects ? JSON.parse(row.selectedobjects) : [],
                status: row.status || 'в работе',
                isApproved: Boolean(row.isapproved),
                nextReportId: row.nextreportid || 1,
                reports: {}
            };
        });
        return users;
    } catch (err) {
        console.error('Ошибка загрузки пользователей:', err.message);
        throw err;
    } finally {
        client.release();
    }
}

async function loadUserReports(userId) {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM reports WHERE userId = $1', [userId]);
        const reports = {};
        res.rows.forEach(row => {
            reports[row.reportid] = {
                objectName: row.objectname,
                date: row.date,
                timestamp: row.timestamp,
                workDone: row.workdone,
                materials: row.materials,
                groupMessageId: row.groupmessageid,
                generalMessageId: row.generalmessageid
            };
        });
        return reports;
    } catch (err) {
        console.error('Ошибка загрузки отчетов:', err.message);
        throw err;
    } finally {
        client.release();
    }
}

async function saveUser(userId, userData) {
    const { fullName, position, selectedObjects, status, isApproved, nextReportId } = userData;
    const client = await pool.connect();
    try {
        await client.query(`
            INSERT INTO users (userId, fullName, position, selectedObjects, status, isApproved, nextReportId)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (userId) DO UPDATE
            SET fullName = $2, position = $3, selectedObjects = $4, status = $5, isApproved = $6, nextReportId = $7
        `, [userId, fullName, position, JSON.stringify(selectedObjects), status, isApproved ? 1 : 0, nextReportId]);
    } catch (err) {
        console.error('Ошибка сохранения пользователя:', err.message);
        throw err;
    } finally {
        client.release();
    }
}

async function saveReport(userId, report) {
    const { reportId, objectName, date, timestamp, workDone, materials, groupMessageId, generalMessageId } = report;
    const client = await pool.connect();
    try {
        await client.query(`
            INSERT INTO reports (reportId, userId, objectName, date, timestamp, workDone, materials, groupMessageId, generalMessageId)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (reportId) DO UPDATE
            SET userId = $2, objectName = $3, date = $4, timestamp = $5, workDone = $6, materials = $7, groupMessageId = $8, generalMessageId = $9
        `, [reportId, userId, objectName, date, timestamp, workDone, materials, groupMessageId, generalMessageId]);
    } catch (err) {
        console.error('Ошибка сохранения отчета:', err.message);
        throw err;
    } finally {
        client.release();
    }
}

async function getReportText(objectName) {
    const client = await pool.connect();
    try {
        const res = await client.query(
            'SELECT r.*, u.fullName FROM reports r JOIN users u ON r.userId = u.userId WHERE r.objectName = $1 ORDER BY r.timestamp',
            [objectName]
        );
        const reportText = res.rows.map(row => {
            const timestamp = new Date(row.timestamp).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
            return `Дата: ${row.date}\nВремя: ${timestamp}\nИТР: ${row.fullname}\nОбъект: ${row.objectname}\nРаботы: ${row.workdone}\nМатериалы: ${row.materials}\n--------------------------\n`;
        }).join('');
        return reportText;
    } catch (err) {
        console.error('Ошибка получения текста отчета:', err.message);
        throw err;
    } finally {
        client.release();
    }
}

async function deletePreviousMessage(ctx, userId) {
    if (lastMessageIds[userId]) {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, lastMessageIds[userId]);
        } catch (err) {
            console.log('Не удалось удалить сообщение:', err.message);
        }
        delete lastMessageIds[userId];
    }
}

async function deleteGroupMessage(chatId, messageId) {
    try {
        await bot.telegram.deleteMessage(chatId, messageId);
    } catch (err) {
        console.error(`Ошибка удаления сообщения ${messageId} из группы ${chatId}:`, err.message);
    }
}

async function updateLastMessageId(ctx, userId, message) {
    lastMessageIds[userId] = message.message_id;
}

async function showPositionSelection(ctx, userId) {
    await deletePreviousMessage(ctx, userId);
    const buttons = POSITIONS_LIST.map(pos => [Markup.button.callback(pos, `select_initial_position_${pos}`)]);
    const message = await ctx.reply('Выберите вашу должность:', Markup.inlineKeyboard(buttons));
    updateLastMessageId(ctx, userId, message);
}

async function showObjectSelection(ctx, userId, selected = []) {
    await deletePreviousMessage(ctx, userId);
    const buttons = OBJECTS_LIST_CYRILLIC.map(obj => {
        const isSelected = selected.includes(obj);
        return [Markup.button.callback(`${isSelected ? '✅ ' : ''}${obj}`, `toggle_object_${obj}`)];
    });
    buttons.push([Markup.button.callback('Готово', 'confirm_objects')]);
    const message = await ctx.reply('Выберите объекты (можно несколько):', Markup.inlineKeyboard(buttons));
    updateLastMessageId(ctx, userId, message);
}

async function showMainMenu(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId] || {};

    await deletePreviousMessage(ctx, userId);

    const menuText = `
*🚀 Главное меню*  
━━━━━━━━━━━━━━━━━━━━  
Выберите действие ниже:  
    `.trim();

    const buttons = [
        [Markup.button.callback('👤 Личный кабинет', 'profile')],
        [Markup.button.callback('ℹ️ Помощь', 'help')]
    ];
    if (user.isApproved && user.position === 'производитель работ') {
        buttons.splice(1, 0, [Markup.button.callback('📝 Создать отчет', 'create_report')]);
    }
    if (user.isApproved) {
        buttons.splice(1, 0, [Markup.button.callback('📤 Выгрузить отчет', 'download_report')]);
    }
    if (userId === ADMIN_ID) {
        buttons.push([Markup.button.callback('👑 Админ-панель', 'admin_panel')]);
    }

    const message = await ctx.replyWithMarkdown(menuText, Markup.inlineKeyboard(buttons));
    updateLastMessageId(ctx, userId, message);
}

async function showProfile(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId] || {};
    const escapedObjects = (user.selectedObjects?.length > 0
        ? user.selectedObjects.join(', ')
        : 'Не выбраны');

    await deletePreviousMessage(ctx, userId);

    const profileText = `
*👤 Личный кабинет*  
━━━━━━━━━━━━━━━━━━━━  
*ФИО:* ${user.fullName || 'Не указано'}  
*Должность:* ${user.position || 'Не указана'}  
*Объекты:* ${escapedObjects}  
*Статус:* ${user.status || 'Не указан'}  
*Подтвержден:* ${user.isApproved ? '✅ Да' : '❌ Нет'}  
━━━━━━━━━━━━━━━━━━━━
    `.trim();

    const buttons = [
        [Markup.button.callback('✏️ ФИО', 'edit_fullName')],
        [Markup.button.callback('🏢 Должность', 'edit_position')],
        [Markup.button.callback('🏠 Объекты', 'edit_object')],
        [Markup.button.callback('📅 Статус', 'edit_status')],
        [Markup.button.callback('📋 Мои отчеты', 'view_reports')],
        [Markup.button.callback('↩️ В главное меню', 'main_menu')]
    ];

    const message = await ctx.replyWithMarkdown(profileText, Markup.inlineKeyboard(buttons));
    updateLastMessageId(ctx, userId, message);
}

async function showDownloadReport(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    await deletePreviousMessage(ctx, userId);

    if (!users[userId].isApproved) {
        const message = await ctx.reply('У вас нет прав для выгрузки отчетов.');
        updateLastMessageId(ctx, userId, message);
        return;
    }

    const buttons = OBJECTS_LIST_CYRILLIC.map(obj =>
        [Markup.button.callback(obj, `download_report_file_${obj}`)]
    );
    buttons.push([Markup.button.callback('↩️ В главное меню', 'main_menu')]);

    const message = await ctx.reply('Выберите объект для выгрузки отчета:', Markup.inlineKeyboard(buttons));
    updateLastMessageId(ctx, userId, message);
}

async function downloadReportFile(ctx, objectName) {
    const userId = ctx.from.id.toString();
    await deletePreviousMessage(ctx, userId);

    const reportText = await getReportText(objectName);
    if (!reportText) {
        const message = await ctx.reply(`Отчет для объекта "${objectName}" не найден.`,
            Markup.inlineKeyboard([[Markup.button.callback('↩️ Назад', 'download_report')]])
        );
        updateLastMessageId(ctx, userId, message);
        return;
    }

    await ctx.replyWithDocument({
        source: Buffer.from(reportText, 'utf-8'),
        filename: `${objectName}.txt`
    });
    const message = await ctx.reply('Файл успешно отправлен.',
        Markup.inlineKeyboard([[Markup.button.callback('↩️ В главное меню', 'main_menu')]])
    );
    updateLastMessageId(ctx, userId, message);
}

bot.command('getreport', async (ctx) => {
    const userId = ctx.from.id.toString();
    const chatId = ctx.chat.id.toString();
    const users = await loadUsers();
    const user = users[userId];

    if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
        await ctx.reply('Эта команда доступна только в группах.');
        return;
    }

    if (chatId !== GENERAL_GROUP_CHAT_ID) {
        await ctx.reply('Эта команда доступна только в общей группе отчетов.');
        return;
    }

    if (!user || !user.isApproved) {
        await ctx.reply('У вас нет прав для выгрузки отчетов.');
        return;
    }

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
        await ctx.reply('Укажите объект, например: /getreport Кольцевой МНПП\nДоступные объекты: ' + OBJECTS_LIST_CYRILLIC.join(', '));
        return;
    }

    const objectName = args[0];
    if (!OBJECTS_LIST_CYRILLIC.includes(objectName)) {
        await ctx.reply('Неверное название объекта. Доступные объекты: ' + OBJECTS_LIST_CYRILLIC.join(', '));
        return;
    }

    const reportText = await getReportText(objectName);
    if (!reportText) {
        await ctx.reply(`Отчет для объекта "${objectName}" не найден.`);
        return;
    }

    await ctx.replyWithDocument({
        source: Buffer.from(reportText, 'utf-8'),
        filename: `${objectName}.txt`
    });
});

bot.start(async (ctx) => {
    console.log('Обработка команды /start');
    const userId = ctx.from.id.toString();
    const users = await loadUsers();

    if (!users[userId]) {
        users[userId] = {
            fullName: '',
            position: '',
            selectedObjects: [],
            status: 'в работе',
            isApproved: false,
            nextReportId: 1,
            reports: {}
        };
        userStates[userId] = { step: 'selectPosition' };
        await saveUser(userId, users[userId]);
        await showPositionSelection(ctx, userId);
    } else if (!users[userId].isApproved) {
        await deletePreviousMessage(ctx, userId);
        const message = await ctx.reply('Ваша заявка на рассмотрении.');
        updateLastMessageId(ctx, userId, message);
    } else {
        showMainMenu(ctx);
    }
});

bot.action(/select_initial_position_(.+)/, async (ctx) => {
    const userId = ctx.from.id.toString();
    const selectedPosition = ctx.match[1];
    const users = await loadUsers();

    users[userId].position = selectedPosition;
    await saveUser(userId, users[userId]);
    userStates[userId] = { step: 'selectObjects', selectedObjects: [] };
    await deletePreviousMessage(ctx, userId);
    await showObjectSelection(ctx, userId);
});

bot.action(/toggle_object_(.+)/, async (ctx) => {
    const userId = ctx.from.id.toString();
    const objectName = ctx.match[1];
    const state = userStates[userId];

    if (!state || state.step !== 'selectObjects') return;

    const selectedObjects = state.selectedObjects;
    const index = selectedObjects.indexOf(objectName);
    if (index === -1) selectedObjects.push(objectName);
    else selectedObjects.splice(index, 1);

    await showObjectSelection(ctx, userId, selectedObjects);
});

bot.action('confirm_objects', async (ctx) => {
    const userId = ctx.from.id.toString();
    const state = userStates[userId];
    const users = await loadUsers();

    if (!state || state.step !== 'selectObjects') return;

    if (state.selectedObjects.length === 0) {
        await deletePreviousMessage(ctx, userId);
        const message = await ctx.reply('Выберите хотя бы один объект.');
        updateLastMessageId(ctx, userId, message);
        setTimeout(() => showObjectSelection(ctx, userId, state.selectedObjects), 1000);
        return;
    }

    users[userId].selectedObjects = state.selectedObjects;
    await saveUser(userId, users[userId]);

    if (state.isEditing) {
        delete userStates[userId];
        await deletePreviousMessage(ctx, userId);
        const message = await ctx.reply('Объекты успешно обновлены.');
        updateLastMessageId(ctx, userId, message);
        setTimeout(() => showProfile(ctx), 1000);
    } else {
        userStates[userId] = { step: 'fullName' };
        await deletePreviousMessage(ctx, userId);
        const message = await ctx.reply('Введите ваше ФИО:');
        updateLastMessageId(ctx, userId, message);
    }
});

bot.action('edit_object', async (ctx) => {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const currentObjects = users[userId].selectedObjects || [];
    userStates[userId] = { step: 'selectObjects', selectedObjects: [...currentObjects], isEditing: true };
    await showObjectSelection(ctx, userId, currentObjects);
});

bot.action('edit_position', async (ctx) => {
    const userId = ctx.from.id.toString();
    await deletePreviousMessage(ctx, userId);
    const buttons = POSITIONS_LIST.map(pos => [Markup.button.callback(pos, `select_position_${pos}`)]);
    buttons.push([Markup.button.callback('↩️ Назад', 'profile')]);
    const message = await ctx.reply('Выберите новую должность из списка:', Markup.inlineKeyboard(buttons));
    updateLastMessageId(ctx, userId, message);
});

bot.action(/select_position_(.+)/, async (ctx) => {
    const userId = ctx.from.id.toString();
    const selectedPosition = ctx.match[1];
    const users = await loadUsers();
    await deletePreviousMessage(ctx, userId);

    users[userId].position = selectedPosition;
    await saveUser(userId, users[userId]);
    const message = await ctx.reply(`Должность обновлена на "${selectedPosition}".`);
    updateLastMessageId(ctx, userId, message);
    setTimeout(() => showProfile(ctx), 1000);
});

async function showReports(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    await deletePreviousMessage(ctx, userId);

    users[userId].reports = await loadUserReports(userId);
    const userReports = users[userId].reports || {};
    if (Object.keys(userReports).length === 0) {
        const message = await ctx.reply('У вас пока нет отчетов.', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Назад', 'profile')]
        ]));
        updateLastMessageId(ctx, userId, message);
        return;
    }

    const buttons = users[userId].selectedObjects.map(obj => {
        const reportCount = Object.values(userReports).filter(r => r.objectName === obj).length;
        return [Markup.button.callback(`${obj} (${reportCount})`, `view_reports_by_object_${obj}`)];
    });
    buttons.push([Markup.button.callback('↩️ Назад', 'profile')]);

    const message = await ctx.reply('Выберите объект для просмотра отчетов:', Markup.inlineKeyboard(buttons));
    updateLastMessageId(ctx, userId, message);
}

async function showReportsByObject(ctx, objectName) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    await deletePreviousMessage(ctx, userId);

    users[userId].reports = await loadUserReports(userId);
    const reports = Object.entries(users[userId].reports)
        .filter(([_, report]) => report.objectName === objectName)
        .map(([reportId, report]) => ({ reportId, ...report }));

    if (reports.length === 0) {
        const message = await ctx.reply(`Нет отчетов для объекта "${objectName}".`, Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Назад', 'view_reports')]
        ]));
        updateLastMessageId(ctx, userId, message);
        return;
    }

    const days = [...new Set(reports.map(r => r.date))].sort().reverse();
    const buttons = days.map(day => [Markup.button.callback(day, `view_reports_by_day_${objectName}_${day}`)]);
    buttons.push([Markup.button.callback('↩️ Назад', 'view_reports')]);

    const message = await ctx.reply(`Выберите день для объекта "${objectName}":`, Markup.inlineKeyboard(buttons));
    updateLastMessageId(ctx, userId, message);
}

async function showReportsByDay(ctx, objectName, day) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    await deletePreviousMessage(ctx, userId);

    users[userId].reports = await loadUserReports(userId);
    const reports = Object.entries(users[userId].reports)
        .filter(([_, report]) => report.objectName === objectName && report.date === day)
        .map(([reportId, report]) => ({ reportId, timestamp: report.timestamp || reportId.split('_')[1], ...report }))
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    if (reports.length === 0) {
        const message = await ctx.reply(`Нет отчетов за ${day} для объекта "${objectName}".`, Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Назад', `view_reports_by_object_${objectName}`)]
        ]));
        updateLastMessageId(ctx, userId, message);
        return;
    }

    const buttons = reports.map(report => {
        const time = new Date(report.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        return [Markup.button.callback(`${time}`, `view_report_${report.reportId}`)];
    });
    buttons.push([Markup.button.callback('↩️ Назад', `view_reports_by_object_${objectName}`)]);

    const message = await ctx.reply(`Отчеты за ${day} для объекта "${objectName}":`, Markup.inlineKeyboard(buttons));
    updateLastMessageId(ctx, userId, message);
}

async function viewReport(ctx, reportId) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    await deletePreviousMessage(ctx, userId);

    users[userId].reports = await loadUserReports(userId);
    const report = users[userId].reports[reportId];
    if (!report) {
        const message = await ctx.reply('Отчет не найден.', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Назад', 'view_reports')]
        ]));
        updateLastMessageId(ctx, userId, message);
        return;
    }

    const timestamp = report.timestamp || reportId.split('_')[1];
    const time = new Date(timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const reportText = `
*📋 Отчет за ${report.date} (${time})*  
━━━━━━━━━━━━━━━━━━━━  
*· ИТР:* ${users[userId].fullName}  
*· Объект:* ${report.objectName}  
*· Работы:* ${report.workDone}  
*· Материалы:* ${report.materials}  
━━━━━━━━━━━━━━━━━━━━
    `.trim();

    const message = await ctx.replyWithMarkdown(reportText, Markup.inlineKeyboard([
        [Markup.button.callback('✏️ Редактировать', `edit_report_${reportId}`)],
        [Markup.button.callback('↩️ Назад', `view_reports_by_day_${report.objectName}_${report.date}`)]
    ]));
    updateLastMessageId(ctx, userId, message);
}

async function showHelp(ctx) {
    const userId = ctx.from.id.toString();
    await deletePreviousMessage(ctx, userId);

    const helpText = `
*ℹ️ Помощь*  
━━━━━━━━━━━━━━━━━━━━  
Используйте кнопки для навигации:  
- *Личный кабинет*: Просмотр и редактирование данных.  
- *Создать отчет*: Доступно для производителей работ.  
- *Мои отчеты*: Просмотр и редактирование отчетов.  
- *Выгрузить отчет*: Скачать файл через меню или /getreport в общей группе.  
- *Админ-панель*: Только для администратора (/approve).  
━━━━━━━━━━━━━━━━━━━━
    `.trim();

    const message = await ctx.replyWithMarkdown(helpText, Markup.inlineKeyboard([
        [Markup.button.callback('↩️ В главное меню', 'main_menu')]
    ]));
    updateLastMessageId(ctx, userId, message);
}

async function showAdminPanel(ctx) {
    const userId = ctx.from.id.toString();
    await deletePreviousMessage(ctx, userId);

    const adminText = `
*👑 Админ-панель*  
━━━━━━━━━━━━━━━━━━━━  
Для подтверждения пользователя используйте:  
*/approve <userId>*  
Пример: /approve 123456789  
━━━━━━━━━━━━━━━━━━━━
    `.trim();

    const message = await ctx.replyWithMarkdown(adminText, Markup.inlineKeyboard([
        [Markup.button.callback('↩️ В главное меню', 'main_menu')]
    ]));
    updateLastMessageId(ctx, userId, message);
}

bot.command('approve', async (ctx) => {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();

    if (userId !== ADMIN_ID) {
        await ctx.reply('У вас нет прав для этой команды.');
        return;
    }
    const targetUserId = ctx.message.text.split(' ')[1];
    if (!targetUserId || !users[targetUserId]) {
        await ctx.reply('Пользователь не найден. Укажите корректный ID.');
        return;
    }
    users[targetUserId].isApproved = true;
    await saveUser(targetUserId, users[targetUserId]);
    await ctx.reply(`Пользователь ${users[targetUserId].fullName} подтвержден.`);
    bot.telegram.sendMessage(targetUserId, 'Ваш профиль подтвержден администратором.');
});

// Тестовая команда
bot.command('test', async (ctx) => {
    console.log('Тестовая команда получена от:', ctx.from.id);
    await ctx.reply('Бот работает!');
});

// Исправленный /listproducers
bot.command('listproducers', async (ctx) => {
    try {
        console.log('=== Начало обработки /listproducers === от userId:', ctx.from.id);

        const client = await pool.connect();
        try {
            const res = await client.query(
                'SELECT userid, fullName, selectedObjects, status FROM users WHERE position = $1 AND isApproved = $2',
                ['производитель работ', 1]
            );

            if (res.rows.length === 0) {
                await ctx.reply('👷‍♂️ Производители работ не найдены.');
                return;
            }

            const producerList = res.rows.map((row, index) => {
                const objects = row.selectedobjects ? JSON.parse(row.selectedobjects) : [];
                const objectNames = objects.length > 0
                    ? objects.join(', ')
                    : 'Не выбраны';
                const fullName = row.fullname || 'Не указано';
                const status = row.status || 'в работе';
                return `${index + 1}. *${fullName}* (ID: ${row.userid})\n   Объекты: ${objectNames}\n   Статус: ${status}`;
            }).join('\n\n');

            await ctx.replyWithMarkdown(
                `👷‍♂️ *Список производителей работ* 👷‍♂️\n` +
                `═══════════════════════\n` +
                `${producerList}\n` +
                `═══════════════════════\n` +
                `Всего: ${res.rows.length}`
            );
            console.log('Ответ отправлен: Список производителей');
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Ошибка в /listproducers:', err.message);
        await ctx.reply('⚠️ Произошла ошибка при загрузке списка.');
    }
});

bot.action('main_menu', showMainMenu);
bot.action('profile', showProfile);
bot.action('help', showHelp);
bot.action('admin_panel', showAdminPanel);
bot.action('view_reports', showReports);
bot.action(/view_reports_by_object_(.+)/, async (ctx) => showReportsByObject(ctx, ctx.match[1]));
bot.action(/view_reports_by_day_(.+)_(.+)/, async (ctx) => showReportsByDay(ctx, ctx.match[1], ctx.match[2]));
bot.action(/view_report_(.+)/, async (ctx) => viewReport(ctx, ctx.match[1]));
bot.action('download_report', showDownloadReport);
bot.action(/download_report_file_(.+)/, async (ctx) => downloadReportFile(ctx, ctx.match[1]));

bot.action('edit_fullName', async (ctx) => {
    const userId = ctx.from.id.toString();
    await deletePreviousMessage(ctx, userId);
    userStates[userId] = { step: 'fullName' };
    const message = await ctx.reply('Введите новое ФИО:');
    updateLastMessageId(ctx, userId, message);
});

bot.action('edit_status', async (ctx) => {
    const userId = ctx.from.id.toString();
    await deletePreviousMessage(ctx, userId);
    const message = await ctx.reply('Выберите новый статус:', Markup.inlineKeyboard([
        [Markup.button.callback('В работе', 'status_work')],
        [Markup.button.callback('В отпуске', 'status_vacation')],
        [Markup.button.callback('↩️ В главное меню', 'main_menu')]
    ]));
    updateLastMessageId(ctx, userId, message);
});

bot.action('status_work', async (ctx) => {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    await deletePreviousMessage(ctx, userId);
    users[userId].status = 'в работе';
    await saveUser(userId, users[userId]);
    const message = await ctx.reply('Статус обновлен на "В работе".');
    updateLastMessageId(ctx, userId, message);
    setTimeout(() => showProfile(ctx), 1000);
});

bot.action('status_vacation', async (ctx) => {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    await deletePreviousMessage(ctx, userId);
    users[userId].status = 'в отпуске';
    await saveUser(userId, users[userId]);
    const message = await ctx.reply('Статус обновлен на "В отпуске".');
    updateLastMessageId(ctx, userId, message);
    setTimeout(() => showProfile(ctx), 1000);
});

bot.action('create_report', async (ctx) => {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    await deletePreviousMessage(ctx, userId);
    if (users[userId].position !== 'производитель работ' || !users[userId].isApproved) {
        const message = await ctx.reply('У вас нет прав для создания отчетов.');
        updateLastMessageId(ctx, userId, message);
        return;
    }
    userStates[userId] = { step: 'selectObject', report: {} };
    const buttons = users[userId].selectedObjects.map(obj => [Markup.button.callback(obj, `select_object_${obj}`)]);
    const message = await ctx.reply('Выберите объект из списка:', Markup.inlineKeyboard(buttons));
    updateLastMessageId(ctx, userId, message);
});

bot.action(/select_object_(.+)/, async (ctx) => {
    const userId = ctx.from.id.toString();
    const selectedObject = ctx.match[1];
    await deletePreviousMessage(ctx, userId);

    userStates[userId].report.objectName = selectedObject;
    userStates[userId].step = 'workDone';
    const message = await ctx.reply('Введите наименование проделанных работ (или "работы не производились"):');
    updateLastMessageId(ctx, userId, message);
});

bot.action(/edit_report_(.+)/, async (ctx) => {
    const userId = ctx.from.id.toString();
    const reportId = ctx.match[1];
    const users = await loadUsers();
    await deletePreviousMessage(ctx, userId);

    users[userId].reports = await loadUserReports(userId);
    if (!users[userId].reports[reportId]) {
        const message = await ctx.reply('Отчет не найден.', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Назад', 'view_reports')]
        ]));
        updateLastMessageId(ctx, userId, message);
        return;
    }

    userStates[userId] = { step: 'editObject', reportId: reportId, report: { ...users[userId].reports[reportId] } };
    const buttons = users[userId].selectedObjects.map(obj => [Markup.button.callback(obj, `edit_object_${obj}`)]);
    const message = await ctx.reply('Выберите новый объект из списка:', Markup.inlineKeyboard(buttons));
    updateLastMessageId(ctx, userId, message);
});

bot.action(/edit_object_(.+)/, async (ctx) => {
    const userId = ctx.from.id.toString();
    const selectedObject = ctx.match[1];
    await deletePreviousMessage(ctx, userId);

    userStates[userId].report.objectName = selectedObject;
    userStates[userId].step = 'editWorkDone';
    const message = await ctx.reply('Введите новое наименование проделанных работ (или "работы не производились"):');
    updateLastMessageId(ctx, userId, message);
});

bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;

    const userId = ctx.from.id.toString();
    const state = userStates[userId];
    const users = await loadUsers();

    if (!state) return;

    await deletePreviousMessage(ctx, userId);

    switch (state.step) {
        case 'fullName':
            users[userId].fullName = ctx.message.text;
            await saveUser(userId, users[userId]);
            delete userStates[userId];
            const fullNameMsg = await ctx.reply('ФИО обновлено.');
            updateLastMessageId(ctx, userId, fullNameMsg);
            if (!users[userId].isApproved) {
                await bot.telegram.sendMessage(ADMIN_ID,
                    `Новая заявка:\nФИО: ${users[userId].fullName}\nДолжность: ${users[userId].position || 'Не указана'}\nОбъекты: ${users[userId].selectedObjects.join(', ')}`,
                    Markup.inlineKeyboard([
                        [Markup.button.callback('✅ Одобрить', `approve_${userId}`)],
                        [Markup.button.callback('❌ Отклонить', `reject_${userId}`)]
                    ])
                );
                const userMsg = await ctx.reply('Ваша заявка отправлена на рассмотрение.');
                updateLastMessageId(ctx, userId, userMsg);
            } else {
                setTimeout(() => showProfile(ctx), 1000);
            }
            break;
        case 'workDone':
            state.report.workDone = ctx.message.text;
            userStates[userId].step = 'materials';
            const workMsg = await ctx.reply('Введите информацию о поставленных материалах (или "доставки не было"):');
            updateLastMessageId(ctx, userId, workMsg);
            break;
        case 'materials':
            state.report.materials = ctx.message.text;
            const date = new Date().toISOString().split('T')[0];
            const timestamp = new Date().toISOString();
            const reportId = `${date}_${users[userId].nextReportId++}`;
            state.report.date = date;
            state.report.timestamp = timestamp;

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
📅 *Отчет за ${date}*  
🏢 *Объект:* ${state.report.objectName}  
━━━━━━━━━━━━━━━━━━━━━ 
👷 *ИТР:* ${users[userId].fullName}  
🔧 *Выполненные работы:* ${state.report.workDone}  
📦 *Поставленные материалы:* ${state.report.materials}  
━━━━━━━━━━━━━━━━━━━━━
            `.trim();

            const groupChatId = OBJECT_GROUPS[state.report.objectName] || GENERAL_GROUP_CHAT_ID;
            const groupMessage = await bot.telegram.sendMessage(groupChatId, reportText, { parse_mode: 'Markdown' });
            const generalMessage = await bot.telegram.sendMessage(GENERAL_GROUP_CHAT_ID, reportText, { parse_mode: 'Markdown' });

            report.groupMessageId = groupMessage.message_id;
            report.generalMessageId = generalMessage.message_id;

            await saveReport(userId, report);
            await saveUser(userId, users[userId]);

            delete userStates[userId];

            const userReportMsg = await ctx.replyWithMarkdown(
                `*Ваш отчет опубликован:*\n\n*🏢 Объект:* ${state.report.objectName}\n\n*🔧 Работы:*\n${state.report.workDone}\n\n*📦 Материалы:*\n${state.report.materials}`,
                Markup.inlineKeyboard([[Markup.button.callback('↩️ В главное меню', 'main_menu')]])
            );
            updateLastMessageId(ctx, userId, userReportMsg);
            break;
        case 'editWorkDone':
            state.report.workDone = ctx.message.text;
            userStates[userId].step = 'editMaterials';
            const editWorkMsg = await ctx.reply('Введите новую информацию о поставленных материалах (или "доставки не было"):');
            updateLastMessageId(ctx, userId, editWorkMsg);
            break;
        case 'editMaterials':
            state.report.materials = ctx.message.text;
            state.report.timestamp = new Date().toISOString();

            const updatedReportText = `
📅 *Отчет за ${state.report.date} (обновлен)*  
🏢 *Объект:* ${state.report.objectName}  
━━━━━━━━━━━━━━━━━━━━━  
👷 *ИТР:* ${users[userId].fullName}  
🔧 *Выполненные работы:* ${state.report.workDone}  
📦 *Поставленные материалы:* ${state.report.materials}  
━━━━━━━━━━━━━━━━━━━━━
            `.trim();

            const updatedGroupChatId = OBJECT_GROUPS[state.report.objectName] || GENERAL_GROUP_CHAT_ID;
            users[userId].reports = await loadUserReports(userId);
            const oldReport = users[userId].reports[state.reportId];
            if (oldReport.groupMessageId) await deleteGroupMessage(updatedGroupChatId, oldReport.groupMessageId);
            if (oldReport.generalMessageId) await deleteGroupMessage(GENERAL_GROUP_CHAT_ID, oldReport.generalMessageId);

            const newGroupMessage = await bot.telegram.sendMessage(updatedGroupChatId, updatedReportText, { parse_mode: 'Markdown' });
            const newGeneralMessage = await bot.telegram.sendMessage(GENERAL_GROUP_CHAT_ID, updatedReportText, { parse_mode: 'Markdown' });

            state.report.groupMessageId = newGroupMessage.message_id;
            state.report.generalMessageId = newGeneralMessage.message_id;
            await saveReport(userId, state.report);

            delete userStates[userId];

            const updatedMsg = await ctx.replyWithMarkdown(
                `*Отчет обновлен:*\n*🏢 Объект:* ${state.report.objectName}\n*🔧 Работы:* ${state.report.workDone}\n*📦 Материалы:* ${state.report.materials}`,
                Markup.inlineKeyboard([[Markup.button.callback('↩️ К отчетам', 'view_reports')]])
            );
            updateLastMessageId(ctx, userId, updatedMsg);
            break;
    }
});

bot.action(/approve_(.+)/, async (ctx) => {
    const userId = ctx.from.id.toString();
    const targetUserId = ctx.match[1];
    const users = await loadUsers();
    if (userId !== ADMIN_ID) return;

    users[targetUserId].isApproved = true;
    await saveUser(targetUserId, users[targetUserId]);
    await ctx.editMessageText(`Заявка ${users[targetUserId].fullName} одобрена.`);
    await bot.telegram.sendMessage(targetUserId, 'Ваш профиль подтвержден администратором.');
});

bot.action(/reject_(.+)/, async (ctx) => {
    const userId = ctx.from.id.toString();
    const targetUserId = ctx.match[1];
    if (userId !== ADMIN_ID) return;

    const client = await pool.connect();
    try {
        await client.query('DELETE FROM users WHERE userId = $1', [targetUserId]);
        await client.query('DELETE FROM reports WHERE userId = $1', [targetUserId]);
        await ctx.editMessageText('Заявка отклонена.');
    } catch (err) {
        console.error('Ошибка удаления:', err.message);
    } finally {
        client.release();
    }
});

schedule.scheduleJob('0 0 19 * * *', async () => {
    console.log('Проверка отчетов в 19:00 МСК');
    const today = new Date().toISOString().split('T')[0];
    const users = await loadUsers();
    for (const userId in users) {
        const user = users[userId];
        if (user.position === 'производитель работ' && user.isApproved && user.status !== 'в отпуске') {
            user.reports = await loadUserReports(userId);
            const hasReportToday = Object.keys(user.reports).some(reportId => reportId.startsWith(today));
            if (!hasReportToday) {
                const objects = user.selectedObjects?.length > 0
                    ? user.selectedObjects.join(', ')
                    : 'Кольцевой МНПП';
                const groupChatId = user.selectedObjects?.length > 0 ? OBJECT_GROUPS[user.selectedObjects[0]] || GENERAL_GROUP_CHAT_ID : OBJECT_GROUPS['Кольцевой МНПП'];
                bot.telegram.sendMessage(
                    groupChatId,
                    `*⚠️ Напоминание*\n${user.fullName}, вы не предоставили отчет за ${today} по объектам: ${objects}. Пожалуйста, внесите данные.`,
                    { parse_mode: 'Markdown' }
                ).catch(err => console.error('Ошибка уведомления:', err));
            }
        }
    }
});

// Настройка вебхука и сервера
app.use(express.json());

app.use((req, res, next) => {
    console.log('Получен запрос:', req.method, req.url);
    next();
});

app.get('/', (req, res) => res.send('Telegram bot is running'));

app.use(bot.webhookCallback('/telegram-webhook'));

const webhookUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/telegram-webhook`;
console.log('Установка вебхука на:', webhookUrl);
bot.telegram.setWebhook(webhookUrl)
    .then(() => console.log('Вебхук успешно установлен'))
    .catch((err) => console.error('Ошибка установки вебхука:', err.message));

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}, внешний домен: ${process.env.RENDER_EXTERNAL_HOSTNAME}`);
});

// Обработка завершения процесса
process.once('SIGINT', async () => {
    console.log('Получен сигнал SIGINT, останавливаем бота');
    await pool.end();
    process.exit(0);
});

process.once('SIGTERM', async () => {
    console.log('Получен сигнал SIGTERM, начинаем остановку');
    await pool.end();
    await new Promise(resolve => setTimeout(resolve, 10000));
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('Необработанное исключение:', err.message, err.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Необработанный промис:', reason, 'Промис:', promise);
    process.exit(1);
});