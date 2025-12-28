const { Markup } = require('telegraf');
const ExcelJS = require('exceljs');
const { loadUsers } = require('../../database/userModel');
const { loadUserNeeds, saveNeed, deleteNeed, loadAllNeeds } = require('../../database/needModel');
const { clearPreviousMessages, formatDate, parseAndFormatDate } = require('../utils');
const { addMessageId, ensureUserState } = require('../utils/stateHelper');
const { escapeHtml } = require('../utils/htmlHelper');
const { incrementNextReportId } = require('../../database/userModel');
const { getNeedUsers } = require('../../database/configService');
const { getAllNeedUsers } = require('../../database/objectNeedUsersModel');
const { ADMIN_ID } = require('../../config/config');

// Маппинг типов потребностей
const TYPE_NAMES = {
    'materials': 'Материалы',
    'equipment': 'Оборудование',
    'special_equipment': 'Спецтехника',
    'office_supplies': 'Канцтовары',
    'accommodation': 'Проживание',
    'services': 'Услуги',
    'protective_clothing': 'Спецодежда',
    'accountable': 'Подотчетные'
};

const TYPE_EMOJIS = {
    'materials': '📦',
    'equipment': '⚙️',
    'special_equipment': '🚜',
    'office_supplies': '📎',
    'accommodation': '🏠',
    'services': '🔧',
    'protective_clothing': '👔',
    'accountable': '💳'
};

// Маппинг срочности
const URGENCY_NAMES = {
    'urgent': { name: 'Срочно', emoji: '🔥' },
    'soon': { name: 'В ближайшее время', emoji: '⏳' },
    'planned': { name: 'Планово', emoji: '📅' }
};

// Маппинг статусов
const STATUS_NAMES = {
    'new': 'Новая',
    'in_progress': 'В обработке',
    'completed': 'Выполнена',
    'rejected': 'Отклонена'
};

async function notifyNeedAuthorStatusChange(telegram, need, oldStatus, newStatus) {
    try {
        const oldStatusName = STATUS_NAMES[oldStatus] || oldStatus;
        const newStatusName = STATUS_NAMES[newStatus] || newStatus;
        const typeName = TYPE_NAMES[need.type] || need.type;
        
        // Получаем данные автора
        const { loadUsers } = require('../../database/userModel');
        const users = await loadUsers();
        const author = users[need.userId] || {};
        
        // Функция для форматирования должности (сокращение)
        const formatPosition = (position) => {
            if (position === 'Производитель работ') return 'Произв. работ';
            return position || '';
        };
        
        // Функция для форматирования имени (сокращение)
        const formatFullName = (fullName) => {
            if (!fullName) return '';
            const parts = fullName.trim().split(/\s+/);
            if (parts.length === 0) return '';
            if (parts.length === 1) return parts[0];
            
            const lastName = parts[0];
            const firstName = parts.length > 1 ? parts[1] : '';
            const middleName = parts.length > 2 ? parts[2] : '';
            
            let result = lastName;
            if (firstName) {
                result += ` ${firstName.charAt(0).toUpperCase()}.`;
            }
            if (middleName) {
                result += `${middleName.charAt(0).toUpperCase()}.`;
            }
            return result;
        };
        
        const position = formatPosition(author.position || '');
        const organization = author.organization || '';
        const authorName = formatFullName(author.fullName || need.fullName || '');
        
        // Эмодзи для статусов
        const oldStatusEmoji = oldStatusName === 'Выполнена' ? '✅' : oldStatusName === 'Новая' ? '🆕' : oldStatusName === 'В обработке' ? '🔄' : oldStatusName === 'Отклонена' ? '❌' : '';
        const newStatusEmoji = newStatusName === 'Выполнена' ? '✅' : newStatusName === 'Новая' ? '🆕' : newStatusName === 'В обработке' ? '🔄' : newStatusName === 'Отклонена' ? '❌' : '';
        
        const needNumber = need.number || '';
        const notificationText = `<blockquote>Изменен статус заявки ${typeName.toLowerCase()}${needNumber ? ` №${needNumber}` : ''}
${oldStatusEmoji} ${oldStatusName} → ${newStatusEmoji} ${newStatusName}
${need.objectName}

${position ? position : ''}
${organization ? organization : ''}
${authorName}

Наименование: ${need.name}</blockquote>`;
        
        await telegram.sendMessage(need.userId, notificationText, {
            parse_mode: 'HTML'
        }).catch(err => {
            console.error(`Ошибка отправки уведомления пользователю ${need.userId}:`, err);
        });
    } catch (error) {
        console.error('Ошибка в notifyNeedAuthorStatusChange:', error);
    }
}

async function notifyResponsibleUsersStatusChange(telegram, need, oldStatus, newStatus) {
    try {
        const oldStatusName = STATUS_NAMES[oldStatus] || oldStatus;
        const newStatusName = STATUS_NAMES[newStatus] || newStatus;
        const typeName = TYPE_NAMES[need.type] || need.type;
        
        // Получаем данные автора
        const { loadUsers } = require('../../database/userModel');
        const users = await loadUsers();
        const author = users[need.userId] || {};
        
        // Функция для форматирования должности (сокращение)
        const formatPosition = (position) => {
            if (position === 'Производитель работ') return 'Произв. работ';
            return position || '';
        };
        
        // Функция для форматирования имени (сокращение)
        const formatFullName = (fullName) => {
            if (!fullName) return '';
            const parts = fullName.trim().split(/\s+/);
            if (parts.length === 0) return '';
            if (parts.length === 1) return parts[0];
            
            const lastName = parts[0];
            const firstName = parts.length > 1 ? parts[1] : '';
            const middleName = parts.length > 2 ? parts[2] : '';
            
            let result = lastName;
            if (firstName) {
                result += ` ${firstName.charAt(0).toUpperCase()}.`;
            }
            if (middleName) {
                result += `${middleName.charAt(0).toUpperCase()}.`;
            }
            return result;
        };
        
        const position = formatPosition(author.position || '');
        const organization = author.organization || '';
        const authorName = formatFullName(author.fullName || need.fullName || '');
        
        // Эмодзи для статусов
        const oldStatusEmoji = oldStatusName === 'Выполнена' ? '✅' : oldStatusName === 'Новая' ? '🆕' : oldStatusName === 'В обработке' ? '🔄' : oldStatusName === 'Отклонена' ? '❌' : '';
        const newStatusEmoji = newStatusName === 'Выполнена' ? '✅' : newStatusName === 'Новая' ? '🆕' : newStatusName === 'В обработке' ? '🔄' : newStatusName === 'Отклонена' ? '❌' : '';
        
        const needNumber = need.number || '';
        const notificationText = `<blockquote>Изменен статус заявки ${typeName.toLowerCase()}${needNumber ? ` №${needNumber}` : ''}
${oldStatusEmoji} ${oldStatusName} → ${newStatusEmoji} ${newStatusName}
${need.objectName}

${position ? position : ''}
${organization ? organization : ''}
${authorName}

Наименование: ${need.name}</blockquote>`;
        
        // Get ALL responsible users for this object from ALL organizations
        const { getAllNeedUsers } = require('../../database/objectNeedUsersModel');
        const allSettings = await getAllNeedUsers();
        const normalizedObjectName = need.objectName ? need.objectName.trim() : need.objectName;
        
        // Собираем всех ответственных пользователей для данного объекта из всех организаций
        const allResponsibleUserIds = new Set();
        for (const setting of allSettings) {
            const settingObjectName = setting.objectName ? setting.objectName.trim() : setting.objectName;
            // Сравниваем нормализованные названия объектов
            if (settingObjectName === normalizedObjectName && setting.userIds && setting.userIds.length > 0) {
                setting.userIds.forEach(userId => allResponsibleUserIds.add(userId));
            }
        }
        
        const responsibleUserIdsArray = Array.from(allResponsibleUserIds);
        
        if (responsibleUserIdsArray.length === 0) {
            return; // No responsible users to notify
        }
        
        console.log(`[NEED_NOTIFICATION] Отправка уведомлений об изменении статуса заявки для объекта "${need.objectName}" ответственным пользователям:`, responsibleUserIdsArray);
        
        // Send notification to each responsible user
        const notificationPromises = responsibleUserIdsArray.map(respUserId => {
            return telegram.sendMessage(respUserId, notificationText, {
                parse_mode: 'HTML'
            }).catch(err => {
                console.error(`Ошибка отправки уведомления ответственному пользователю ${respUserId}:`, err);
            });
        });
        
        await Promise.all(notificationPromises);
    } catch (error) {
        console.error('Ошибка в notifyResponsibleUsersStatusChange:', error);
    }
}

async function notifyResponsibleUsersNewNeed(telegram, need, userOrganization) {
    try {
        const typeName = TYPE_NAMES[need.type] || need.type;
        const urgencyInfo = URGENCY_NAMES[need.urgency] || { name: need.urgency, emoji: '' };
        const { loadUsers } = require('../../database/userModel');
        const users = await loadUsers();
        const author = users[need.userId] || {};
        
        // Функция для форматирования должности (сокращение)
        const formatPosition = (position) => {
            if (position === 'Производитель работ') return 'Произв. работ';
            return position || '';
        };
        
        const position = formatPosition(author.position || '');
        const organization = author.organization || '';
        const authorName = author.fullName || need.fullName || need.userId;
        const needNumber = need.number || '';
        
        let notificationText = `<blockquote>Новая заявка ${typeName.toLowerCase()}${needNumber ? ` №${needNumber}` : ''}
${need.objectName}

${position ? position : ''}
${organization ? organization : ''}
${authorName}

Наименование: ${need.name}
Срочность: ${urgencyInfo.emoji} ${urgencyInfo.name}</blockquote>`;
        
        // Get ALL responsible users for this object from ALL organizations
        const { getAllNeedUsers } = require('../../database/objectNeedUsersModel');
        const allSettings = await getAllNeedUsers();
        const normalizedObjectName = need.objectName ? need.objectName.trim() : need.objectName;
        
        // Собираем всех ответственных пользователей для данного объекта из всех организаций
        const allResponsibleUserIds = new Set();
        for (const setting of allSettings) {
            const settingObjectName = setting.objectName ? setting.objectName.trim() : setting.objectName;
            // Сравниваем нормализованные названия объектов
            if (settingObjectName === normalizedObjectName && setting.userIds && setting.userIds.length > 0) {
                setting.userIds.forEach(userId => allResponsibleUserIds.add(userId));
            }
        }
        
        const responsibleUserIdsArray = Array.from(allResponsibleUserIds);
        
        if (responsibleUserIdsArray.length === 0) {
            return; // No responsible users to notify
        }
        
        console.log(`[NEED_NOTIFICATION] Отправка уведомлений о новой заявке для объекта "${need.objectName}" ответственным пользователям:`, responsibleUserIdsArray);
        
        // Send notification to each responsible user
        const notificationPromises = responsibleUserIdsArray.map(respUserId => {
            return telegram.sendMessage(respUserId, notificationText, {
                parse_mode: 'HTML'
            }).catch(err => {
                console.error(`Ошибка отправки уведомления ответственному пользователю ${respUserId}:`, err);
            });
        });
        
        await Promise.all(notificationPromises);
    } catch (error) {
        console.error('Ошибка в notifyResponsibleUsersNewNeed:', error);
    }
}

async function showNeedsMenu(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId];

    if (!user || !user.isApproved) {
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply('У вас нет прав для работы с заявками.');
        addMessageId(ctx, message.message_id);
        return;
    }

    // Проверяем, является ли пользователь ответственным за потребности
    let isNeedManager = false;
    if (userId === ADMIN_ID) {
        isNeedManager = true;
    } else {
        // Находим все объекты, для которых пользователь является ответственным из всех организаций
        const { getAllNeedUsers } = require('../../database/objectNeedUsersModel');
        const allSettings = await getAllNeedUsers();
        
        for (const setting of allSettings) {
            if (setting.userIds && setting.userIds.includes(userId)) {
                isNeedManager = true;
                break;
            }
        }
    }

    await clearPreviousMessages(ctx, userId);
    const state = ensureUserState(ctx);
    if (state) {
        state.messageIds = [];
    }

    const menuText = `
📦 ПОТРЕБНОСТИ
➖➖➖➖➖➖➖➖➖➖➖
    `.trim();

    const buttons = [
        [Markup.button.callback('➕ Создать заявку', 'create_need')],
        [Markup.button.callback('📋 Мои заявки', 'view_my_needs')]
    ];

    if (isNeedManager) {
        buttons.push([Markup.button.callback('⚙️ Управление заявками', 'manage_all_needs')]);
    }

    buttons.push([Markup.button.callback('↩️ Назад', 'main_menu')]);

    const message = await ctx.reply(menuText, Markup.inlineKeyboard(buttons));
    addMessageId(ctx, message.message_id);
}

