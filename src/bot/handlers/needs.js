const { Markup } = require('telegraf');
const { loadUsers } = require('../../database/userModel');
const { loadUserNeeds, saveNeed, deleteNeed, loadAllNeeds } = require('../../database/needModel');
const { clearPreviousMessages, formatDate, parseAndFormatDate } = require('../utils');
const { addMessageId, ensureUserState } = require('../utils/stateHelper');
const { escapeHtml } = require('../utils/htmlHelper');
const { incrementNextReportId } = require('../../database/userModel');
const { getNeedUsers } = require('../../database/configService');
const { ADMIN_ID } = require('../../config/config');

// Маппинг типов потребностей
const TYPE_NAMES = {
    'materials': 'Материалы',
    'equipment': 'Оборудование',
    'special_equipment': 'Спецтехника',
    'office_supplies': 'Канцтовары',
    'accommodation': 'Проживание',
    'services': 'Услуги'
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
        
        const notificationText = `📦 Изменен статус вашей заявки на потребности\n\n` +
            `Объект: ${need.objectName}\n` +
            `Тип: ${typeName}\n` +
            `Наименование: ${need.name}\n` +
            `Статус изменен: ${oldStatusName} → ${newStatusName}`;
        
        await telegram.sendMessage(need.userId, notificationText).catch(err => {
            console.error(`Ошибка отправки уведомления пользователю ${need.userId}:`, err);
        });
    } catch (error) {
        console.error('Ошибка в notifyNeedAuthorStatusChange:', error);
    }
}