async function createNeed(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId];

    if (!user || !user.isApproved) {
        return ctx.reply('У вас нет прав для создания заявок.');
    }

    await clearPreviousMessages(ctx, userId);

    const buttons = [
        [Markup.button.callback('📦 Материалы', 'select_need_type_materials')],
        [Markup.button.callback('⚙️ Оборудование', 'select_need_type_equipment')],
        [Markup.button.callback('🚜 Спецтехника', 'select_need_type_special_equipment')],
        [Markup.button.callback('👔 Спецодежда', 'select_need_type_protective_clothing')],
        [Markup.button.callback('📎 Канцтовары', 'select_need_type_office_supplies')],
        [Markup.button.callback('🏠 Проживание', 'select_need_type_accommodation')],
        [Markup.button.callback('🔧 Услуги', 'select_need_type_services')],
        [Markup.button.callback('💳 Подотчетные', 'select_need_type_accountable')],
        [Markup.button.callback('↩️ Назад', 'needs')]
    ];

    const message = await ctx.reply('Выберите тип потребности:', Markup.inlineKeyboard(buttons));
    addMessageId(ctx, message.message_id);
}

async function selectNeedType(ctx, type) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId];

    if (!user || !user.isApproved) {
        return ctx.reply('У вас нет прав для создания заявок.');
    }

    const userObjects = user.selectedObjects;
    if (!userObjects || userObjects.length === 0) {
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply('У вас не выбрано ни одного объекта в личном кабинете.');
        addMessageId(ctx, message.message_id);
        return;
    }

    await clearPreviousMessages(ctx, userId);

    const state = ensureUserState(ctx);
    if (state) {
        state.step = 'needObject';
        state.need = { type, objectName: null, name: null, urgency: null };
    }

    const buttons = userObjects.map((obj, index) => [Markup.button.callback(obj, `select_need_object_${index}`)]);
    buttons.push([Markup.button.callback('↩️ Назад', 'create_need')]);

    const message = await ctx.reply('Выберите объект:', Markup.inlineKeyboard(buttons));
    addMessageId(ctx, message.message_id);
}

async function showUserNeeds(ctx) {
    const userId = ctx.from.id.toString();
    const needs = await loadUserNeeds(userId).catch(err => {
        return {};
    });

    await clearPreviousMessages(ctx, userId);

    if (Object.keys(needs).length === 0) {
        const message = await ctx.reply('У вас пока нет заявок.', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Назад', 'needs')]
        ]));
        addMessageId(ctx, message.message_id);
        return;
    }

    // Фильтруем только заявки с валидным objectName
    const needsArray = Object.values(needs).filter(n => n && n.objectName);
    const uniqueObjects = [...new Set(needsArray.map(n => n.objectName.trim()).filter(obj => obj))];
    const buttons = uniqueObjects.map((obj, index) => [Markup.button.callback(obj, `select_need_list_object_${index}`)]);
    buttons.push([Markup.button.callback('↩️ Назад', 'needs')]);

    const message = await ctx.reply('Выберите объект для просмотра заявок:', Markup.inlineKeyboard(buttons));
    addMessageId(ctx, message.message_id);
}

async function showNeedDates(ctx, objectIndex, page = 0) {
    const userId = ctx.from.id.toString();
    const needs = await loadUserNeeds(userId);
    const uniqueObjects = [...new Set(Object.values(needs).map(n => n.objectName))];
    const objectName = uniqueObjects[objectIndex];

    await clearPreviousMessages(ctx, userId);

    const normalizedObjectName = objectName && objectName.trim();
    const objectNeeds = Object.values(needs).filter(n =>
        n.objectName && n.objectName.trim() === normalizedObjectName
    );
    const sortedNeeds = objectNeeds.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const uniqueDatesArray = [...new Set(sortedNeeds.map(n => parseAndFormatDate(n.date)))];
    // Сортируем даты в обратном порядке (новые первыми)
    const uniqueDates = uniqueDatesArray.sort((a, b) => {
        // Парсим даты в формате ДД.ММ.ГГГГ для сравнения
        const parseDate = (dateStr) => {
            const [day, month, year] = dateStr.split('.').map(Number);
            return new Date(year, month - 1, day);
        };
        return parseDate(b).getTime() - parseDate(a).getTime();
    });

    const itemsPerPage = 10;
    const totalPages = Math.ceil(uniqueDates.length / itemsPerPage);
    const pageNum = typeof page === 'number' ? page : 0;

    const startIndex = pageNum * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, uniqueDates.length);
    const currentDates = uniqueDates.slice(startIndex, endIndex);

    if (currentDates.length === 0) {
        return ctx.reply('Ошибка: нет дат для отображения.', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Назад', 'view_my_needs')]
        ]));
    }

    const dateButtons = currentDates.map((date, index) => {
        const dateIndexInFullList = uniqueDates.indexOf(date);
        return [Markup.button.callback(date, `select_need_date_${objectIndex}_${dateIndexInFullList}`)];
    });

    const buttons = [];
    const paginationButtons = [];
    if (totalPages > 1) {
        if (pageNum > 0) paginationButtons.push(Markup.button.callback('⬅️ Назад', `need_dates_page_${objectIndex}_${pageNum - 1}`));
        if (pageNum < totalPages - 1) paginationButtons.push(Markup.button.callback('Вперед ➡️', `need_dates_page_${objectIndex}_${pageNum + 1}`));
    }
    if (paginationButtons.length > 0) buttons.push(paginationButtons);
    buttons.push(...dateButtons);
    buttons.push([Markup.button.callback('↩️ Назад', 'view_my_needs')]);

    const message = await ctx.reply(
        `Выберите дату для объекта "${objectName}" (Страница ${pageNum + 1} из ${totalPages}):`,
        Markup.inlineKeyboard(buttons)
    );
    addMessageId(ctx, message.message_id);
}

async function showNeedItems(ctx, objectIndex, dateIndex, page = 0) {
    const userId = ctx.from.id.toString();
    const needs = await loadUserNeeds(userId);
    // Фильтруем только заявки с валидным objectName
    const needsArray = Object.values(needs).filter(n => n && n.objectName);
    const uniqueObjects = [...new Set(needsArray.map(n => n.objectName.trim()).filter(obj => obj))];
    const objectName = uniqueObjects[objectIndex];
    
    if (!objectName) {
        console.log(`[USER_NEEDS] showNeedItems: объект не найден по индексу ${objectIndex}, uniqueObjects.length=${uniqueObjects.length}`);
        return ctx.reply('Ошибка: объект не найден.');
    }
    const normalizedObjectName = objectName.trim();
    const objectNeeds = Object.entries(needs).filter(([_, n]) =>
        n.objectName && n.objectName.trim() === normalizedObjectName
    );

    const sortedNeeds = objectNeeds.sort((a, b) => b[1].timestamp.localeCompare(a[1].timestamp));
    // Получаем уникальные даты и сортируем их в обратном порядке (новые первыми)
    const uniqueDatesArray = [...new Set(sortedNeeds.map(([, n]) => parseAndFormatDate(n.date)))];
    const uniqueDatesSorted = uniqueDatesArray.sort((a, b) => {
        // Парсим даты в формате ДД.ММ.ГГГГ для сравнения
        const parseDate = (dateStr) => {
            const [day, month, year] = dateStr.split('.').map(Number);
            return new Date(year, month - 1, day);
        };
        return parseDate(b).getTime() - parseDate(a).getTime();
    });
    const selectedDate = uniqueDatesSorted[dateIndex];
    
    if (!selectedDate) {
        console.log(`[USER_NEEDS] showNeedItems: ОШИБКА: дата не найдена по индексу ${dateIndex}, uniqueDatesSorted.length=${uniqueDatesSorted.length}`);
        return ctx.reply('Ошибка: дата не найдена.');
    }

    await clearPreviousMessages(ctx, userId);

    const dateNeeds = sortedNeeds.filter(([_, n]) => parseAndFormatDate(n.date) === selectedDate);

    const itemsPerPage = 10;
    const totalPages = Math.ceil(dateNeeds.length / itemsPerPage);
    const pageNum = typeof page === 'number' ? page : 0;

    const startIndex = pageNum * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, dateNeeds.length);
    const currentNeeds = dateNeeds.slice(startIndex, endIndex);

    if (currentNeeds.length === 0) {
        return ctx.reply('Ошибка: нет заявок для отображения.');
    }

    // Функция для форматирования должности (сокращение)
    const formatPosition = (position) => {
        if (position === 'Производитель работ') return 'Произв. работ';
        return position || '';
    };

    // Функция для сокращения ФИО: "Иванов Иван Иванович" -> "Иванов И.И."
    const formatFullName = (fullName) => {
        if (!fullName) return '';
        const parts = fullName.trim().split(/\s+/);
        if (parts.length === 0) return '';
        if (parts.length === 1) return parts[0];
        
        const lastName = parts[0];
        const firstName = parts.length > 1 ? parts[1] : '';
        const middleName = parts.length > 2 ? parts[2] : '';
        
        let result = lastName;
        if (firstName) {
            result += ` ${firstName.charAt(0).toUpperCase()}.`;
        }
        if (middleName) {
            result += `${middleName.charAt(0).toUpperCase()}.`;
        }
        return result;
    };

    const users = await loadUsers();
    const itemButtons = currentNeeds.map(([needId, need]) => {
        const typeName = TYPE_NAMES[need.type] || need.type;
        const typeEmoji = TYPE_EMOJIS[need.type] || '📦';
        const needUser = users[need.userId] || {};
        const position = formatPosition(needUser.position || '');
        const fullName = formatFullName(needUser.fullName || need.fullName || '');
        const label = `${typeEmoji} ${typeName} -> ${position} ${fullName}`.trim();
        return [Markup.button.callback(label.length > 64 ? label.substring(0, 61) + '...' : label, `select_need_item_${needId}`)];
    });

    const buttons = [];
    const paginationButtons = [];
    if (totalPages > 1) {
        if (pageNum > 0) paginationButtons.push(Markup.button.callback('⬅️ Назад', `need_items_page_${objectIndex}_${dateIndex}_${pageNum - 1}`));
        if (pageNum < totalPages - 1) paginationButtons.push(Markup.button.callback('Вперед ➡️', `need_items_page_${objectIndex}_${dateIndex}_${pageNum + 1}`));
    }
    if (paginationButtons.length > 0) buttons.push(paginationButtons);
    buttons.push(...itemButtons);
    buttons.push([Markup.button.callback('↩️ Назад', `select_need_list_object_${objectIndex}`)]);

    try {
        const message = await ctx.reply(
            `Выберите заявку для объекта "${objectName}" за ${selectedDate} (Страница ${pageNum + 1} из ${totalPages}):`,
            Markup.inlineKeyboard(buttons)
        );
        addMessageId(ctx, message.message_id);
    } catch (error) {
        console.error('Ошибка отправки сообщения со списком заявок:', error);
        // Не пробрасываем ошибку дальше, чтобы не создавать дополнительные запросы
    }
}

async function showNeedDetails(ctx, needId) {
    const userId = ctx.from.id.toString();
    const needs = await loadUserNeeds(userId);
    
    console.log('[NEED DEBUG] showNeedDetails - needId:', needId);
    console.log('[NEED DEBUG] showNeedDetails - userId:', userId);
    console.log('[NEED DEBUG] showNeedDetails - needs keys:', Object.keys(needs));
    console.log('[NEED DEBUG] showNeedDetails - need exists:', !!needs[needId]);
    
    const need = needs[needId];

    await clearPreviousMessages(ctx, userId);

    if (!need) {
        console.log('[NEED DEBUG] showNeedDetails - Need not found, available needIds:', Object.keys(needs));
        return ctx.reply('Ошибка: заявка не найдена.');
    }

    const formattedDate = parseAndFormatDate(need.date);
    const dateTime = new Date(need.timestamp);
    const dateStr = dateTime.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = dateTime.toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const typeName = TYPE_NAMES[need.type] || need.type;
    const urgencyInfo = URGENCY_NAMES[need.urgency] || { name: need.urgency, emoji: '' };
    const statusName = STATUS_NAMES[need.status] || need.status;
    const statusEmoji = statusName === 'Выполнена' ? '✅' : statusName === 'Новая' ? '🆕' : statusName === 'В обработке' ? '🔄' : statusName === 'Отклонена' ? '❌' : '';

    const users = await loadUsers();
    const needUser = users[need.userId] || {};
    
    // Функция для форматирования должности (сокращение)
    const formatPosition = (position) => {
        if (position === 'Производитель работ') return 'Произв. работ';
        return position || '';
    };
    
    const position = formatPosition(needUser.position || '');
    const organization = needUser.organization || '';
    const fullName = needUser.fullName || need.fullName || '';
    const needNumber = need.number || '';

    let needText = `<blockquote>Заявка на ${typeName.toLowerCase()}${needNumber ? ` №${needNumber}` : ''}
${escapeHtml(need.objectName)}
${dateStr} ${timeStr}

${position ? escapeHtml(position) : ''}
${organization ? escapeHtml(organization) : ''}
${escapeHtml(fullName)}

Наименование: ${escapeHtml(need.name)}
Срочность: ${urgencyInfo.emoji} ${urgencyInfo.name}
Статус: ${statusEmoji} ${statusName}</blockquote>`;

    const uniqueObjects = [...new Set(Object.values(needs).map(n => n.objectName))];
    const normalizedNeedObjectName = need.objectName && need.objectName.trim();
    const objectNeeds = Object.values(needs).filter(n =>
        n.objectName && n.objectName.trim() === normalizedNeedObjectName
    );
    const sortedNeeds = objectNeeds.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const uniqueDates = [...new Set(sortedNeeds.map(n => parseAndFormatDate(n.date)))];
    const needDate = parseAndFormatDate(need.date);
    const dateNeeds = sortedNeeds.filter(n => parseAndFormatDate(n.date) === needDate);
    const needIndexInDate = dateNeeds.findIndex(n => n.needId === needId);

    const buttons = [
        [Markup.button.callback('✏️ Редактировать', `edit_need_${needId}`)],
        [Markup.button.callback('🗑️ Удалить', `delete_need_${needId}`)],
        [Markup.button.callback('↩️ Назад', `select_need_date_${uniqueObjects.indexOf(need.objectName)}_${uniqueDates.indexOf(needDate)}`)]
    ];

    try {
        const message = await ctx.reply(needText.trim(), {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard(buttons)
        });
        addMessageId(ctx, message.message_id);
    } catch (error) {
        console.error('Ошибка отправки деталей заявки:', error);
        // Не пробрасываем ошибку дальше, чтобы не создавать дополнительные запросы
    }
}

async function editNeed(ctx, needId) {
    const userId = ctx.from.id.toString();
    const needs = await loadUserNeeds(userId);
    
    console.log('[NEED DEBUG] editNeed - needId:', needId);
    console.log('[NEED DEBUG] editNeed - userId:', userId);
    console.log('[NEED DEBUG] editNeed - needs keys:', Object.keys(needs));
    console.log('[NEED DEBUG] editNeed - need exists:', !!needs[needId]);
    
    const need = needs[needId];

    if (!need) {
        console.log('[NEED DEBUG] editNeed - Need not found, available needIds:', Object.keys(needs));
        await clearPreviousMessages(ctx, userId);
        return ctx.reply('Ошибка: не удалось найти заявку для редактирования.');
    }

    await clearPreviousMessages(ctx, userId);

    const buttons = [
        [Markup.button.callback('📝 Наименование', `edit_need_name_${needId}`)],
        [Markup.button.callback('⏰ Срочность', `edit_need_urgency_${needId}`)],
        [Markup.button.callback('↩️ Назад', `select_need_item_${needId}`)]
    ];

    const message = await ctx.reply('Что вы хотите изменить?', Markup.inlineKeyboard(buttons));
    addMessageId(ctx, message.message_id);
}

async function deleteNeedConfirmation(ctx, needId) {
    const userId = ctx.from.id.toString();
    const needs = await loadUserNeeds(userId);
    
    console.log('[NEED DEBUG] deleteNeedConfirmation - needId:', needId);
    console.log('[NEED DEBUG] deleteNeedConfirmation - userId:', userId);
    console.log('[NEED DEBUG] deleteNeedConfirmation - needs keys:', Object.keys(needs));
    console.log('[NEED DEBUG] deleteNeedConfirmation - need exists:', !!needs[needId]);
    
    const need = needs[needId];

    if (!need) {
        console.log('[NEED DEBUG] deleteNeedConfirmation - Need not found, available needIds:', Object.keys(needs));
        await clearPreviousMessages(ctx, userId);
        return ctx.reply('Ошибка: заявка не найдена.');
    }

    await clearPreviousMessages(ctx, userId);

    const buttons = [
        [Markup.button.callback('✅ Да, удалить', `confirm_delete_need_${needId}`)],
        [Markup.button.callback('❌ Отмена', `select_need_item_${needId}`)]
    ];

    const message = await ctx.reply(`Вы уверены, что хотите удалить заявку "${need.name}"?`, Markup.inlineKeyboard(buttons));
    addMessageId(ctx, message.message_id);
}

async function confirmDeleteNeed(ctx, needId) {
    const userId = ctx.from.id.toString();
    
    console.log('[NEED DEBUG] confirmDeleteNeed - needId:', needId);
    console.log('[NEED DEBUG] confirmDeleteNeed - userId:', userId);

    try {
        console.log('[NEED DEBUG] confirmDeleteNeed - calling deleteNeed...');
        await deleteNeed(userId, needId);
        console.log('[NEED DEBUG] confirmDeleteNeed - deleteNeed completed successfully');
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply('✅ Заявка успешно удалена.', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Назад', 'view_my_needs')]
        ]));
        addMessageId(ctx, message.message_id);
    } catch (error) {
        console.error('Ошибка удаления заявки:', error);
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply('Ошибка при удалении заявки. Попробуйте позже.', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Назад', 'view_my_needs')]
        ]));
        addMessageId(ctx, message.message_id);
    }
}

async function manageDeleteNeedConfirmation(ctx, needId) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId];

    if (!user || !user.isApproved) return;

    let isNeedManager = userId === ADMIN_ID;
    const managedObjects = [];
    
    if (!isNeedManager) {
        const allSettings = await getAllNeedUsers();
        
        for (const setting of allSettings) {
            if (setting.userIds && setting.userIds.includes(userId)) {
                const normalizedObjectName = setting.objectName ? setting.objectName.trim() : setting.objectName;
                if (normalizedObjectName && !managedObjects.includes(normalizedObjectName)) {
                    managedObjects.push(normalizedObjectName);
                    isNeedManager = true;
                }
            }
        }
    }

    if (!isNeedManager) return;

    try {
        const allNeeds = await loadAllNeeds();
        const need = allNeeds[needId];

        if (!need) {
            await clearPreviousMessages(ctx, userId);
            return ctx.reply('Ошибка: заявка не найдена.');
        }

        const normalizedNeedObjectName = need.objectName ? need.objectName.trim() : need.objectName;
        if (userId !== ADMIN_ID && !managedObjects.some(obj => obj.trim() === normalizedNeedObjectName)) {
            await clearPreviousMessages(ctx, userId);
            return ctx.reply('У вас нет прав для удаления этой заявки.');
        }

        await clearPreviousMessages(ctx, userId);

        const buttons = [
            [Markup.button.callback('✅ Да, удалить', `manage_confirm_delete_need_${needId}`)],
            [Markup.button.callback('❌ Отмена', `manage_select_need_${needId}`)]
        ];

        const message = await ctx.reply(`Вы уверены, что хотите удалить заявку "${need.name}"?`, Markup.inlineKeyboard(buttons));
        addMessageId(ctx, message.message_id);
    } catch (error) {
        console.error('Ошибка в manageDeleteNeedConfirmation:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
    }
}

async function manageConfirmDeleteNeed(ctx, needId) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId];

    if (!user || !user.isApproved) return;

    let isNeedManager = userId === ADMIN_ID;
    const managedObjects = [];
    
    if (!isNeedManager) {
        const allSettings = await getAllNeedUsers();
        
        for (const setting of allSettings) {
            if (setting.userIds && setting.userIds.includes(userId)) {
                const normalizedObjectName = setting.objectName ? setting.objectName.trim() : setting.objectName;
                if (normalizedObjectName && !managedObjects.includes(normalizedObjectName)) {
                    managedObjects.push(normalizedObjectName);
                    isNeedManager = true;
                }
            }
        }
    }

    if (!isNeedManager) return;

    try {
        const allNeeds = await loadAllNeeds();
        const need = allNeeds[needId];

        if (!need) {
            await clearPreviousMessages(ctx, userId);
            return ctx.reply('Ошибка: заявка не найдена.');
        }

        const normalizedNeedObjectName = need.objectName ? need.objectName.trim() : need.objectName;
        if (userId !== ADMIN_ID && !managedObjects.some(obj => obj.trim() === normalizedNeedObjectName)) {
            await clearPreviousMessages(ctx, userId);
            return ctx.reply('У вас нет прав для удаления этой заявки.');
        }

        const { connectMongo } = require('../../database/config/mongoConfig');
        const db = await connectMongo();
        const needsCollection = db.collection('needs');
        const result = await needsCollection.deleteOne({ needid: needId });
        if (result.deletedCount === 0) {
            throw new Error('Заявка не была удалена');
        }

        console.log(`Заявка удалена (управление): needId=${needId}, userId=${userId}`);

        await clearPreviousMessages(ctx, userId);
        
        // Определяем кнопку "Назад" в зависимости от статуса заявки
        const state = ensureUserState(ctx);
        let backButton = 'manage_all_needs';
        if (state && state.managedNeedsObjectsList) {
            const needObjectIndex = state.managedNeedsObjectsList.findIndex(obj => obj.trim() === normalizedNeedObjectName);
            if (needObjectIndex !== -1) {
                if (need.status === 'completed' || need.status === 'rejected') {
                    backButton = `manage_needs_archive_object_${needObjectIndex}_page_0`;
                } else {
                    backButton = `manage_needs_object_${needObjectIndex}_dates_page_0`;
                }
            }
        }

        const message = await ctx.reply('✅ Заявка успешно удалена.', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Назад', backButton)]
        ]));
        addMessageId(ctx, message.message_id);
    } catch (error) {
        console.error('Ошибка удаления заявки (управление):', error);
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply('Ошибка при удалении заявки. Попробуйте позже.', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Назад', `manage_select_need_${needId}`)]
        ]));
        addMessageId(ctx, message.message_id);
    }
}