async function notifyResponsibleUsersNewNeed(telegram, need, userOrganization) {
    try {
        const typeName = TYPE_NAMES[need.type] || need.type;
        const urgencyInfo = URGENCY_NAMES[need.urgency] || { name: need.urgency, emoji: '' };
        const { loadUsers } = require('../../database/userModel');
        const users = await loadUsers();
        const author = users[need.userId] || {};
        const authorName = author.fullName || need.userId;
        
        let notificationText = `📦 Новая заявка на потребности\n\n` +
            `Объект: ${need.objectName}\n` +
            `Автор: ${authorName}\n` +
            `Тип: ${typeName}\n` +
            `Наименование: ${need.name}\n`;
        
        if (need.quantity !== null && need.quantity !== undefined) {
            notificationText += `Количество: ${need.quantity}\n`;
        }
        notificationText += `Срочность: ${urgencyInfo.emoji} ${urgencyInfo.name}\n`;
        notificationText += `Дата: ${need.date}`;
        
        // Get responsible users for this organization-object pair
        const { getNeedUsers } = require('../../database/configService');
        const responsibleUserIds = await getNeedUsers(userOrganization, need.objectName);
        
        if (!responsibleUserIds || responsibleUserIds.length === 0) {
            return; // No responsible users to notify
        }
        
        // Send notification to each responsible user
        const notificationPromises = responsibleUserIds.map(respUserId => {
            return telegram.sendMessage(respUserId, notificationText).catch(err => {
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
    } else if (user.organization && user.selectedObjects && user.selectedObjects.length > 0) {
        for (const objectName of user.selectedObjects) {
            const needUsers = await getNeedUsers(user.organization, objectName);
            if (needUsers && needUsers.includes(userId)) {
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
Выберите действие:
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
        [Markup.button.callback('📎 Канцтовары', 'select_need_type_office_supplies')],
        [Markup.button.callback('🏠 Проживание', 'select_need_type_accommodation')],
        [Markup.button.callback('🔧 Услуги', 'select_need_type_services')],
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
        state.need = { type, objectName: null, name: null, quantity: null, urgency: null };
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
        const message = await ctx.reply('У вас пока нет заявок.');
        addMessageId(ctx, message.message_id);
        return;
    }

    const uniqueObjects = [...new Set(Object.values(needs).map(n => n.objectName))];
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
    const uniqueDates = [...new Set(sortedNeeds.map(n => parseAndFormatDate(n.date)))];

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
        [Markup.button.callback(date, `select_need_date_${objectIndex}_${startIndex + index}`)]
    ).reverse();

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
    const uniqueObjects = [...new Set(Object.values(needs).map(n => n.objectName))];
    const objectName = uniqueObjects[objectIndex];
    const normalizedObjectName = objectName && objectName.trim();
    const objectNeeds = Object.entries(needs).filter(([_, n]) =>
        n.objectName && n.objectName.trim() === normalizedObjectName
    );

    const sortedNeeds = objectNeeds.sort((a, b) => b[1].timestamp.localeCompare(a[1].timestamp));
    const uniqueDates = [...new Set(sortedNeeds.map(([, n]) => parseAndFormatDate(n.date)))];
    const selectedDate = uniqueDates[dateIndex];

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

    const itemButtons = currentNeeds.map(([needId, need]) => {
        const urgencyInfo = URGENCY_NAMES[need.urgency] || { name: need.urgency, emoji: '' };
        const typeName = TYPE_NAMES[need.type] || need.type;
        const label = `${urgencyInfo.emoji} ${typeName}: ${need.name}`;
        return [Markup.button.callback(label.length > 64 ? label.substring(0, 61) + '...' : label, `select_need_item_${needId}`)];
    }).reverse();

    const buttons = [];
    const paginationButtons = [];
    if (totalPages > 1) {
        if (pageNum > 0) paginationButtons.push(Markup.button.callback('⬅️ Назад', `need_items_page_${objectIndex}_${dateIndex}_${pageNum - 1}`));
        if (pageNum < totalPages - 1) paginationButtons.push(Markup.button.callback('Вперед ➡️', `need_items_page_${objectIndex}_${dateIndex}_${pageNum + 1}`));
    }
    if (paginationButtons.length > 0) buttons.push(paginationButtons);
    buttons.push(...itemButtons);
    buttons.push([Markup.button.callback('↩️ Назад', `select_need_list_object_${objectIndex}`)]);

    const message = await ctx.reply(
        `Выберите заявку для объекта "${objectName}" за ${selectedDate} (Страница ${pageNum + 1} из ${totalPages}):`,
        Markup.inlineKeyboard(buttons)
    );
    addMessageId(ctx, message.message_id);
}

async function showNeedDetails(ctx, needId) {
    const userId = ctx.from.id.toString();
    const needs = await loadUserNeeds(userId);
    const need = needs[needId];

    await clearPreviousMessages(ctx, userId);

    if (!need) {
        return ctx.reply('Ошибка: заявка не найдена.');
    }

    const formattedDate = parseAndFormatDate(need.date);
    const time = new Date(need.timestamp).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' });
    const typeName = TYPE_NAMES[need.type] || need.type;
    const urgencyInfo = URGENCY_NAMES[need.urgency] || { name: need.urgency, emoji: '' };
    const statusName = STATUS_NAMES[need.status] || need.status;

    let needText = `
<b>ЗАЯВКА НА ПОТРЕБНОСТИ</b>
📅 Дата: ${formattedDate}
🏢 Объект: ${escapeHtml(need.objectName)}
👷 Автор: ${escapeHtml(need.fullName)}
📦 Тип: ${typeName}
📝 Наименование: ${escapeHtml(need.name)}
`;
    if (need.quantity !== null && need.quantity !== undefined) {
        needText += `🔢 Количество: ${need.quantity}\n`;
    }
    needText += `${urgencyInfo.emoji} Срочность: ${urgencyInfo.name}\n`;
    needText += `📊 Статус: ${statusName}\n`;
    needText += `⏰ Время: ${time}`;

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

    const message = await ctx.reply(needText.trim(), {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
    });
    addMessageId(ctx, message.message_id);
}

async function editNeed(ctx, needId) {
    const userId = ctx.from.id.toString();
    const needs = await loadUserNeeds(userId);
    const need = needs[needId];

    if (!need) {
        await clearPreviousMessages(ctx, userId);
        return ctx.reply('Ошибка: не удалось найти заявку для редактирования.');
    }

    await clearPreviousMessages(ctx, userId);

    const buttons = [
        [Markup.button.callback('📝 Наименование', `edit_need_name_${needId}`)],
        [Markup.button.callback('🔢 Количество', `edit_need_quantity_${needId}`)],
        [Markup.button.callback('⏰ Срочность', `edit_need_urgency_${needId}`)],
        [Markup.button.callback('↩️ Назад', `select_need_item_${needId}`)]
    ];

    const message = await ctx.reply('Что вы хотите изменить?', Markup.inlineKeyboard(buttons));
    addMessageId(ctx, message.message_id);
}

async function deleteNeedConfirmation(ctx, needId) {
    const userId = ctx.from.id.toString();
    const needs = await loadUserNeeds(userId);
    const need = needs[needId];

    if (!need) {
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

    try {
        await deleteNeed(userId, needId);
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

async function manageAllNeeds(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId];

    if (!user || !user.isApproved) {
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply('У вас нет прав для управления заявками.');
        addMessageId(ctx, message.message_id);
        return;
    }

    // Проверяем, является ли пользователь ответственным или администратором
    let isNeedManager = userId === ADMIN_ID;
    const managedObjects = [];
    
    if (!isNeedManager && user.organization && user.selectedObjects && user.selectedObjects.length > 0) {
        for (const objectName of user.selectedObjects) {
            const needUsers = await getNeedUsers(user.organization, objectName);
            if (needUsers && needUsers.includes(userId)) {
                isNeedManager = true;
                managedObjects.push(objectName);
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
                if (managedObjects.includes(need.objectName)) {
                    needsMap[need.needId] = need;
                }
            });
            filteredNeeds = needsMap;
        }

        const uniqueObjects = [...new Set(Object.values(filteredNeeds).map(n => n.objectName))];

        if (uniqueObjects.length === 0) {
            await clearPreviousMessages(ctx, userId);
            const message = await ctx.reply('Заявок на потребности пока нет.', Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Назад', 'needs')]
            ]));
            addMessageId(ctx, message.message_id);
            return;
        }

        await clearPreviousMessages(ctx, userId);

        const buttons = uniqueObjects.map((obj, index) => {
            const objectNeeds = Object.values(filteredNeeds).filter(n =>
                n.objectName && n.objectName.trim() === obj.trim()
            );
            return [Markup.button.callback(`${obj} (${objectNeeds.length})`, `manage_needs_object_${index}`)];
        });

        buttons.push([Markup.button.callback('↩️ Назад', 'needs')]);

        const message = await ctx.reply(
            '⚙️ Управление заявками\n\nВыберите объект:',
            Markup.inlineKeyboard(buttons)
        );
        addMessageId(ctx, message.message_id);
        
        const state = ensureUserState(ctx);
        if (state) {
            state.managedNeedsObjectsList = uniqueObjects;
        }
    } catch (error) {
        console.error('Ошибка в manageAllNeeds:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
    }
}

async function showManagedNeedsDates(ctx, objectIndex, page = 0) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId];

    if (!user || !user.isApproved) return;

    let isNeedManager = userId === ADMIN_ID;
    const managedObjects = [];
    
    if (!isNeedManager && user.organization && user.selectedObjects && user.selectedObjects.length > 0) {
        for (const objectName of user.selectedObjects) {
            const needUsers = await getNeedUsers(user.organization, objectName);
            if (needUsers && needUsers.includes(userId)) {
                isNeedManager = true;
                managedObjects.push(objectName);
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
                if (managedObjects.includes(need.objectName)) {
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
        const objectName = uniqueObjects[objectIndex];

        await clearPreviousMessages(ctx, userId);

        const normalizedObjectName = objectName && objectName.trim();
        const objectNeeds = Object.entries(filteredNeeds).filter(([_, n]) =>
            n.objectName && n.objectName.trim() === normalizedObjectName
        );
        const sortedNeeds = objectNeeds.sort((a, b) => b[1].timestamp.localeCompare(a[1].timestamp));
        const uniqueDates = [...new Set(sortedNeeds.map(([, n]) => parseAndFormatDate(n.date)))];

        const itemsPerPage = 10;
        const totalPages = Math.ceil(uniqueDates.length / itemsPerPage);
        const pageNum = typeof page === 'number' ? page : 0;
        const startIndex = pageNum * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, uniqueDates.length);
        const currentDates = uniqueDates.slice(startIndex, endIndex);

        if (currentDates.length === 0) {
            return ctx.reply('Ошибка: нет дат для отображения.');
        }

        // Сохраняем список дат в state для использования при выборе даты
        if (state) {
            state.managedNeedsDatesList = uniqueDates;
        }

            const dateButtons = currentDates.map((date, index) => {
                const dateIndexInFullList = uniqueDates.indexOf(date);
                return [Markup.button.callback(date, `manage_needs_object_${objectIndex}_date_${dateIndexInFullList}`)];
            }).reverse();

        const buttons = [];
        const paginationButtons = [];
        if (totalPages > 1) {
            if (pageNum > 0) paginationButtons.push(Markup.button.callback('⬅️ Назад', `manage_needs_object_${objectIndex}_dates_page_${pageNum - 1}`));
            if (pageNum < totalPages - 1) paginationButtons.push(Markup.button.callback('Вперед ➡️', `manage_needs_object_${objectIndex}_dates_page_${pageNum + 1}`));
        }
        if (paginationButtons.length > 0) buttons.push(paginationButtons);
        buttons.push(...dateButtons);
        buttons.push([Markup.button.callback('↩️ Назад', 'manage_all_needs')]);

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
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId];

    if (!user || !user.isApproved) return;

    let isNeedManager = userId === ADMIN_ID;
    const managedObjects = [];
    
    if (!isNeedManager && user.organization && user.selectedObjects && user.selectedObjects.length > 0) {
        for (const objectName of user.selectedObjects) {
            const needUsers = await getNeedUsers(user.organization, objectName);
            if (needUsers && needUsers.includes(userId)) {
                isNeedManager = true;
                managedObjects.push(objectName);
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
                if (managedObjects.includes(need.objectName)) {
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
        const objectName = uniqueObjects[objectIndex];
        const normalizedObjectName = objectName && objectName.trim();
        const objectNeeds = Object.entries(filteredNeeds).filter(([_, n]) =>
            n.objectName && n.objectName.trim() === normalizedObjectName
        );

        const sortedNeeds = objectNeeds.sort((a, b) => b[1].timestamp.localeCompare(a[1].timestamp));
        const uniqueDates = [...new Set(sortedNeeds.map(([, n]) => parseAndFormatDate(n.date)))];
        
        // Используем сохраненный список дат из state, если он есть, иначе используем текущий
        let datesList = uniqueDates;
        if (state && state.managedNeedsDatesList && state.managedNeedsDatesList.length === uniqueDates.length) {
            datesList = state.managedNeedsDatesList;
        }
        
        const selectedDate = datesList[dateIndex];
        if (!selectedDate) {
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

        const itemButtons = currentNeeds.map(([needId, need]) => {
            const urgencyInfo = URGENCY_NAMES[need.urgency] || { name: need.urgency, emoji: '' };
            const typeName = TYPE_NAMES[need.type] || need.type;
            const statusName = STATUS_NAMES[need.status] || need.status;
            const label = `${urgencyInfo.emoji} ${typeName}: ${need.name} (${statusName})`;
            return [Markup.button.callback(label.length > 64 ? label.substring(0, 61) + '...' : label, `manage_select_need_${needId}`)];
        }).reverse();

        const buttons = [];
        const paginationButtons = [];
        if (totalPages > 1) {
            if (pageNum > 0) paginationButtons.push(Markup.button.callback('⬅️ Назад', `manage_needs_object_${objectIndex}_date_${dateIndex}_page_${pageNum - 1}`));
            if (pageNum < totalPages - 1) paginationButtons.push(Markup.button.callback('Вперед ➡️', `manage_needs_object_${objectIndex}_date_${dateIndex}_page_${pageNum + 1}`));
        }
        if (paginationButtons.length > 0) buttons.push(paginationButtons);
        buttons.push(...itemButtons);
        buttons.push([Markup.button.callback('↩️ Назад', `manage_needs_object_${objectIndex}`)]);

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

async function showManagedNeedDetails(ctx, needId) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId];

    if (!user || !user.isApproved) return;

    let isNeedManager = userId === ADMIN_ID;
    const managedObjects = [];
    
    if (!isNeedManager && user.organization && user.selectedObjects && user.selectedObjects.length > 0) {
        for (const objectName of user.selectedObjects) {
            const needUsers = await getNeedUsers(user.organization, objectName);
            if (needUsers && needUsers.includes(userId)) {
                isNeedManager = true;
                managedObjects.push(objectName);
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
        if (userId !== ADMIN_ID && !managedObjects.includes(need.objectName)) {
            await clearPreviousMessages(ctx, userId);
            return ctx.reply('У вас нет прав для просмотра этой заявки.');
        }

        await clearPreviousMessages(ctx, userId);

        const formattedDate = parseAndFormatDate(need.date);
        const time = new Date(need.timestamp).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' });
        const typeName = TYPE_NAMES[need.type] || need.type;
        const urgencyInfo = URGENCY_NAMES[need.urgency] || { name: need.urgency, emoji: '' };
        const statusName = STATUS_NAMES[need.status] || need.status;

        let needText = `
<b>ЗАЯВКА НА ПОТРЕБНОСТИ</b>
📅 Дата: ${formattedDate}
🏢 Объект: ${escapeHtml(need.objectName)}
👷 Автор: ${escapeHtml(need.fullName)}
📦 Тип: ${typeName}
📝 Наименование: ${escapeHtml(need.name)}
`;
        if (need.quantity !== null && need.quantity !== undefined) {
            needText += `🔢 Количество: ${need.quantity}\n`;
        }
        needText += `${urgencyInfo.emoji} Срочность: ${urgencyInfo.name}\n`;
        needText += `📊 Статус: ${statusName}\n`;
        needText += `⏰ Время: ${time}`;

        const buttons = [
            [Markup.button.callback('✏️ Редактировать', `manage_edit_need_${needId}`)],
            [Markup.button.callback('📊 Изменить статус', `manage_change_need_status_${needId}`)],
            [Markup.button.callback('↩️ Назад', 'manage_all_needs')]
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
    
    if (!isNeedManager && user.organization && user.selectedObjects && user.selectedObjects.length > 0) {
        for (const objectName of user.selectedObjects) {
            const needUsers = await getNeedUsers(user.organization, objectName);
            if (needUsers && needUsers.includes(userId)) {
                isNeedManager = true;
                managedObjects.push(objectName);
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

        if (userId !== ADMIN_ID && !managedObjects.includes(need.objectName)) {
            return ctx.reply('У вас нет прав для редактирования этой заявки.');
        }

        await clearPreviousMessages(ctx, userId);

        const buttons = [
            [Markup.button.callback('📝 Наименование', `manage_edit_need_name_${needId}`)],
            [Markup.button.callback('🔢 Количество', `manage_edit_need_quantity_${needId}`)],
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
    
    if (!isNeedManager && user.organization && user.selectedObjects && user.selectedObjects.length > 0) {
        for (const objectName of user.selectedObjects) {
            const needUsers = await getNeedUsers(user.organization, objectName);
            if (needUsers && needUsers.includes(userId)) {
                isNeedManager = true;
                managedObjects.push(objectName);
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

        if (userId !== ADMIN_ID && !managedObjects.includes(need.objectName)) {
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

        const message = await ctx.reply('📝 Введите наименование:');
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
    bot.action(/select_need_item_(.+)/, (ctx) => showNeedDetails(ctx, ctx.match[1]));

    // Редактирование
    bot.action(/edit_need_(.+)/, (ctx) => editNeed(ctx, ctx.match[1]));
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
    bot.action(/edit_need_quantity_(.+)/, async (ctx) => {
        const needId = ctx.match[1];
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        const state = ensureUserState(ctx);
        if (state) {
            state.step = `editNeedQuantity`;
            state.editingNeedId = needId;
        }
        const message = await ctx.reply('🔢 Введите новое количество (или отправьте "0" чтобы убрать количество):');
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

    // Установка срочности при редактировании
    bot.action(/set_urgency_(.+)_(.+)/, async (ctx) => {
        const urgency = ctx.match[1];
        const needId = ctx.match[2];
        const userId = ctx.from.id.toString();
        const needs = await loadUserNeeds(userId);
        const need = needs[needId];

        if (!need) {
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

    // Удаление
    bot.action(/delete_need_(.+)/, (ctx) => deleteNeedConfirmation(ctx, ctx.match[1]));
    bot.action(/confirm_delete_need_(.+)/, (ctx) => confirmDeleteNeed(ctx, ctx.match[1]));

    // Управление заявками для ответственных
    bot.action(/manage_needs_object_(\d+)/, (ctx) => {
        const state = ensureUserState(ctx);
        showManagedNeedsDates(ctx, parseInt(ctx.match[1], 10), 0);
    });
    bot.action(/manage_needs_object_(\d+)_dates_page_(\d+)/, (ctx) => {
        showManagedNeedsDates(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10));
    });
    bot.action(/manage_needs_object_(\d+)_date_(\d+)/, (ctx) => {
        showManagedNeedsItems(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10), 0);
    });
    bot.action(/manage_needs_object_(\d+)_date_(\d+)_page_(\d+)/, (ctx) => {
        showManagedNeedsItems(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10), parseInt(ctx.match[3], 10));
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

    bot.action(/manage_edit_need_quantity_(.+)/, async (ctx) => {
        const needId = ctx.match[1];
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        const state = ensureUserState(ctx);
        if (state) {
            state.step = 'manage_edit_need_quantity';
            state.managedEditingNeedId = needId;
        }
        const message = await ctx.reply('🔢 Введите новое количество (или "0" чтобы убрать количество):');
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

    bot.action(/manage_set_need_status_(.+)_(.+)/, async (ctx) => {
        const needId = ctx.match[1];
        const status = ctx.match[2];
        const userId = ctx.from.id.toString();
        const users = await loadUsers();
        const user = users[userId];

        if (!user || !user.isApproved) return;

        let isNeedManager = userId === ADMIN_ID;
        const managedObjects = [];
        
        if (!isNeedManager && user.organization && user.selectedObjects && user.selectedObjects.length > 0) {
            for (const objectName of user.selectedObjects) {
                const needUsers = await getNeedUsers(user.organization, objectName);
                if (needUsers && needUsers.includes(userId)) {
                    isNeedManager = true;
                    managedObjects.push(objectName);
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

            if (userId !== ADMIN_ID && !managedObjects.includes(need.objectName)) {
                return ctx.reply('У вас нет прав для изменения статуса этой заявки.');
            }

            const oldStatus = need.status;
            need.status = status;
            await saveNeed(need.userId, need);
            
            // Уведомляем автора заявки об изменении статуса
            if (oldStatus !== status) {
                await notifyNeedAuthorStatusChange(ctx.telegram, need, oldStatus, status);
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

    bot.action(/manage_set_need_urgency_(.+)_(.+)/, async (ctx) => {
        const needId = ctx.match[1];
        const urgency = ctx.match[2];
        const userId = ctx.from.id.toString();
        const users = await loadUsers();
        const user = users[userId];

        if (!user || !user.isApproved) return;

        let isNeedManager = userId === ADMIN_ID;
        const managedObjects = [];
        
        if (!isNeedManager && user.organization && user.selectedObjects && user.selectedObjects.length > 0) {
            for (const objectName of user.selectedObjects) {
                const needUsers = await getNeedUsers(user.organization, objectName);
                if (needUsers && needUsers.includes(userId)) {
                    isNeedManager = true;
                    managedObjects.push(objectName);
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

            if (userId !== ADMIN_ID && !managedObjects.includes(need.objectName)) {
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