async function manageAllNeeds(ctx) {
    console.log('[MANAGED_NEEDS] manageAllNeeds CALLED');
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId];

    if (!user || !user.isApproved) {
        console.log('[MANAGED_NEEDS] manageAllNeeds: пользователь не найден или не одобрен');
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply('У вас нет прав для управления заявками.');
        addMessageId(ctx, message.message_id);
        return;
    }

    // Проверяем, является ли пользователь ответственным или администратором
    let isNeedManager = userId === ADMIN_ID;
    const managedObjects = [];
    
    if (!isNeedManager) {
        // Находим все объекты, для которых пользователь является ответственным из всех организаций
        const allSettings = await getAllNeedUsers();
        
        for (const setting of allSettings) {
            if (setting.userIds && setting.userIds.includes(userId)) {
                const normalizedObjectName = setting.objectName ? setting.objectName.trim() : setting.objectName;
                if (normalizedObjectName && !managedObjects.includes(normalizedObjectName)) {
                    managedObjects.push(normalizedObjectName);
                    isNeedManager = true;
                }
            }
        }
    }

    if (!isNeedManager) {
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply('У вас нет прав для управления заявками.');
        addMessageId(ctx, message.message_id);
        return;
    }

    try {
        const allNeeds = await loadAllNeeds();
        
        // Если не администратор, фильтруем по объектам пользователя
        let filteredNeeds = allNeeds;
        if (userId !== ADMIN_ID) {
            const needsMap = {};
            Object.values(allNeeds).forEach(need => {
                // Нормализуем названия объектов для сравнения
                const needObjectName = need.objectName ? need.objectName.trim() : need.objectName;
                if (needObjectName && managedObjects.includes(needObjectName)) {
                    needsMap[need.needId] = need;
                }
            });
            filteredNeeds = needsMap;
        }

        // Фильтруем только заявки с валидным objectName (как в showAllNeedsByObjects)
        const needsArray = Object.values(filteredNeeds).filter(n => n && n.objectName);
        const uniqueObjects = [...new Set(needsArray.map(n => n.objectName.trim()).filter(obj => obj))];

        if (uniqueObjects.length === 0) {
            await clearPreviousMessages(ctx, userId);
            const message = await ctx.reply('Заявок на потребности пока нет.', Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Назад', 'needs')]
            ]));
            addMessageId(ctx, message.message_id);
            return;
        }

        await clearPreviousMessages(ctx, userId);

        // Подсчет статистики
        const allNeedsForStats = Object.values(filteredNeeds);
        
        // Статусы
        const newNeeds = allNeedsForStats.filter(n => n.status === 'new');
        const inProgressNeeds = allNeedsForStats.filter(n => n.status === 'in_progress');
        const completedNeeds = allNeedsForStats.filter(n => n.status === 'completed');
        const rejectedNeeds = allNeedsForStats.filter(n => n.status === 'rejected');
        
        // Не закрытые (Новая + В обработке)
        const notClosedCount = newNeeds.length + inProgressNeeds.length;
        
        // Разбивка новых по срочности
        const newUrgent = newNeeds.filter(n => n.urgency === 'urgent').length;
        const newSoon = newNeeds.filter(n => n.urgency === 'soon').length;
        const newPlanned = newNeeds.filter(n => n.urgency === 'planned').length;
        
        // Разбивка в обработке по срочности
        const inProgressUrgent = inProgressNeeds.filter(n => n.urgency === 'urgent').length;
        const inProgressSoon = inProgressNeeds.filter(n => n.urgency === 'soon').length;
        const inProgressPlanned = inProgressNeeds.filter(n => n.urgency === 'planned').length;
        
        // Формирование текста статистики с HTML форматированием
        let statsText = `<b><u>Не закрытых заявок: ${notClosedCount}, в том числе:</u></b>\n`;
        
        if (newNeeds.length > 0) {
            const urgencyParts = [];
            if (newUrgent > 0) urgencyParts.push(`срочно: ${newUrgent}`);
            if (newSoon > 0) urgencyParts.push(`в ближайшее время: ${newSoon}`);
            if (newPlanned > 0) urgencyParts.push(`планово: ${newPlanned}`);
            statsText += `Новых: ${newNeeds.length}${urgencyParts.length > 0 ? ` (${urgencyParts.join(', ')})` : ''}\n`;
        }
        
        if (inProgressNeeds.length > 0) {
            const urgencyParts = [];
            if (inProgressUrgent > 0) urgencyParts.push(`срочно: ${inProgressUrgent}`);
            if (inProgressSoon > 0) urgencyParts.push(`в ближайшее время: ${inProgressSoon}`);
            if (inProgressPlanned > 0) urgencyParts.push(`планово: ${inProgressPlanned}`);
            statsText += `В обработке: ${inProgressNeeds.length}${urgencyParts.length > 0 ? ` (${urgencyParts.join(', ')})` : ''}\n`;
        }
        
        if (completedNeeds.length > 0) {
            statsText += `\n<b><u>Выполненных заявок: ${completedNeeds.length}</u></b>\n`;
        }
        
        if (rejectedNeeds.length > 0) {
            statsText += `\n<b><u>Отклоненных заявок: ${rejectedNeeds.length}</u></b>`;
        }

        const buttons = [
            [Markup.button.callback('📊 Все заявки в Excel', 'download_all_needs_excel')],
            [Markup.button.callback('📋 Заявки по объектам', 'manage_needs_objects')],
            [Markup.button.callback('↩️ Назад', 'needs')]
        ];

        const messageText = `⚙️ Управление заявками\n\n${statsText}`;
        const message = await ctx.reply(messageText, {
            parse_mode: 'HTML',
            reply_markup: Markup.inlineKeyboard(buttons).reply_markup
        });
        addMessageId(ctx, message.message_id);
        
        const state = ensureUserState(ctx);
        if (state) {
            state.managedNeedsObjectsList = uniqueObjects;
            state.managedNeedsFilteredNeeds = filteredNeeds;
        }
    } catch (error) {
        console.error('Ошибка в manageAllNeeds:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
    }
}

async function showManagedNeedsObjects(ctx, page = 0) {
    console.log(`[MANAGED_NEEDS] showManagedNeedsObjects CALLED: page=${page}`);
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId];

    if (!user || !user.isApproved) {
        console.log(`[MANAGED_NEEDS] showManagedNeedsObjects: пользователь не найден или не одобрен`);
        return;
    }

    let isNeedManager = userId === ADMIN_ID;
    const managedObjects = [];
    
    if (!isNeedManager) {
        const allSettings = await getAllNeedUsers();
        
        for (const setting of allSettings) {
            if (setting.userIds && setting.userIds.includes(userId)) {
                const normalizedObjectName = setting.objectName ? setting.objectName.trim() : setting.objectName;
                if (normalizedObjectName && !managedObjects.includes(normalizedObjectName)) {
                    managedObjects.push(normalizedObjectName);
                    isNeedManager = true;
                }
            }
        }
    }

    if (!isNeedManager) return;

    try {
        const allNeeds = await loadAllNeeds();
        
        let filteredNeeds = allNeeds;
        if (userId !== ADMIN_ID) {
            const needsMap = {};
            Object.values(allNeeds).forEach(need => {
                const needObjectName = need.objectName ? need.objectName.trim() : need.objectName;
                if (needObjectName && managedObjects.includes(needObjectName)) {
                    needsMap[need.needId] = need;
                }
            });
            filteredNeeds = needsMap;
        }

        const needsArray = Object.values(filteredNeeds).filter(n => n && n.objectName);
        const uniqueObjects = [...new Set(needsArray.map(n => n.objectName.trim()).filter(obj => obj))];

        if (uniqueObjects.length === 0) {
            await clearPreviousMessages(ctx, userId);
            const message = await ctx.reply('Заявок на потребности пока нет.', Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Назад', 'manage_all_needs')]
            ]));
            addMessageId(ctx, message.message_id);
            return;
        }

        await clearPreviousMessages(ctx, userId);

        const itemsPerPage = 10;
        const totalPages = Math.ceil(uniqueObjects.length / itemsPerPage);
        const pageNum = typeof page === 'number' ? page : 0;
        const startIndex = pageNum * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, uniqueObjects.length);
        const currentObjects = uniqueObjects.slice(startIndex, endIndex);

        const buttons = currentObjects.map((obj, index) => {
            // Фильтруем заявки без архивных (completed и rejected)
            const objectNeeds = Object.values(filteredNeeds).filter(n =>
                n.objectName && 
                n.objectName.trim() === obj.trim() && 
                n.status !== 'completed' && 
                n.status !== 'rejected'
            );
            const displayObj = obj.length > 30 ? obj.substring(0, 27) + '...' : obj;
            const globalIndex = uniqueObjects.indexOf(obj);
            return [Markup.button.callback(`${displayObj} (${objectNeeds.length})`, `manage_needs_object_${globalIndex}`)];
        });

        const paginationButtons = [];
        if (totalPages > 1) {
            if (pageNum > 0) paginationButtons.push(Markup.button.callback('⬅️ Назад', `manage_needs_objects_page_${pageNum - 1}`));
            if (pageNum < totalPages - 1) paginationButtons.push(Markup.button.callback('Вперед ➡️', `manage_needs_objects_page_${pageNum + 1}`));
        }
        if (paginationButtons.length > 0) buttons.push(paginationButtons);

        buttons.push([Markup.button.callback('↩️ Назад', 'manage_all_needs')]);

        const message = await ctx.reply(
            `📋 Заявки по объектам (Страница ${pageNum + 1} из ${totalPages}):`,
            Markup.inlineKeyboard(buttons)
        );
        addMessageId(ctx, message.message_id);
        
        const state = ensureUserState(ctx);
        if (state) {
            state.managedNeedsObjectsList = uniqueObjects;
            state.managedNeedsFilteredNeeds = filteredNeeds;
        }
    } catch (error) {
        console.error('Ошибка в showManagedNeedsObjects:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
    }
}

async function downloadAllNeedsExcel(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId];

    if (!user || !user.isApproved) {
        return ctx.reply('У вас нет прав для выгрузки данных.');
    }

    let isNeedManager = userId === ADMIN_ID;
    const managedObjects = [];
    
    if (!isNeedManager) {
        const allSettings = await getAllNeedUsers();
        
        for (const setting of allSettings) {
            if (setting.userIds && setting.userIds.includes(userId)) {
                const normalizedObjectName = setting.objectName ? setting.objectName.trim() : setting.objectName;
                if (normalizedObjectName && !managedObjects.includes(normalizedObjectName)) {
                    managedObjects.push(normalizedObjectName);
                    isNeedManager = true;
                }
            }
        }
    }

    if (!isNeedManager) {
        return ctx.reply('У вас нет прав для выгрузки данных.');
    }

    try {
        const allNeeds = await loadAllNeeds();
        
        let filteredNeeds = allNeeds;
        if (userId !== ADMIN_ID) {
            const needsMap = {};
            Object.values(allNeeds).forEach(need => {
                const needObjectName = need.objectName ? need.objectName.trim() : need.objectName;
                if (needObjectName && managedObjects.includes(needObjectName)) {
                    needsMap[need.needId] = need;
                }
            });
            filteredNeeds = needsMap;
        }

        const needsArray = Object.values(filteredNeeds).filter(n => n && n.objectName);

        if (needsArray.length === 0) {
            return ctx.reply('Заявок для выгрузки не найдено.');
        }

        await clearPreviousMessages(ctx, userId);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Заявки');

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
        
        // Стили для цветового выделения строк
        const completedRowCenteredStyle = {
            font: { name: 'Arial', size: 9 },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } },
            alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
            border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
        };
        const completedRowPaddedStyle = {
            font: { name: 'Arial', size: 9 },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } },
            alignment: { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 },
            border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
        };
        
        const rejectedRowCenteredStyle = {
            font: { name: 'Arial', size: 9 },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } },
            alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
            border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
        };
        const rejectedRowPaddedStyle = {
            font: { name: 'Arial', size: 9 },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } },
            alignment: { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 },
            border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
        };

        worksheet.getRow(1).values = ['№', 'Объект', 'Дата', 'Время', 'Тип', 'Наименование', 'Срочность', 'Статус', 'Должность', 'Организация', 'ФИО'];
        worksheet.getRow(1).eachCell(cell => { cell.style = headerStyle; });

        worksheet.columns = [
            { key: 'number', width: 8 },
            { key: 'objectName', width: 30 },
            { key: 'date', width: 12 },
            { key: 'time', width: 10 },
            { key: 'type', width: 15 },
            { key: 'name', width: 40 },
            { key: 'urgency', width: 20 },
            { key: 'status', width: 15 },
            { key: 'position', width: 25 },
            { key: 'organization', width: 30 },
            { key: 'fullName', width: 30 }
        ];

        // Сортируем заявки по дате (новые первыми)
        needsArray.sort((a, b) => {
            const dateA = parseAndFormatDate(a.date);
            const dateB = parseAndFormatDate(b.date);
            const parseDate = (dateStr) => {
                const [day, month, year] = dateStr.split('.').map(Number);
                return new Date(year, month - 1, day);
            };
            const dateCompare = parseDate(dateB).getTime() - parseDate(dateA).getTime();
            if (dateCompare === 0) {
                return b.timestamp.localeCompare(a.timestamp);
            }
            return dateCompare;
        });

        let currentRow = 2;
        for (const need of needsArray) {
            const needUser = users[need.userId] || {};
            const dateTime = new Date(need.timestamp);
            const dateStr = dateTime.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric' });
            const timeStr = dateTime.toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const typeName = TYPE_NAMES[need.type] || need.type;
            const urgencyName = URGENCY_NAMES[need.urgency]?.name || need.urgency;
            const statusName = STATUS_NAMES[need.status] || need.status;
            const position = needUser.position || '';
            const organization = needUser.organization || '';
            const fullName = needUser.fullName || need.fullName || '';
            const needNumber = need.number || '';

            worksheet.getRow(currentRow).values = [
                needNumber,
                need.objectName,
                dateStr,
                timeStr,
                typeName,
                need.name,
                urgencyName,
                statusName,
                position,
                organization,
                fullName
            ];

            // Применяем цветовое выделение в зависимости от статуса
            if (need.status === 'completed') {
                // Светло-зеленый для выполненных
                worksheet.getCell(`A${currentRow}`).style = completedRowCenteredStyle;
                worksheet.getCell(`B${currentRow}`).style = completedRowPaddedStyle;
                worksheet.getCell(`C${currentRow}`).style = completedRowCenteredStyle;
                worksheet.getCell(`D${currentRow}`).style = completedRowCenteredStyle;
                worksheet.getCell(`E${currentRow}`).style = completedRowCenteredStyle;
                worksheet.getCell(`F${currentRow}`).style = completedRowPaddedStyle;
                worksheet.getCell(`G${currentRow}`).style = completedRowCenteredStyle;
                worksheet.getCell(`H${currentRow}`).style = completedRowCenteredStyle;
                worksheet.getCell(`I${currentRow}`).style = completedRowPaddedStyle;
                worksheet.getCell(`J${currentRow}`).style = completedRowPaddedStyle;
                worksheet.getCell(`K${currentRow}`).style = completedRowPaddedStyle;
            } else if (need.status === 'rejected') {
                // Светло-красный для отклоненных
                worksheet.getCell(`A${currentRow}`).style = rejectedRowCenteredStyle;
                worksheet.getCell(`B${currentRow}`).style = rejectedRowPaddedStyle;
                worksheet.getCell(`C${currentRow}`).style = rejectedRowCenteredStyle;
                worksheet.getCell(`D${currentRow}`).style = rejectedRowCenteredStyle;
                worksheet.getCell(`E${currentRow}`).style = rejectedRowCenteredStyle;
                worksheet.getCell(`F${currentRow}`).style = rejectedRowPaddedStyle;
                worksheet.getCell(`G${currentRow}`).style = rejectedRowCenteredStyle;
                worksheet.getCell(`H${currentRow}`).style = rejectedRowCenteredStyle;
                worksheet.getCell(`I${currentRow}`).style = rejectedRowPaddedStyle;
                worksheet.getCell(`J${currentRow}`).style = rejectedRowPaddedStyle;
                worksheet.getCell(`K${currentRow}`).style = rejectedRowPaddedStyle;
            } else {
                // Обычные стили для остальных статусов
                worksheet.getCell(`A${currentRow}`).style = centeredCellStyle;
                worksheet.getCell(`B${currentRow}`).style = paddedCellStyle;
                worksheet.getCell(`C${currentRow}`).style = centeredCellStyle;
                worksheet.getCell(`D${currentRow}`).style = centeredCellStyle;
                worksheet.getCell(`E${currentRow}`).style = centeredCellStyle;
                worksheet.getCell(`F${currentRow}`).style = paddedCellStyle;
                worksheet.getCell(`G${currentRow}`).style = centeredCellStyle;
                worksheet.getCell(`H${currentRow}`).style = centeredCellStyle;
                worksheet.getCell(`I${currentRow}`).style = paddedCellStyle;
                worksheet.getCell(`J${currentRow}`).style = paddedCellStyle;
                worksheet.getCell(`K${currentRow}`).style = paddedCellStyle;
            }

            currentRow++;
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const filename = `all_needs_${formatDate(new Date())}.xlsx`;

        const documentMessage = await ctx.replyWithDocument({ source: buffer, filename });
        addMessageId(ctx, documentMessage.message_id);
    } catch (error) {
        console.error('Ошибка при выгрузке заявок в Excel:', error);
        await ctx.reply('Произошла ошибка при выгрузке файла. Попробуйте позже.').catch(() => {});
    }
}

async function showManagedNeedsDates(ctx, objectIndex, page = 0) {
    console.log(`[MANAGED_NEEDS] showManagedNeedsDates CALLED: objectIndex=${objectIndex}, page=${page}`);
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId];

    if (!user || !user.isApproved) {
        console.log(`[MANAGED_NEEDS] showManagedNeedsDates: пользователь не найден или не одобрен`);
        return;
    }

    let isNeedManager = userId === ADMIN_ID;
    const managedObjects = [];
    
    if (!isNeedManager) {
        // Находим все объекты, для которых пользователь является ответственным из всех организаций
        const allSettings = await getAllNeedUsers();
        
        for (const setting of allSettings) {
            if (setting.userIds && setting.userIds.includes(userId)) {
                const normalizedObjectName = setting.objectName ? setting.objectName.trim() : setting.objectName;
                if (normalizedObjectName && !managedObjects.includes(normalizedObjectName)) {
                    managedObjects.push(normalizedObjectName);
                    isNeedManager = true;
                }
            }
        }
    }

    if (!isNeedManager) return;

    try {
        const allNeeds = await loadAllNeeds();
        
        let filteredNeeds = allNeeds;
        if (userId !== ADMIN_ID) {
            const needsMap = {};
            Object.values(allNeeds).forEach(need => {
                const needObjectName = need.objectName ? need.objectName.trim() : need.objectName;
                if (needObjectName && managedObjects.some(obj => obj.trim() === needObjectName)) {
                    needsMap[need.needId] = need;
                }
            });
            filteredNeeds = needsMap;
        }

        const state = ensureUserState(ctx);
        let uniqueObjects;
        if (state && state.managedNeedsObjectsList) {
            uniqueObjects = state.managedNeedsObjectsList;
        } else {
            uniqueObjects = [...new Set(Object.values(filteredNeeds).map(n => n.objectName))];
            if (state) {
                state.managedNeedsObjectsList = uniqueObjects;
            }
        }
        if (state) {
            state.managedNeedsFilteredNeeds = filteredNeeds;
        }
        const objectName = uniqueObjects[objectIndex];

        await clearPreviousMessages(ctx, userId);

        const normalizedObjectName = objectName && objectName.trim();
        // Исключаем архивные заявки (completed и rejected) из обычного списка
        const objectNeeds = Object.entries(filteredNeeds).filter(([_, n]) =>
            n.objectName && 
            n.objectName.trim() === normalizedObjectName &&
            n.status !== 'completed' &&
            n.status !== 'rejected'
        );
        const sortedNeeds = objectNeeds.sort((a, b) => b[1].timestamp.localeCompare(a[1].timestamp));
        const uniqueDatesArray = [...new Set(sortedNeeds.map(([, n]) => parseAndFormatDate(n.date)))];
        // Сортируем даты в обратном порядке (новые первыми)
        const uniqueDates = uniqueDatesArray.sort((a, b) => {
            // Парсим даты в формате ДД.ММ.ГГГГ для сравнения
            const parseDate = (dateStr) => {
                const [day, month, year] = dateStr.split('.').map(Number);
                return new Date(year, month - 1, day);
            };
            return parseDate(b).getTime() - parseDate(a).getTime();
        });

        console.log(`[MANAGED_NEEDS] showManagedNeedsDates: objectIndex=${objectIndex}, objectName="${objectName}", page=${page}`);
        console.log(`[MANAGED_NEEDS] uniqueDates (${uniqueDates.length}):`, JSON.stringify(uniqueDates));

        const itemsPerPage = 10;
        const totalPages = Math.ceil(uniqueDates.length / itemsPerPage);
        const pageNum = typeof page === 'number' ? page : 0;
        const startIndex = pageNum * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, uniqueDates.length);
        const currentDates = uniqueDates.slice(startIndex, endIndex);

        if (currentDates.length === 0) {
            console.log(`[MANAGED_NEEDS] showManagedNeedsDates: нет дат для отображения`);
            const buttons = [
                [Markup.button.callback('📦 Архив', `manage_needs_archive_object_${objectIndex}_page_0`)],
                [Markup.button.callback('↩️ Назад', 'manage_needs_objects')]
            ];
            return ctx.reply(
                `📦 Нет активных заявок для объекта "${objectName}".\nВыберите "Архив" для просмотра закрытых заявок.`,
                Markup.inlineKeyboard(buttons)
            );
        }

        // Сохраняем список дат в state для использования при выборе даты
        if (state) {
            state.managedNeedsDatesList = uniqueDates;
            state.managedNeedsFilteredNeeds = filteredNeeds;
        }

        const dateButtons = currentDates.map((date, index) => {
            const dateIndexInFullList = uniqueDates.indexOf(date);
            console.log(`[MANAGED_NEEDS] Creating date button: date="${date}", dateIndexInFullList=${dateIndexInFullList}`);
            return [Markup.button.callback(date, `manage_needs_object_${objectIndex}_date_${dateIndexInFullList}`)];
        });

        const buttons = [];
        const paginationButtons = [];
        if (totalPages > 1) {
            if (pageNum > 0) paginationButtons.push(Markup.button.callback('⬅️ Назад', `manage_needs_object_${objectIndex}_dates_page_${pageNum - 1}`));
            if (pageNum < totalPages - 1) paginationButtons.push(Markup.button.callback('Вперед ➡️', `manage_needs_object_${objectIndex}_dates_page_${pageNum + 1}`));
        }
        if (paginationButtons.length > 0) buttons.push(paginationButtons);
        buttons.push(...dateButtons);
        buttons.push([Markup.button.callback('📦 Архив', `manage_needs_archive_object_${objectIndex}_page_0`)]);
        buttons.push([Markup.button.callback('↩️ Назад', 'manage_needs_objects')]);

        const message = await ctx.reply(
            `📦 Выберите дату для объекта "${objectName}" (Страница ${pageNum + 1} из ${totalPages}):`,
            Markup.inlineKeyboard(buttons)
        );
        addMessageId(ctx, message.message_id);
    } catch (error) {
        console.error('Ошибка в showManagedNeedsDates:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
    }
}

async function showManagedNeedsItems(ctx, objectIndex, dateIndex, page = 0) {
    console.log(`[MANAGED_NEEDS] showManagedNeedsItems CALLED: objectIndex=${objectIndex}, dateIndex=${dateIndex}, page=${page}`);
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId];

    if (!user || !user.isApproved) {
        console.log(`[MANAGED_NEEDS] showManagedNeedsItems: пользователь не найден или не одобрен`);
        return;
    }

    let isNeedManager = userId === ADMIN_ID;
    const managedObjects = [];
    
    if (!isNeedManager) {
        // Находим все объекты, для которых пользователь является ответственным из всех организаций
        const allSettings = await getAllNeedUsers();
        
        for (const setting of allSettings) {
            if (setting.userIds && setting.userIds.includes(userId)) {
                const normalizedObjectName = setting.objectName ? setting.objectName.trim() : setting.objectName;
                if (normalizedObjectName && !managedObjects.includes(normalizedObjectName)) {
                    managedObjects.push(normalizedObjectName);
                    isNeedManager = true;
                }
            }
        }
    }

    if (!isNeedManager) return;

    try {
        const allNeeds = await loadAllNeeds();
        
        let filteredNeeds = allNeeds;
        if (userId !== ADMIN_ID) {
            const needsMap = {};
            Object.values(allNeeds).forEach(need => {
                // Нормализуем названия объектов для сравнения
                const needObjectName = need.objectName ? need.objectName.trim() : need.objectName;
                if (needObjectName && managedObjects.includes(needObjectName)) {
                    needsMap[need.needId] = need;
                }
            });
            filteredNeeds = needsMap;
        }

        const state = ensureUserState(ctx);
        // Фильтруем только заявки с валидным objectName (как в showAllNeedsByObjects)
        const needsArray = Object.values(filteredNeeds).filter(n => n && n.objectName);
        const uniqueObjects = [...new Set(needsArray.map(n => n.objectName.trim()).filter(obj => obj))];
        
        // Сохраняем список объектов в state
        if (state) {
            state.managedNeedsObjectsList = uniqueObjects;
        }
        
        const objectName = uniqueObjects[objectIndex];
        if (!objectName) {
            console.log(`[MANAGED_NEEDS] ОШИБКА: объект не найден по индексу ${objectIndex}, uniqueObjects.length=${uniqueObjects.length}`);
            return ctx.reply('Ошибка: объект не найден.');
        }
        const normalizedObjectName = objectName.trim();
        // Исключаем архивные заявки (completed и rejected) из обычного списка
        const objectNeeds = Object.entries(filteredNeeds).filter(([_, n]) =>
            n.objectName && 
            n.objectName.trim() === normalizedObjectName &&
            n.status !== 'completed' &&
            n.status !== 'rejected'
        );

        const sortedNeeds = objectNeeds.sort((a, b) => b[1].timestamp.localeCompare(a[1].timestamp));
        // Получаем уникальные даты и сортируем их в обратном порядке (новые первыми)
        const uniqueDatesArray = [...new Set(sortedNeeds.map(([, n]) => parseAndFormatDate(n.date)))];
        const uniqueDatesSorted = uniqueDatesArray.sort((a, b) => {
            // Парсим даты в формате ДД.ММ.ГГГГ для сравнения
            const parseDate = (dateStr) => {
                const [day, month, year] = dateStr.split('.').map(Number);
                return new Date(year, month - 1, day);
            };
            return parseDate(b).getTime() - parseDate(a).getTime();
        });
        
        console.log(`[MANAGED_NEEDS] showManagedNeedsItems START: objectIndex=${objectIndex}, objectName="${objectName}", dateIndex=${dateIndex}, page=${page}`);
        console.log(`[MANAGED_NEEDS] uniqueDatesSorted (${uniqueDatesSorted.length}):`, JSON.stringify(uniqueDatesSorted));
        
        // Используем текущий список дат (не используем state.managedNeedsDatesList, так как он может быть для другого объекта)
        const selectedDate = uniqueDatesSorted[dateIndex];
        console.log(`[MANAGED_NEEDS] selectedDate по индексу ${dateIndex}: "${selectedDate}"`);
        
        if (!selectedDate) {
            console.log(`[MANAGED_NEEDS] ОШИБКА: дата не найдена по индексу ${dateIndex}, uniqueDatesSorted.length=${uniqueDatesSorted.length}`);
            return ctx.reply('Ошибка: дата не найдена.');
        }

        await clearPreviousMessages(ctx, userId);

        // Фильтруем заявки по выбранной дате
        console.log(`[MANAGED_NEEDS] Всего заявок для объекта: ${sortedNeeds.length}`);
        const dateNeeds = sortedNeeds.filter(([_, n]) => {
            const needDate = parseAndFormatDate(n.date);
            return needDate === selectedDate;
        });
        
        console.log(`[MANAGED_NEEDS] Найдено заявок для даты "${selectedDate}": ${dateNeeds.length}`);

        const itemsPerPage = 10;
        const totalPages = Math.ceil(dateNeeds.length / itemsPerPage);
        const pageNum = typeof page === 'number' ? page : 0;
        const startIndex = pageNum * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, dateNeeds.length);
        const currentNeeds = dateNeeds.slice(startIndex, endIndex);

        if (currentNeeds.length === 0) {
            return ctx.reply('Ошибка: нет заявок для отображения.');
        }

        // Функция для форматирования должности (сокращение)
        const formatPosition = (position) => {
            if (position === 'Производитель работ') return 'Произв. работ';
            return position || '';
        };

        // Функция для сокращения ФИО: "Иванов Иван Иванович" -> "Иванов И.И."
        const formatFullName = (fullName) => {
            if (!fullName) return '';
            const parts = fullName.trim().split(/\s+/);
            if (parts.length === 0) return '';
            if (parts.length === 1) return parts[0];
            
            const lastName = parts[0];
            const firstName = parts.length > 1 ? parts[1] : '';
            const middleName = parts.length > 2 ? parts[2] : '';
            
            let result = lastName;
            if (firstName) {
                result += ` ${firstName.charAt(0).toUpperCase()}.`;
            }
            if (middleName) {
                result += `${middleName.charAt(0).toUpperCase()}.`;
            }
            return result;
        };

        const users = await loadUsers();
        const itemButtons = currentNeeds.map(([needId, need]) => {
            const typeName = TYPE_NAMES[need.type] || need.type;
            const typeEmoji = TYPE_EMOJIS[need.type] || '📦';
            const needUser = users[need.userId] || {};
            const position = formatPosition(needUser.position || '');
            const fullName = formatFullName(needUser.fullName || need.fullName || '');
            const label = `${typeEmoji} ${typeName} -> ${position} ${fullName}`.trim();
            return [Markup.button.callback(label.length > 64 ? label.substring(0, 61) + '...' : label, `manage_select_need_${needId}`)];
        });

        const buttons = [];
        const paginationButtons = [];
        if (totalPages > 1) {
            if (pageNum > 0) paginationButtons.push(Markup.button.callback('⬅️ Назад', `manage_needs_object_${objectIndex}_date_${dateIndex}_page_${pageNum - 1}`));
            if (pageNum < totalPages - 1) paginationButtons.push(Markup.button.callback('Вперед ➡️', `manage_needs_object_${objectIndex}_date_${dateIndex}_page_${pageNum + 1}`));
        }
        if (paginationButtons.length > 0) buttons.push(paginationButtons);
        buttons.push(...itemButtons);
        buttons.push([Markup.button.callback('↩️ Назад', `manage_needs_object_${objectIndex}_dates_page_0`)]);

        const message = await ctx.reply(
            `📦 Заявки для объекта "${objectName}" за ${selectedDate} (Страница ${pageNum + 1} из ${totalPages}):`,
            Markup.inlineKeyboard(buttons)
        );
        addMessageId(ctx, message.message_id);
    } catch (error) {
        console.error('Ошибка в showManagedNeedsItems:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
    }
}

async function showManagedNeedsArchive(ctx, objectIndex, page = 0) {
    console.log(`[MANAGED_NEEDS] showManagedNeedsArchive CALLED: objectIndex=${objectIndex}, page=${page}`);
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId];

    if (!user || !user.isApproved) {
        console.log(`[MANAGED_NEEDS] showManagedNeedsArchive: пользователь не найден или не одобрен`);
        return;
    }

    let isNeedManager = userId === ADMIN_ID;
    const managedObjects = [];
    
    if (!isNeedManager) {
        const allSettings = await getAllNeedUsers();
        
        for (const setting of allSettings) {
            if (setting.userIds && setting.userIds.includes(userId)) {
                const normalizedObjectName = setting.objectName ? setting.objectName.trim() : setting.objectName;
                if (normalizedObjectName && !managedObjects.includes(normalizedObjectName)) {
                    managedObjects.push(normalizedObjectName);
                    isNeedManager = true;
                }
            }
        }
    }

    if (!isNeedManager) return;

    try {
        const allNeeds = await loadAllNeeds();
        
        let filteredNeeds = allNeeds;
        if (userId !== ADMIN_ID) {
            const needsMap = {};
            Object.values(allNeeds).forEach(need => {
                const needObjectName = need.objectName ? need.objectName.trim() : need.objectName;
                if (needObjectName && managedObjects.includes(needObjectName)) {
                    needsMap[need.needId] = need;
                }
            });
            filteredNeeds = needsMap;
        }

        const state = ensureUserState(ctx);
        let uniqueObjects;
        if (state && state.managedNeedsObjectsList) {
            uniqueObjects = state.managedNeedsObjectsList;
        } else {
            const needsArray = Object.values(filteredNeeds).filter(n => n && n.objectName);
            uniqueObjects = [...new Set(needsArray.map(n => n.objectName.trim()).filter(obj => obj))];
            if (state) {
                state.managedNeedsObjectsList = uniqueObjects;
            }
        }
        const objectName = uniqueObjects[objectIndex];

        await clearPreviousMessages(ctx, userId);

        const normalizedObjectName = objectName && objectName.trim();
        // Фильтруем только архивные заявки (completed и rejected)
        const archivedNeeds = Object.entries(filteredNeeds).filter(([_, n]) =>
            n.objectName && 
            n.objectName.trim() === normalizedObjectName &&
            (n.status === 'completed' || n.status === 'rejected')
        );

        const sortedArchivedNeeds = archivedNeeds.sort((a, b) => b[1].timestamp.localeCompare(a[1].timestamp));

        if (sortedArchivedNeeds.length === 0) {
            return ctx.reply(`Архивных заявок для объекта "${objectName}" не найдено.`, Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Назад', `manage_needs_object_${objectIndex}_dates_page_0`)]
            ]));
        }

        const itemsPerPage = 10;
        const totalPages = Math.ceil(sortedArchivedNeeds.length / itemsPerPage);
        const pageNum = typeof page === 'number' ? page : 0;
        const startIndex = pageNum * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, sortedArchivedNeeds.length);
        const currentNeeds = sortedArchivedNeeds.slice(startIndex, endIndex);

        // Функция для форматирования должности (сокращение)
        const formatPosition = (position) => {
            if (position === 'Производитель работ') return 'Произв. работ';
            return position || '';
        };

        // Функция для сокращения ФИО: "Иванов Иван Иванович" -> "Иванов И.И."
        const formatFullName = (fullName) => {
            if (!fullName) return '';
            const parts = fullName.trim().split(/\s+/);
            if (parts.length === 0) return '';
            if (parts.length === 1) return parts[0];
            
            const lastName = parts[0];
            const firstName = parts.length > 1 ? parts[1] : '';
            const middleName = parts.length > 2 ? parts[2] : '';
            
            let result = lastName;
            if (firstName) {
                result += ` ${firstName.charAt(0).toUpperCase()}.`;
            }
            if (middleName) {
                result += `${middleName.charAt(0).toUpperCase()}.`;
            }
            return result;
        };

        const itemButtons = currentNeeds.map(([needId, need]) => {
            const typeName = TYPE_NAMES[need.type] || need.type;
            const typeEmoji = TYPE_EMOJIS[need.type] || '📦';
            const needUser = users[need.userId] || {};
            const position = formatPosition(needUser.position || '');
            const fullName = formatFullName(needUser.fullName || need.fullName || '');
            const label = `${typeEmoji} ${typeName} -> ${position} ${fullName}`.trim();
            return [Markup.button.callback(label.length > 64 ? label.substring(0, 61) + '...' : label, `manage_select_need_${needId}`)];
        });

        const buttons = [];
        const paginationButtons = [];
        if (totalPages > 1) {
            if (pageNum > 0) paginationButtons.push(Markup.button.callback('⬅️ Назад', `manage_needs_archive_object_${objectIndex}_page_${pageNum - 1}`));
            if (pageNum < totalPages - 1) paginationButtons.push(Markup.button.callback('Вперед ➡️', `manage_needs_archive_object_${objectIndex}_page_${pageNum + 1}`));
        }
        if (paginationButtons.length > 0) buttons.push(paginationButtons);
        buttons.push(...itemButtons);
        buttons.push([Markup.button.callback('↩️ Назад', `manage_needs_object_${objectIndex}_dates_page_0`)]);

        const message = await ctx.reply(
            `📦 Архив заявок для объекта "${objectName}" (Страница ${pageNum + 1} из ${totalPages}):`,
            Markup.inlineKeyboard(buttons)
        );
        addMessageId(ctx, message.message_id);
    } catch (error) {
        console.error('Ошибка в showManagedNeedsArchive:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
    }
}

async function showManagedNeedDetails(ctx, needId) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId];

    if (!user || !user.isApproved) return;

    let isNeedManager = userId === ADMIN_ID;
    const managedObjects = [];
    
    if (!isNeedManager) {
        // Находим все объекты, для которых пользователь является ответственным из всех организаций
        const allSettings = await getAllNeedUsers();
        
        for (const setting of allSettings) {
            if (setting.userIds && setting.userIds.includes(userId)) {
                const normalizedObjectName = setting.objectName ? setting.objectName.trim() : setting.objectName;
                if (normalizedObjectName && !managedObjects.includes(normalizedObjectName)) {
                    managedObjects.push(normalizedObjectName);
                    isNeedManager = true;
                }
            }
        }
    }

    if (!isNeedManager) return;

    try {
        const allNeeds = await loadAllNeeds();
        const need = allNeeds[needId];

        if (!need) {
            await clearPreviousMessages(ctx, userId);
            return ctx.reply('Ошибка: заявка не найдена.');
        }

        // Проверяем права доступа для ответственных (только для своих объектов)
        const normalizedNeedObjectName = need.objectName ? need.objectName.trim() : need.objectName;
        if (userId !== ADMIN_ID && !managedObjects.some(obj => obj.trim() === normalizedNeedObjectName)) {
            await clearPreviousMessages(ctx, userId);
            return ctx.reply('У вас нет прав для просмотра этой заявки.');
        }

        await clearPreviousMessages(ctx, userId);

        const formattedDate = parseAndFormatDate(need.date);
        const dateTime = new Date(need.timestamp);
        const dateStr = dateTime.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = dateTime.toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const typeName = TYPE_NAMES[need.type] || need.type;
        const urgencyInfo = URGENCY_NAMES[need.urgency] || { name: need.urgency, emoji: '' };
        const statusName = STATUS_NAMES[need.status] || need.status;
        const statusEmoji = statusName === 'Выполнена' ? '✅' : statusName === 'Новая' ? '🆕' : statusName === 'В обработке' ? '🔄' : statusName === 'Отклонена' ? '❌' : '';

        const users = await loadUsers();
        const needUser = users[need.userId] || {};
        
        // Функция для форматирования должности (сокращение)
        const formatPosition = (position) => {
            if (position === 'Производитель работ') return 'Произв. работ';
            return position || '';
        };
        
        const position = formatPosition(needUser.position || '');
        const organization = needUser.organization || '';
        const fullName = needUser.fullName || need.fullName || '';
        const needNumber = need.number || '';

        let needText = `<blockquote>Заявка на ${typeName.toLowerCase()}${needNumber ? ` №${needNumber}` : ''}
${need.objectName}
${dateStr} ${timeStr}

${position ? position : ''}
${organization ? organization : ''}
${fullName}

Наименование: ${need.name}
Срочность: ${urgencyInfo.emoji} ${urgencyInfo.name}
Статус: ${statusEmoji} ${statusName}</blockquote>`;

        // Определяем, откуда пришли к деталям заявки
        const state = ensureUserState(ctx);
        let backButton = 'manage_all_needs';
        if (state && state.managedNeedsObjectsList) {
            const normalizedNeedObjectName = need.objectName ? need.objectName.trim() : need.objectName;
            const needObjectIndex = state.managedNeedsObjectsList.findIndex(obj => obj.trim() === normalizedNeedObjectName);
            if (needObjectIndex !== -1) {
                // Если заявка из архива, возвращаемся в архив
                if (need.status === 'completed' || need.status === 'rejected') {
                    backButton = `manage_needs_archive_object_${needObjectIndex}_page_0`;
                } else {
                    // Иначе возвращаемся к списку дат
                    backButton = `manage_needs_object_${needObjectIndex}_dates_page_0`;
                }
            }
        }

        const buttons = [
            [Markup.button.callback('✏️ Редактировать', `manage_edit_need_${needId}`)],
            [Markup.button.callback('📊 Изменить статус', `manage_change_need_status_${needId}`)],
            [Markup.button.callback('🗑️ Удалить', `manage_delete_need_${needId}`)],
            [Markup.button.callback('↩️ Назад', backButton)]
        ];

        const message = await ctx.reply(needText.trim(), {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard(buttons)
        });
        addMessageId(ctx, message.message_id);
    } catch (error) {
        console.error('Ошибка в showManagedNeedDetails:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
    }
}

async function showManagedEditNeedMenu(ctx, needId) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId];

    if (!user || !user.isApproved) return;

    let isNeedManager = userId === ADMIN_ID;
    const managedObjects = [];
    
    if (!isNeedManager) {
        // Находим все объекты, для которых пользователь является ответственным из всех организаций
        const allSettings = await getAllNeedUsers();
        
        for (const setting of allSettings) {
            if (setting.userIds && setting.userIds.includes(userId)) {
                const normalizedObjectName = setting.objectName ? setting.objectName.trim() : setting.objectName;
                if (normalizedObjectName && !managedObjects.includes(normalizedObjectName)) {
                    managedObjects.push(normalizedObjectName);
                    isNeedManager = true;
                }
            }
        }
    }

    if (!isNeedManager) return;

    try {
        const allNeeds = await loadAllNeeds();
        const need = allNeeds[needId];

        if (!need) {
            return ctx.reply('Ошибка: заявка не найдена.');
        }

        const normalizedNeedObjectName = need.objectName ? need.objectName.trim() : need.objectName;
        if (userId !== ADMIN_ID && !managedObjects.some(obj => obj.trim() === normalizedNeedObjectName)) {
            return ctx.reply('У вас нет прав для редактирования этой заявки.');
        }

        await clearPreviousMessages(ctx, userId);

        const buttons = [
            [Markup.button.callback('📝 Наименование', `manage_edit_need_name_${needId}`)],
            [Markup.button.callback('⏰ Срочность', `manage_edit_need_urgency_${needId}`)],
            [Markup.button.callback('↩️ Назад', `manage_select_need_${needId}`)]
        ];

        const message = await ctx.reply('Что вы хотите изменить?', Markup.inlineKeyboard(buttons));
        addMessageId(ctx, message.message_id);
    } catch (error) {
        console.error('Ошибка в showManagedEditNeedMenu:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
    }
}

async function showManagedChangeStatusMenu(ctx, needId) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId];

    if (!user || !user.isApproved) return;

    let isNeedManager = userId === ADMIN_ID;
    const managedObjects = [];
    
    if (!isNeedManager) {
        // Находим все объекты, для которых пользователь является ответственным из всех организаций
        const allSettings = await getAllNeedUsers();
        
        for (const setting of allSettings) {
            if (setting.userIds && setting.userIds.includes(userId)) {
                const normalizedObjectName = setting.objectName ? setting.objectName.trim() : setting.objectName;
                if (normalizedObjectName && !managedObjects.includes(normalizedObjectName)) {
                    managedObjects.push(normalizedObjectName);
                    isNeedManager = true;
                }
            }
        }
    }

    if (!isNeedManager) return;

    try {
        const allNeeds = await loadAllNeeds();
        const need = allNeeds[needId];

        if (!need) {
            return ctx.reply('Ошибка: заявка не найдена.');
        }

        const normalizedNeedObjectName = need.objectName ? need.objectName.trim() : need.objectName;
        if (userId !== ADMIN_ID && !managedObjects.some(obj => obj.trim() === normalizedNeedObjectName)) {
            return ctx.reply('У вас нет прав для изменения статуса этой заявки.');
        }

        await clearPreviousMessages(ctx, userId);

        const buttons = [
            [Markup.button.callback('🆕 Новая', `manage_set_need_status_${needId}_new`)],
            [Markup.button.callback('⏳ В обработке', `manage_set_need_status_${needId}_in_progress`)],
            [Markup.button.callback('✅ Выполнена', `manage_set_need_status_${needId}_completed`)],
            [Markup.button.callback('❌ Отклонена', `manage_set_need_status_${needId}_rejected`)],
            [Markup.button.callback('↩️ Назад', `manage_select_need_${needId}`)]
        ];

        const message = await ctx.reply('Выберите новый статус:', Markup.inlineKeyboard(buttons));
        addMessageId(ctx, message.message_id);
    } catch (error) {
        console.error('Ошибка в showManagedChangeStatusMenu:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
    }
}

module.exports = (bot) => {
    console.log('[NEEDS_HANDLERS] Registering needs handlers...');
    bot.action('needs', showNeedsMenu);
    bot.action('create_need', createNeed);
    bot.action('view_my_needs', showUserNeeds);

    // Выбор типа потребности
    bot.action(/select_need_type_(.+)/, async (ctx) => {
        const type = ctx.match[1];
        await selectNeedType(ctx, type);
    });

    // Выбор объекта при создании
    bot.action(/select_need_object_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const objectIndex = parseInt(ctx.match[1], 10);
        const users = await loadUsers();
        if (!users[userId] || !Array.isArray(users[userId].selectedObjects)) {
            return ctx.reply('Ошибка: пользователь или объекты не найдены.');
        }
        const selectedObject = users[userId].selectedObjects[objectIndex];
        if (!selectedObject) return;

        await clearPreviousMessages(ctx, userId);

        const state = ensureUserState(ctx);
        if (state && state.need) {
            state.need.objectName = selectedObject;
            state.step = 'needName';
        }

        const message = await ctx.reply('📝 Введите наименование и количество:');
        addMessageId(ctx, message.message_id);
    });

    // Просмотр заявок по объектам
    bot.action(/select_need_list_object_(\d+)/, (ctx) => showNeedDates(ctx, parseInt(ctx.match[1], 10), 0));
    bot.action(/need_dates_page_(\d+)_(\d+)/, (ctx) => {
        const objectIndex = parseInt(ctx.match[1], 10);
        const page = parseInt(ctx.match[2], 10);
        showNeedDates(ctx, objectIndex, page);
    });

    // Выбор даты
    bot.action(/select_need_date_(\d+)_(\d+)/, (ctx) => {
        const objectIndex = parseInt(ctx.match[1], 10);
        const dateIndex = parseInt(ctx.match[2], 10);
        showNeedItems(ctx, objectIndex, dateIndex, 0);
    });
    bot.action(/need_items_page_(\d+)_(\d+)_(\d+)/, (ctx) => {
        const objectIndex = parseInt(ctx.match[1], 10);
        const dateIndex = parseInt(ctx.match[2], 10);
        const page = parseInt(ctx.match[3], 10);
        showNeedItems(ctx, objectIndex, dateIndex, page);
    });

    // Выбор заявки
    bot.action(/select_need_item_(.+)/, (ctx) => {
        const needId = ctx.match[1];
        console.log('[NEED DEBUG] select_need_item handler - received needId:', needId);
        console.log('[NEED DEBUG] select_need_item handler - needId type:', typeof needId);
        console.log('[NEED DEBUG] select_need_item handler - needId length:', needId.length);
        showNeedDetails(ctx, needId);
    });

    // Редактирование (более специфичные обработчики должны быть раньше)
    bot.action(/edit_need_name_(.+)/, async (ctx) => {
        const needId = ctx.match[1];
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        const state = ensureUserState(ctx);
        if (state) {
            state.step = `editNeedName`;
            state.editingNeedId = needId;
        }
        const message = await ctx.reply('📝 Введите новое наименование:');
        addMessageId(ctx, message.message_id);
    });
    bot.action(/edit_need_urgency_(.+)/, async (ctx) => {
        const needId = ctx.match[1];
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        const state = ensureUserState(ctx);
        if (state) {
            state.step = `editNeedUrgency`;
            state.editingNeedId = needId;
        }
        const buttons = [
            [Markup.button.callback('🔥 Срочно', `set_urgency_urgent_${needId}`)],
            [Markup.button.callback('⏳ В ближайшее время', `set_urgency_soon_${needId}`)],
            [Markup.button.callback('📅 Планово', `set_urgency_planned_${needId}`)]
        ];
        const message = await ctx.reply('⏰ Выберите срочность:', Markup.inlineKeyboard(buttons));
        addMessageId(ctx, message.message_id);
    });
    
    // Общий обработчик редактирования (должен быть после специфичных)
    bot.action(/edit_need_(.+)/, (ctx) => {
        const needId = ctx.match[1];
        console.log('[NEED DEBUG] edit_need handler - received needId:', needId);
        editNeed(ctx, needId);
    });

    // Установка срочности при редактировании
    bot.action(/set_urgency_(urgent|soon|planned)_(.+)/, async (ctx) => {
        const urgency = ctx.match[1];
        const needId = ctx.match[2];
        const userId = ctx.from.id.toString();
        
        console.log('[NEED DEBUG] set_urgency handler - urgency:', urgency);
        console.log('[NEED DEBUG] set_urgency handler - needId:', needId);
        console.log('[NEED DEBUG] set_urgency handler - userId:', userId);
        
        const needs = await loadUserNeeds(userId);
        console.log('[NEED DEBUG] set_urgency handler - needs keys:', Object.keys(needs));
        console.log('[NEED DEBUG] set_urgency handler - need exists:', !!needs[needId]);
        
        const need = needs[needId];

        if (!need) {
            console.log('[NEED DEBUG] set_urgency handler - Need not found, available needIds:', Object.keys(needs));
            return ctx.reply('Ошибка: заявка не найдена.');
        }

        try {
            need.urgency = urgency;
            await saveNeed(userId, need);
            await clearPreviousMessages(ctx, userId);
            const message = await ctx.reply('✅ Срочность обновлена.', Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Назад', `select_need_item_${needId}`)]
            ]));
            addMessageId(ctx, message.message_id);
        } catch (error) {
            console.error('Ошибка обновления срочности:', error);
            await ctx.reply('Ошибка при обновлении срочности. Попробуйте позже.');
        }
    });

    // Удаление (более специфичные обработчики должны быть раньше)
    bot.action(/confirm_delete_need_(.+)/, async (ctx) => {
        try {
            const needId = ctx.match[1];
            console.log('[NEED DEBUG] ====== confirm_delete_need handler CALLED ======');
            console.log('[NEED DEBUG] confirm_delete_need handler - received needId:', needId);
            console.log('[NEED DEBUG] confirm_delete_need handler - callback data:', ctx.callbackQuery?.data);
            await ctx.answerCbQuery().catch(err => console.error('[NEED DEBUG] Error answering callback query:', err));
            await confirmDeleteNeed(ctx, needId);
        } catch (error) {
            console.error('[NEED DEBUG] Error in confirm_delete_need handler:', error);
            await ctx.answerCbQuery('Ошибка при удалении заявки').catch(() => {});
        }
    });
    bot.action(/delete_need_(.+)/, (ctx) => {
        const needId = ctx.match[1];
        console.log('[NEED DEBUG] delete_need handler - received needId:', needId);
        deleteNeedConfirmation(ctx, needId);
    });
    bot.action(/manage_delete_need_(.+)/, (ctx) => manageDeleteNeedConfirmation(ctx, ctx.match[1]));
    bot.action(/manage_confirm_delete_need_(.+)/, (ctx) => manageConfirmDeleteNeed(ctx, ctx.match[1]));

    // Управление заявками для ответственных
    // Важно: более специфичные паттерны должны быть зарегистрированы раньше
    bot.action('manage_all_needs', (ctx) => manageAllNeeds(ctx));
    bot.action('download_all_needs_excel', (ctx) => downloadAllNeedsExcel(ctx));
    bot.action('manage_needs_objects', (ctx) => showManagedNeedsObjects(ctx, 0));
    bot.action(/manage_needs_objects_page_(\d+)/, (ctx) => {
        showManagedNeedsObjects(ctx, parseInt(ctx.match[1], 10));
    });
    bot.action(/manage_needs_archive_object_(\d+)_page_(\d+)/, (ctx) => {
        showManagedNeedsArchive(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10));
    });
    bot.action(/manage_needs_object_(\d+)_date_(\d+)_page_(\d+)/, (ctx) => {
        console.log(`[MANAGED_NEEDS] Action handler called: manage_needs_object_${ctx.match[1]}_date_${ctx.match[2]}_page_${ctx.match[3]}`);
        showManagedNeedsItems(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10), parseInt(ctx.match[3], 10));
    });
    bot.action(/manage_needs_object_(\d+)_date_(\d+)/, (ctx) => {
        console.log(`[MANAGED_NEEDS] Action handler called: manage_needs_object_${ctx.match[1]}_date_${ctx.match[2]}`);
        showManagedNeedsItems(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10), 0);
    });
    bot.action(/manage_needs_object_(\d+)_dates_page_(\d+)/, (ctx) => {
        console.log(`[MANAGED_NEEDS] Action handler called: manage_needs_object_${ctx.match[1]}_dates_page_${ctx.match[2]}`);
        showManagedNeedsDates(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10));
    });
    bot.action(/manage_needs_object_(\d+)/, (ctx) => {
        console.log(`[MANAGED_NEEDS] Action handler called: manage_needs_object_${ctx.match[1]}`);
        const state = ensureUserState(ctx);
        showManagedNeedsDates(ctx, parseInt(ctx.match[1], 10), 0);
    });
    bot.action(/manage_select_need_(.+)/, (ctx) => showManagedNeedDetails(ctx, ctx.match[1]));
    bot.action(/manage_edit_need_(.+)/, (ctx) => showManagedEditNeedMenu(ctx, ctx.match[1]));
    bot.action(/manage_change_need_status_(.+)/, (ctx) => showManagedChangeStatusMenu(ctx, ctx.match[1]));

    bot.action(/manage_edit_need_name_(.+)/, async (ctx) => {
        const needId = ctx.match[1];
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        const state = ensureUserState(ctx);
        if (state) {
            state.step = 'manage_edit_need_name';
            state.managedEditingNeedId = needId;
        }
        const message = await ctx.reply('📝 Введите новое наименование:');
        addMessageId(ctx, message.message_id);
    });

    bot.action(/manage_edit_need_urgency_(.+)/, async (ctx) => {
        const needId = ctx.match[1];
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        const buttons = [
            [Markup.button.callback('🔥 Срочно', `manage_set_need_urgency_${needId}_urgent`)],
            [Markup.button.callback('⏳ В ближайшее время', `manage_set_need_urgency_${needId}_soon`)],
            [Markup.button.callback('📅 Планово', `manage_set_need_urgency_${needId}_planned`)],
            [Markup.button.callback('↩️ Назад', `manage_select_need_${needId}`)]
        ];
        const message = await ctx.reply('⏰ Выберите срочность:', Markup.inlineKeyboard(buttons));
        addMessageId(ctx, message.message_id);
    });

    bot.action(/manage_set_need_status_(.+)/, async (ctx) => {
        // Извлекаем needId и status, учитывая что needId может содержать подчеркивания
        // Статусы: new, in_progress, completed, rejected
        const callbackData = ctx.match[1];
        const statuses = ['in_progress', 'completed', 'rejected', 'new'];
        let needId = '';
        let status = '';
        
        // Ищем статус в конце строки (с учетом подчеркиваний)
        for (const stat of statuses) {
            if (callbackData.endsWith(`_${stat}`)) {
                status = stat;
                needId = callbackData.slice(0, -(stat.length + 1)); // Убираем "_статус"
                break;
            }
        }
        
        if (!status || !needId) {
            console.error('[NEED DEBUG] manage_set_need_status - Failed to parse:', callbackData);
            return ctx.reply('Ошибка: неверный формат данных.');
        }
        
        console.log('[NEED DEBUG] manage_set_need_status - needId:', needId, 'status:', status);
        const userId = ctx.from.id.toString();
        const users = await loadUsers();
        const user = users[userId];

        if (!user || !user.isApproved) return;

        let isNeedManager = userId === ADMIN_ID;
        const managedObjects = [];
        
        if (!isNeedManager) {
            // Находим все объекты, для которых пользователь является ответственным из всех организаций
            const allSettings = await getAllNeedUsers();
            
            for (const setting of allSettings) {
                if (setting.userIds && setting.userIds.includes(userId)) {
                    const normalizedObjectName = setting.objectName ? setting.objectName.trim() : setting.objectName;
                    if (normalizedObjectName && !managedObjects.includes(normalizedObjectName)) {
                        managedObjects.push(normalizedObjectName);
                        isNeedManager = true;
                    }
                }
            }
        }

        if (!isNeedManager) return;

        try {
            const allNeeds = await loadAllNeeds();
            const need = allNeeds[needId];
            if (!need) {
                return ctx.reply('Ошибка: заявка не найдена.');
            }

            const normalizedNeedObjectName = need.objectName ? need.objectName.trim() : need.objectName;
            if (userId !== ADMIN_ID && !managedObjects.some(obj => obj.trim() === normalizedNeedObjectName)) {
                return ctx.reply('У вас нет прав для изменения статуса этой заявки.');
            }

            const oldStatus = need.status;
            need.status = status;
            await saveNeed(need.userId, need);
            
            // Уведомляем автора заявки и ответственных пользователей об изменении статуса
            if (oldStatus !== status) {
                await notifyNeedAuthorStatusChange(ctx.telegram, need, oldStatus, status);
                await notifyResponsibleUsersStatusChange(ctx.telegram, need, oldStatus, status);
            }
            
            await clearPreviousMessages(ctx, userId);
            const message = await ctx.reply('✅ Статус обновлен.', Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Назад', `manage_select_need_${needId}`)]
            ]));
            addMessageId(ctx, message.message_id);
        } catch (error) {
            console.error('Ошибка обновления статуса:', error);
            await ctx.reply('Ошибка при обновлении статуса. Попробуйте позже.');
        }
    });

    bot.action(/manage_set_need_urgency_(.+)_(urgent|soon|planned)/, async (ctx) => {
        const needId = ctx.match[1];
        const urgency = ctx.match[2];
        const userId = ctx.from.id.toString();
        const users = await loadUsers();
        const user = users[userId];

        if (!user || !user.isApproved) return;

        let isNeedManager = userId === ADMIN_ID;
        const managedObjects = [];
        
        if (!isNeedManager) {
            // Находим все объекты, для которых пользователь является ответственным из всех организаций
            const allSettings = await getAllNeedUsers();
            
            for (const setting of allSettings) {
                if (setting.userIds && setting.userIds.includes(userId)) {
                    const normalizedObjectName = setting.objectName ? setting.objectName.trim() : setting.objectName;
                    if (normalizedObjectName && !managedObjects.includes(normalizedObjectName)) {
                        managedObjects.push(normalizedObjectName);
                        isNeedManager = true;
                    }
                }
            }
        }

        if (!isNeedManager) return;

        console.log('[NEED DEBUG] manage_set_need_urgency handler - needId:', needId);
        console.log('[NEED DEBUG] manage_set_need_urgency handler - urgency:', urgency);
        console.log('[NEED DEBUG] manage_set_need_urgency handler - userId:', userId);

        try {
            const allNeeds = await loadAllNeeds();
            console.log('[NEED DEBUG] manage_set_need_urgency handler - allNeeds keys:', Object.keys(allNeeds));
            console.log('[NEED DEBUG] manage_set_need_urgency handler - need exists:', !!allNeeds[needId]);
            
            const need = allNeeds[needId];
            if (!need) {
                console.log('[NEED DEBUG] manage_set_need_urgency handler - Need not found, available needIds:', Object.keys(allNeeds));
                return ctx.reply('Ошибка: заявка не найдена.');
            }

            const normalizedNeedObjectName = need.objectName ? need.objectName.trim() : need.objectName;
            if (userId !== ADMIN_ID && !managedObjects.some(obj => obj.trim() === normalizedNeedObjectName)) {
                return ctx.reply('У вас нет прав для изменения срочности этой заявки.');
            }

            need.urgency = urgency;
            await saveNeed(need.userId, need);
            await clearPreviousMessages(ctx, userId);
            const message = await ctx.reply('✅ Срочность обновлена.', Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Назад', `manage_select_need_${needId}`)]
            ]));
            addMessageId(ctx, message.message_id);
        } catch (error) {
            console.error('Ошибка обновления срочности:', error);
            await ctx.reply('Ошибка при обновлении срочности. Попробуйте позже.');
        }
    });
};

module.exports.showNeedsMenu = showNeedsMenu;
module.exports.notifyNeedAuthorStatusChange = notifyNeedAuthorStatusChange;
module.exports.notifyResponsibleUsersNewNeed = notifyResponsibleUsersNewNeed;
module.exports.notifyResponsibleUsersStatusChange = notifyResponsibleUsersStatusChange;
