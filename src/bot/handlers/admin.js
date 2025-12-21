const { Markup } = require('telegraf');
const { loadUsers, saveUser, deleteUser } = require('../../database/userModel');
const { clearPreviousMessages } = require('../utils');
const { showMainMenu } = require('./menu');
const { ADMIN_ID } = require('../../config/config');
const { loadInviteCode } = require('../../database/inviteCodeModel');
const { 
    getAllOrganizations, 
    getOrganization, 
    createOrganization, 
    updateOrganization, 
    deleteOrganization 
} = require('../../database/organizationModel');
const { 
    getAllPositions, 
    getPosition, 
    createPosition, 
    updatePosition, 
    deletePosition 
} = require('../../database/positionModel');
const { 
    getAllObjects, 
    getObject, 
    createObject, 
    updateObject, 
    deleteObject 
} = require('../../database/objectModel');
const { 
    getOrganizationObjects, 
    addObjectToOrganization, 
    removeObjectFromOrganization,
    removeAllObjectsFromOrganization,
    removeOrganizationFromObject
} = require('../../database/organizationObjectModel');
const { 
    getNotificationSettings: getNotifSettingsModel, 
    getAllNotificationSettings: getAllNotifSettingsModel,
    updateNotificationSettings 
} = require('../../database/notificationSettingsModel');
const { 
    loadAllReports,
    loadUserReports
} = require('../../database/reportModel');
const { 
    getOrganizations: getOrgFromService,
    getPositions: getPosFromService,
    getObjects: getObjFromService,
    getNotificationSettings,
    getAllNotificationSettings,
    clearConfigCache 
} = require('../../database/configService');
const { 
    formatNotificationMessage, 
    validateTimeFormat 
} = require('../utils/notificationHelper');

async function showAdminPanel(ctx) {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;

    await clearPreviousMessages(ctx, userId);
    const message = await ctx.reply(
        '👑 Админ-панель\nВыберите действие:',
        Markup.inlineKeyboard([
            [Markup.button.callback('📋 Просмотреть заявки', 'view_applications')],
            [Markup.button.callback('👥 Управление пользователями', 'admin_users')],
            [Markup.button.callback('📈 Статистика', 'admin_statistics')],
            [Markup.button.callback('🏢 Управление организациями', 'admin_organizations')],
            [Markup.button.callback('🏗 Управление объектами', 'admin_objects')],
            [Markup.button.callback('🔔 Настройки уведомлений', 'admin_notifications')],
            [Markup.button.callback('↩️ Назад', 'main_menu')]
        ])
    );
    ctx.state.userStates[userId].messageIds.push(message.message_id);
}

async function showApplications(ctx) {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;

    await clearPreviousMessages(ctx, userId);
    const users = await loadUsers();
    const pendingUsers = Object.entries(users).filter(([_, user]) => !user.isApproved);

    if (pendingUsers.length === 0) {
        const message = await ctx.reply('Заявок на рассмотрение нет.', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Назад', 'admin_panel')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        return;
    }

    const buttons = pendingUsers.map(([uid, user]) => [
        Markup.button.callback(
            `${user.fullName} (${user.organization})`,
            `review_${uid}`
        )
    ]);
    buttons.push([Markup.button.callback('↩️ Назад', 'admin_panel')]);

    const message = await ctx.reply('Заявки на рассмотрение:', Markup.inlineKeyboard(buttons));
    ctx.state.userStates[userId].messageIds.push(message.message_id);
}

// Вспомогательные функции для проверки использования
async function getUsersByOrganization(orgName) {
    const users = await loadUsers();
    return Object.entries(users).filter(([_, user]) => user.organization === orgName);
}

async function getUsersByPosition(positionName) {
    const users = await loadUsers();
    return Object.entries(users).filter(([_, user]) => user.position === positionName);
}

async function getUsersByObject(objectName) {
    const users = await loadUsers();
    return Object.entries(users).filter(([_, user]) => 
        Array.isArray(user.selectedObjects) && user.selectedObjects.includes(objectName)
    );
}

async function getReportsByObject(objectName) {
    const allReports = await loadAllReports();
    return Object.values(allReports).filter(report => report.objectName === objectName);
}

// Экспортируем функции для использования в других модулях
const exportedFunctions = {
    getUsersByObject,
    getReportsByObject
};

module.exports = (bot) => {
    bot.action('admin_panel', showAdminPanel);
    bot.action('view_applications', showApplications);

    bot.action(/review_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        const reviewUserId = ctx.match[1];
        const users = await loadUsers();
        const user = users[reviewUserId];

        if (!user || user.isApproved) return;

        const inviteCodeData = await loadInviteCode(reviewUserId);

        const creatorId = inviteCodeData?.createdBy;
        let creatorFullName;
        if (!inviteCodeData || !creatorId) {
            creatorFullName = 'Код не зарегистрирован';
        } else {
            const creator = users[creatorId];
            creatorFullName = creator ? creator.fullName : 'Пользователь не найден';
        }

        const usedAt = inviteCodeData?.usedAt
            ? new Date(inviteCodeData.usedAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })
            : 'Не указано';

        const selectedObjects = Array.isArray(user.selectedObjects)
            ? user.selectedObjects
            : user.selectedObjects
                ? [user.selectedObjects]
                : [];
        const objectsList = selectedObjects.length > 0
            ? selectedObjects.map(obj => `· ${obj}`).join('\n')
            : 'Не выбраны';

        await clearPreviousMessages(ctx, userId);

        const userData = `
📝 **Заявка на регистрацию**  
➖➖➖➖➖➖➖➖➖➖➖  
👤 **ФИО:** ${user.fullName || 'Не указано'}  
🏢 **Организация:** ${user.organization || 'Не указано'}  
💼 **Должность:** ${user.position || 'Не указана'}  
🏗 **Объекты:**  
${objectsList}  
🔑 **Код создан:** ${creatorFullName}  
⏰ **Использован:** ${usedAt}
        `.trim();

        const message = await ctx.reply(userData, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('✅ Одобрить', `approve_${reviewUserId}`)],
                [Markup.button.callback('❌ Отклонить', `reject_${reviewUserId}`)],
                [Markup.button.callback('↩️ Назад', 'view_applications')]
            ]).reply_markup
        });
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });

    bot.action(/approve_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        const approveUserId = ctx.match[1];
        const users = await loadUsers();
        const user = users[approveUserId];

        if (user && !user.isApproved) {
            users[approveUserId].isApproved = 1;
            await saveUser(approveUserId, users[approveUserId]);
            await ctx.telegram.sendMessage(approveUserId, '✅ Ваша заявка одобрена! Используйте /start для входа в меню.');
            await ctx.reply(`Заявка ${user.fullName || approveUserId} одобрена.`);
        }
        await showApplications(ctx);
    });

    bot.action(/reject_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        const rejectUserId = ctx.match[1];
        const users = await loadUsers();
        const user = users[rejectUserId];

        if (user && !user.isApproved) {
            await deleteUser(rejectUserId);
            await ctx.telegram.sendMessage(rejectUserId, '❌ Ваша заявка отклонена администратором.');
            await ctx.reply(`Заявка ${user.fullName || rejectUserId} отклонена.`);
        }
        await showApplications(ctx);
    });

    // ========== УПРАВЛЕНИЕ ОРГАНИЗАЦИЯМИ ==========
    
    const showOrganizationsList = async function showOrganizationsList(ctx) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        await clearPreviousMessages(ctx, userId);
        const organizations = await getAllOrganizations();
        
        if (organizations.length === 0) {
            const message = await ctx.reply('Организаций нет.', Markup.inlineKeyboard([
                [Markup.button.callback('➕ Добавить организацию', 'admin_org_add')],
                [Markup.button.callback('↩️ Назад', 'admin_panel')]
            ]));
            ctx.state.userStates[userId].messageIds.push(message.message_id);
            return;
        }
        
        // Сохраняем список организаций в state для использования в обработчике
        ctx.state.userStates[userId].adminOrganizationsList = organizations.map(org => org.name);
        
        // Создаем кнопки для организаций
        const buttons = [];
        for (let index = 0; index < organizations.length; index++) {
            const org = organizations[index];
            const buttonText = org.name || `Организация ${index + 1}`;
            const callbackData = `org_${index}`;
            buttons.push([Markup.button.callback(buttonText, callbackData)]);
        }
        buttons.push([Markup.button.callback('➕ Добавить организацию', 'admin_org_add')]);
        buttons.push([Markup.button.callback('↩️ Назад', 'admin_panel')]);
        
        const message = await ctx.reply('🏢 Управление организациями\nВыберите организацию:', Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    }

    bot.action('admin_organizations', showOrganizationsList);
    bot.action('admin_org_add', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_org_add_name';
        const message = await ctx.reply('Введите название новой организации:', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_organizations')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });

    bot.action(/^org_(\d+)$/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const orgIndex = parseInt(ctx.match[1], 10);
        const orgNames = ctx.state.userStates[userId].adminOrganizationsList;
        if (!orgNames || !orgNames[orgIndex]) {
            await ctx.reply('Организация не найдена.');
            await showOrganizationsList(ctx);
            return;
        }
        
        const orgName = orgNames[orgIndex];
        // Сохраняем индекс для кнопки "Назад" в редактировании
        ctx.state.userStates[userId].adminSelectedOrgIndex = orgIndex;
        // Сохраняем orgName для обработчиков редактирования/удаления
        ctx.state.userStates[userId].adminSelectedOrgName = orgName;
        await clearPreviousMessages(ctx, userId);
        
        const org = await getOrganization(orgName);
        if (!org) {
            await ctx.reply('Организация не найдена.');
            await showOrganizationsList(ctx);
            return;
        }
        
        const orgObjects = await getOrganizationObjects(orgName);
        const objectsList = orgObjects.length > 0 ? orgObjects.map(obj => `· ${obj}`).join('\n') : 'Не выбраны';
        
        const orgText = `
🏢 **${org.name}**

📱 ID чата: ${org.chatId || 'Не указан'}
📊 Источники отчетов: ${org.reportSources.length > 0 ? org.reportSources.join(', ') : 'Нет'}
🏗 Объекты:
${objectsList}
        `.trim();
        
        const message = await ctx.reply(orgText, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('✏️ Редактировать', 'admin_org_edit')],
                [Markup.button.callback('🗑 Удалить', 'admin_org_delete')],
                [Markup.button.callback('↩️ Назад', 'admin_organizations')]
            ]).reply_markup
        });
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });

    // Обработчик редактирования организации
    bot.action('admin_org_edit', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const orgName = ctx.state.userStates[userId].adminSelectedOrgName;
        if (!orgName) {
            await ctx.reply('Ошибка: организация не выбрана.');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        const orgIndex = ctx.state.userStates[userId].adminSelectedOrgIndex ?? ctx.state.userStates[userId].adminOrganizationsList?.indexOf(orgName) ?? 0;
        const message = await ctx.reply('Выберите, что хотите редактировать:', Markup.inlineKeyboard([
            [Markup.button.callback('✏️ Название', 'admin_org_edit_name')],
            [Markup.button.callback('📱 ID чата (Telegram)', 'admin_org_edit_chatid')],
            [Markup.button.callback('🏗 Объекты', 'admin_org_edit_objects')],
            [Markup.button.callback('💼 Редактирование должностей', 'admin_org_edit_positions')],
            [Markup.button.callback('↩️ Назад', `org_${orgIndex}`)]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_org_edit_name', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_org_edit_name';
        const message = await ctx.reply('Введите новое название организации:', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_org_edit')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_org_edit_chatid', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_org_edit_chatid';
        const message = await ctx.reply('Введите новый ID чата Telegram (или /clear для очистки):', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_org_edit')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_org_edit_objects', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const orgName = ctx.state.userStates[userId].adminSelectedOrgName;
        if (!orgName) {
            await ctx.reply('Ошибка: организация не выбрана.');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        
        // Получаем все объекты и объекты организации
        const allObjects = await getAllObjects();
        const orgObjects = await getOrganizationObjects(orgName);
        
        if (allObjects.length === 0) {
            await ctx.reply('В системе нет объектов. Сначала создайте объекты.');
            const orgIndex = ctx.state.userStates[userId].adminSelectedOrgIndex ?? 0;
            await ctx.telegram.sendMessage(ctx.chat.id, 'Вернуться к организации', Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Назад', `org_${orgIndex}`)]
            ]));
            return;
        }
        
        // Сохраняем текущее состояние выбранных объектов
        ctx.state.userStates[userId].adminOrgEditSelectedObjects = [...orgObjects];
        ctx.state.userStates[userId].adminOrgEditAvailableObjects = allObjects.map(obj => obj.name);
        
        // Создаем кнопки для объектов
        const buttons = allObjects.map((obj, index) => {
            const isSelected = orgObjects.includes(obj.name);
            return [Markup.button.callback(`${isSelected ? '✅ ' : ''}${obj.name}`, `admin_org_toggle_object_${index}`)];
        });
        buttons.push([Markup.button.callback('✅ Готово', 'admin_org_confirm_objects')]);
        buttons.push([Markup.button.callback('↩️ Отмена', 'admin_org_edit')]);
        
        const message = await ctx.reply('Выберите объекты для организации (можно выбрать несколько):', Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action(/admin_org_toggle_object_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const orgName = ctx.state.userStates[userId].adminSelectedOrgName;
        if (!orgName) {
            await ctx.reply('Ошибка: организация не выбрана.');
            return;
        }
        
        const objectIndex = parseInt(ctx.match[1], 10);
        const availableObjects = ctx.state.userStates[userId].adminOrgEditAvailableObjects;
        if (!availableObjects || !availableObjects[objectIndex]) {
            await ctx.reply('Объект не найден.');
            return;
        }
        
        const objectName = availableObjects[objectIndex];
        let selectedObjects = ctx.state.userStates[userId].adminOrgEditSelectedObjects || [];
        
        const index = selectedObjects.indexOf(objectName);
        if (index === -1) {
            selectedObjects.push(objectName);
        } else {
            selectedObjects.splice(index, 1);
        }
        
        ctx.state.userStates[userId].adminOrgEditSelectedObjects = selectedObjects;
        
        // Обновляем сообщение
        const allObjects = await getAllObjects();
        const buttons = allObjects.map((obj, idx) => {
            const isSelected = selectedObjects.includes(obj.name);
            return [Markup.button.callback(`${isSelected ? '✅ ' : ''}${obj.name}`, `admin_org_toggle_object_${idx}`)];
        });
        buttons.push([Markup.button.callback('✅ Готово', 'admin_org_confirm_objects')]);
        buttons.push([Markup.button.callback('↩️ Отмена', 'admin_org_edit')]);
        
        const lastMessageId = ctx.state.userStates[userId].messageIds[ctx.state.userStates[userId].messageIds.length - 1];
        try {
            await ctx.telegram.editMessageText(ctx.chat.id, lastMessageId, null, 'Выберите объекты для организации (можно выбрать несколько):', Markup.inlineKeyboard(buttons));
        } catch (e) {
            await ctx.reply('Выберите объекты для организации (можно выбрать несколько):', Markup.inlineKeyboard(buttons));
        }
    });
    
    bot.action('admin_org_confirm_objects', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const orgName = ctx.state.userStates[userId].adminSelectedOrgName;
        if (!orgName) {
            await ctx.reply('Ошибка: организация не выбрана.');
            return;
        }
        
        const selectedObjects = ctx.state.userStates[userId].adminOrgEditSelectedObjects || [];
        const currentOrgObjects = await getOrganizationObjects(orgName);
        
        // Определяем, какие объекты добавить, а какие удалить
        const toAdd = selectedObjects.filter(obj => !currentOrgObjects.includes(obj));
        const toRemove = currentOrgObjects.filter(obj => !selectedObjects.includes(obj));
        
        // Добавляем новые связи
        for (const objName of toAdd) {
            await addObjectToOrganization(orgName, objName);
        }
        
        // Удаляем старые связи
        for (const objName of toRemove) {
            await removeObjectFromOrganization(orgName, objName);
        }
        
        clearConfigCache();
        ctx.state.userStates[userId].adminOrgEditSelectedObjects = null;
        ctx.state.userStates[userId].adminOrgEditAvailableObjects = null;
        
        await ctx.reply(`✅ Объекты организации "${orgName}" успешно обновлены.`);
        const orgIndex = ctx.state.userStates[userId].adminSelectedOrgIndex ?? 0;
        
        // Возвращаемся к просмотру организации
        const orgNames = ctx.state.userStates[userId].adminOrganizationsList;
        if (orgNames && orgNames[orgIndex]) {
            // Используем существующий обработчик для отображения организации
            const orgNameToShow = orgNames[orgIndex];
            ctx.state.userStates[userId].adminSelectedOrgName = orgNameToShow;
            await clearPreviousMessages(ctx, userId);
            
            const org = await getOrganization(orgNameToShow);
            if (org) {
                const orgObjects = await getOrganizationObjects(orgNameToShow);
                const objectsList = orgObjects.length > 0 ? orgObjects.map(obj => `· ${obj}`).join('\n') : 'Не выбраны';
                
                const orgText = `
🏢 **${org.name}**

📱 ID чата: ${org.chatId || 'Не указан'}
📊 Источники отчетов: ${org.reportSources.length > 0 ? org.reportSources.join(', ') : 'Нет'}
🏗 Объекты:
${objectsList}
                `.trim();
                
                const message = await ctx.reply(orgText, {
                    parse_mode: 'Markdown',
                    reply_markup: Markup.inlineKeyboard([
                        [Markup.button.callback('✏️ Редактировать', 'admin_org_edit')],
                        [Markup.button.callback('🗑 Удалить', 'admin_org_delete')],
                        [Markup.button.callback('↩️ Назад', 'admin_organizations')]
                    ]).reply_markup
                });
                ctx.state.userStates[userId].messageIds.push(message.message_id);
            } else {
                await showOrganizationsList(ctx);
            }
        } else {
            await showOrganizationsList(ctx);
        }
    });
    
    // Обработчики удаления и редактирования организаций
    bot.action('admin_org_delete', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const orgName = ctx.state.userStates[userId].adminSelectedOrgName;
        if (!orgName) {
            await ctx.reply('Ошибка: организация не выбрана.');
            return;
        }
        
        // Проверяем использование организации
        const usersWithOrg = await getUsersByOrganization(orgName);
        if (usersWithOrg.length > 0) {
            // Предлагаем миграцию пользователей
            const allOrgs = await getAllOrganizations();
            const availableOrgs = allOrgs.filter(org => org.name !== orgName).map(org => org.name);
            
            if (availableOrgs.length === 0) {
                await ctx.reply(`⚠️ Невозможно удалить организацию "${orgName}". Она используется ${usersWithOrg.length} пользователем(ями), но нет других организаций для миграции.`);
                return;
            }
            
            // Сохраняем информацию для миграции
            ctx.state.userStates[userId].orgDeleteContext = {
                orgName,
                usersToMigrate: usersWithOrg.map(([uid, _]) => uid)
            };
            
            // Предлагаем выбрать организацию для миграции
            ctx.state.userStates[userId].availableOrgsForMigration = availableOrgs;
            const buttons = availableOrgs.slice(0, 10).map((org, index) => [
                Markup.button.callback(org, `admin_org_migrate_${index}`)
            ]);
            const orgIndex = ctx.state.userStates[userId].adminSelectedOrgIndex ?? 0;
            buttons.push([Markup.button.callback('↩️ Отмена', `org_${orgIndex}`)]);
            
            await ctx.reply(
                `⚠️ Организация "${orgName}" используется ${usersWithOrg.length} пользователем(ями).\n\nВыберите организацию для миграции пользователей:`,
                Markup.inlineKeyboard(buttons)
            );
            return;
        }
        
        // Если нет пользователей, удаляем организацию
        await removeAllObjectsFromOrganization(orgName);
        await deleteOrganization(orgName);
        clearConfigCache();
        
        await ctx.reply(`✅ Организация "${orgName}" удалена.`);
        await showOrganizationsList(ctx);
    });
    
    bot.action(/admin_org_migrate_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const orgIndex = parseInt(ctx.match[1], 10);
        const context = ctx.state.userStates[userId].orgDeleteContext;
        const availableOrgs = ctx.state.userStates[userId].availableOrgsForMigration;
        
        if (!context || !availableOrgs || !availableOrgs[orgIndex]) {
            await ctx.reply('Ошибка: контекст миграции не найден.');
            return;
        }
        
        const targetOrg = availableOrgs[orgIndex];
        const users = await loadUsers();
        
        // Мигрируем пользователей
        for (const uid of context.usersToMigrate) {
            if (users[uid]) {
                users[uid].organization = targetOrg;
                await saveUser(uid, users[uid]);
            }
        }
        
        // Удаляем связи организации с объектами
        await removeAllObjectsFromOrganization(context.orgName);
        // Удаляем организацию
        await deleteOrganization(context.orgName);
        clearConfigCache();
        
        // Очищаем контекст
        delete ctx.state.userStates[userId].orgDeleteContext;
        delete ctx.state.userStates[userId].availableOrgsForMigration;
        
        await ctx.reply(`✅ Организация "${context.orgName}" удалена. Пользователи мигрированы в "${targetOrg}".`);
        await showOrganizationsList(ctx);
    });
    
    // ========== УПРАВЛЕНИЕ ДОЛЖНОСТЯМИ ОРГАНИЗАЦИИ ==========
    bot.action('admin_org_edit_positions', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const orgName = ctx.state.userStates[userId].adminSelectedOrgName;
        if (!orgName) {
            await ctx.reply('Ошибка: организация не выбрана.');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        const positions = await getAllPositions(orgName);
        ctx.state.userStates[userId].adminPositionsList = positions.map(pos => pos.name);
        ctx.state.userStates[userId].adminSelectedOrgName = orgName; // Сохраняем организацию для других обработчиков
        
        const buttons = [];
        for (let index = 0; index < positions.length; index++) {
            const pos = positions[index];
            const buttonText = pos.name || `Должность ${index + 1}`;
            const callbackData = `admin_org_pos_${index}`;
            buttons.push([Markup.button.callback(buttonText, callbackData)]);
        }
        buttons.push([Markup.button.callback('➕ Добавить должность', 'admin_org_pos_add')]);
        buttons.push([Markup.button.callback('↩️ Назад', 'admin_org_edit')]);
        const message = await ctx.reply(`💼 Редактирование должностей\nОрганизация: **${orgName}**\n\nВыберите должность:`, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(buttons).reply_markup
        });
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_org_pos_add', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const orgName = ctx.state.userStates[userId].adminSelectedOrgName;
        if (!orgName) {
            await ctx.reply('Ошибка: организация не выбрана.');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_org_pos_add_name';
        const message = await ctx.reply('Введите название новой должности:', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_org_edit_positions')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action(/^admin_org_pos_(\d+)$/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const orgName = ctx.state.userStates[userId].adminSelectedOrgName;
        if (!orgName) {
            await ctx.reply('Ошибка: организация не выбрана.');
            return;
        }
        
        const posIndex = parseInt(ctx.match[1], 10);
        const posNames = ctx.state.userStates[userId].adminPositionsList;
        if (!posNames || !posNames[posIndex]) {
            await ctx.reply('Должность не найдена.');
            await ctx.telegram.sendMessage(ctx.chat.id, 'Вернуться к должностям', Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Назад', 'admin_org_edit_positions')]
            ]));
            return;
        }
        const posName = posNames[posIndex];
        ctx.state.userStates[userId].adminSelectedPosName = posName;
        ctx.state.userStates[userId].adminSelectedOrgName = orgName;
        
        const usersWithPos = await getUsersByPosition(posName);
        await clearPreviousMessages(ctx, userId);
        const posText = `💼 **${posName}**\n\n👥 Используется пользователями: ${usersWithPos.length}`;
        const message = await ctx.reply(posText, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('🗑 Удалить', 'admin_org_pos_delete')],
                [Markup.button.callback('↩️ Назад', 'admin_org_edit_positions')]
            ]).reply_markup
        });
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_org_pos_delete', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const posName = ctx.state.userStates[userId].adminSelectedPosName;
        const orgName = ctx.state.userStates[userId].adminSelectedOrgName;
        if (!posName || !orgName) {
            await ctx.reply('Ошибка: должность или организация не выбраны.');
            return;
        }
        
        const usersWithPos = await getUsersByPosition(posName);
        if (usersWithPos.length > 0) {
            await ctx.reply(`⚠️ Невозможно удалить должность "${posName}". Она используется ${usersWithPos.length} пользователем(ями).`);
            return;
        }
        await deletePosition(orgName, posName);
        clearConfigCache();
        await ctx.reply(`✅ Должность "${posName}" удалена.`);
        
        // Возвращаемся к списку должностей организации
        await ctx.telegram.sendMessage(ctx.chat.id, 'Вернуться к должностям', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Назад', 'admin_org_edit_positions')]
        ]));
    });

    // ========== УПРАВЛЕНИЕ ОБЪЕКТАМИ ==========
    const showObjectsList = async function showObjectsList(ctx) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        await clearPreviousMessages(ctx, userId);
        const objects = await getAllObjects();
        ctx.state.userStates[userId].adminObjectsList = objects.map(obj => obj.name);
        const buttons = [];
        for (let index = 0; index < objects.length; index++) {
            const obj = objects[index];
            const buttonText = obj.name || `Объект ${index + 1}`;
            const callbackData = `obj_${index}`;
            buttons.push([Markup.button.callback(buttonText, callbackData)]);
        }
        buttons.push([Markup.button.callback('➕ Добавить объект', 'admin_obj_add')]);
        buttons.push([Markup.button.callback('↩️ Назад', 'admin_panel')]);
        const message = await ctx.reply('🏗 Управление объектами\nВыберите объект:', Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    }
    bot.action('admin_objects', showObjectsList);
    bot.action('admin_obj_add', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_obj_add_name';
        const message = await ctx.reply('Введите название нового объекта:', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_objects')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action(/^obj_(\d+)$/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const objIndex = parseInt(ctx.match[1], 10);
        const objNames = ctx.state.userStates[userId].adminObjectsList;
        if (!objNames || !objNames[objIndex]) {
            await ctx.reply('Объект не найден.');
            await showObjectsList(ctx);
            return;
        }
        const objName = objNames[objIndex];
        ctx.state.userStates[userId].adminSelectedObjName = objName;
        
        const obj = await getObject(objName);
        const usersWithObj = await getUsersByObject(objName);
        const reportsWithObj = await getReportsByObject(objName);
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].adminSelectedObjIndex = objIndex;
        const statusEmoji = obj.status === 'В работе' ? '🟢' : '❄️';
        const objText = `🏗 **${obj.name}**\n\n📱 ID группы: ${obj.telegramGroupId || 'Не указан'}\n📊 Статус: ${statusEmoji} ${obj.status || 'В работе'}\n👥 Используется пользователями: ${usersWithObj.length}\n📄 Отчетов: ${reportsWithObj.length}`;
        const buttons = [
            [Markup.button.callback('✏️ Редактировать', 'admin_obj_edit')],
            [Markup.button.callback('🗑 Удалить', 'admin_obj_delete')],
            [Markup.button.callback('↩️ Назад', 'admin_objects')]
        ];
        const message = await ctx.reply(objText, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(buttons).reply_markup
        });
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_obj_edit', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const objName = ctx.state.userStates[userId].adminSelectedObjName;
        if (!objName) {
            await ctx.reply('Ошибка: объект не выбран.');
            return;
        }
        
        const obj = await getObject(objName);
        const objIndex = ctx.state.userStates[userId].adminSelectedObjIndex ?? 0;
        
        await clearPreviousMessages(ctx, userId);
        const statusEmoji = obj.status === 'В работе' ? '🟢' : '❄️';
        const message = await ctx.reply(`✏️ Редактирование объекта "${objName}"\n\n📊 Статус: ${statusEmoji} ${obj.status || 'В работе'}`, Markup.inlineKeyboard([
            [Markup.button.callback('📊 Статус', 'admin_obj_edit_status')],
            [Markup.button.callback('📱 ID группы (Telegram)', 'admin_obj_edit_groupid')],
            [Markup.button.callback('👁 Просмотреть группу', 'admin_obj_view_group')],
            [Markup.button.callback('↩️ Назад', `obj_${objIndex}`)]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_obj_edit_status', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const objName = ctx.state.userStates[userId].adminSelectedObjName;
        if (!objName) {
            await ctx.reply('Ошибка: объект не выбран.');
            return;
        }
        
        const obj = await getObject(objName);
        const objIndex = ctx.state.userStates[userId].adminSelectedObjIndex ?? 0;
        const currentStatus = obj.status || 'В работе';
        
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply(`📊 Выберите статус для объекта "${objName}":\n\nТекущий статус: ${currentStatus === 'В работе' ? '🟢 В работе' : '❄️ Заморожен'}`, Markup.inlineKeyboard([
            [Markup.button.callback(currentStatus === 'В работе' ? '✅ 🟢 В работе' : '🟢 В работе', 'admin_obj_set_status_work')],
            [Markup.button.callback(currentStatus === 'Заморожен' ? '✅ ❄️ Заморожен' : '❄️ Заморожен', 'admin_obj_set_status_frozen')],
            [Markup.button.callback('↩️ Назад', 'admin_obj_edit')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_obj_set_status_work', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const objName = ctx.state.userStates[userId].adminSelectedObjName;
        if (!objName) {
            await ctx.reply('Ошибка: объект не выбран.');
            return;
        }
        
        await updateObject(objName, { status: 'В работе' });
        clearConfigCache();
        await ctx.answerCbQuery('Статус изменен на "В работе"');
        
        // Возвращаемся к редактированию объекта
        const objIndex = ctx.state.userStates[userId].adminSelectedObjIndex ?? 0;
        const fakeCtx = {
            ...ctx,
            match: [null, objIndex.toString()],
            state: ctx.state
        };
        // Имитируем клик на объект для обновления отображения
        const obj = await getObject(objName);
        await clearPreviousMessages(ctx, userId);
        const usersWithObj = await getUsersByObject(objName);
        const reportsWithObj = await getReportsByObject(objName);
        ctx.state.userStates[userId].adminSelectedObjIndex = objIndex;
        const statusEmoji = '🟢';
        const objText = `🏗 **${obj.name}**\n\n📱 ID группы: ${obj.telegramGroupId || 'Не указан'}\n📊 Статус: ${statusEmoji} ${obj.status || 'В работе'}\n👥 Используется пользователями: ${usersWithObj.length}\n📄 Отчетов: ${reportsWithObj.length}`;
        const buttons = [
            [Markup.button.callback('✏️ Редактировать', 'admin_obj_edit')],
            [Markup.button.callback('🗑 Удалить', 'admin_obj_delete')],
            [Markup.button.callback('↩️ Назад', 'admin_objects')]
        ];
        const message = await ctx.reply(objText, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(buttons).reply_markup
        });
        ctx.state.userStates[userId].messageIds = [message.message_id];
    });
    
    bot.action('admin_obj_set_status_frozen', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const objName = ctx.state.userStates[userId].adminSelectedObjName;
        if (!objName) {
            await ctx.reply('Ошибка: объект не выбран.');
            return;
        }
        
        await updateObject(objName, { status: 'Заморожен' });
        clearConfigCache();
        await ctx.answerCbQuery('Статус изменен на "Заморожен"');
        
        // Возвращаемся к редактированию объекта
        const objIndex = ctx.state.userStates[userId].adminSelectedObjIndex ?? 0;
        const obj = await getObject(objName);
        await clearPreviousMessages(ctx, userId);
        const usersWithObj = await getUsersByObject(objName);
        const reportsWithObj = await getReportsByObject(objName);
        ctx.state.userStates[userId].adminSelectedObjIndex = objIndex;
        const statusEmoji = '❄️';
        const objText = `🏗 **${obj.name}**\n\n📱 ID группы: ${obj.telegramGroupId || 'Не указан'}\n📊 Статус: ${statusEmoji} ${obj.status || 'В работе'}\n👥 Используется пользователями: ${usersWithObj.length}\n📄 Отчетов: ${reportsWithObj.length}`;
        const buttons = [
            [Markup.button.callback('✏️ Редактировать', 'admin_obj_edit')],
            [Markup.button.callback('🗑 Удалить', 'admin_obj_delete')],
            [Markup.button.callback('↩️ Назад', 'admin_objects')]
        ];
        const message = await ctx.reply(objText, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(buttons).reply_markup
        });
        ctx.state.userStates[userId].messageIds = [message.message_id];
    });
    
    bot.action('admin_obj_edit_groupid', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_obj_edit_groupid';
        const message = await ctx.reply('Введите новый ID группы Telegram (или /clear для очистки):', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_obj_edit')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_obj_view_group', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objName = ctx.state.userStates[userId].adminSelectedObjName;
        if (!objName) {
            await ctx.reply('Ошибка: объект не выбран.');
            return;
        }
        
        const obj = await getObject(objName);
        if (!obj || !obj.telegramGroupId) {
            await ctx.reply('ID группы не указан для этого объекта.');
            return;
        }
        
        try {
            const chatId = obj.telegramGroupId;
            const chat = await ctx.telegram.getChat(chatId);
            
            let chatInfo = `📱 Информация о группе для объекта "${objName}":\n\n`;
            chatInfo += `ID: ${chatId}\n`;
            
            if (chat.title) {
                chatInfo += `Название: ${chat.title}\n`;
            }
            if (chat.type) {
                chatInfo += `Тип: ${chat.type}\n`;
            }
            if (chat.username) {
                chatInfo += `Username: @${chat.username}\n`;
            }
            if (chat.description) {
                chatInfo += `Описание: ${chat.description}\n`;
            }
            
            await ctx.reply(chatInfo);
        } catch (error) {
            await ctx.reply(`❌ Ошибка при получении информации о группе: ${error.message}\n\nПроверьте, что:\n1. ID группы корректный\n2. Бот добавлен в группу\n3. Бот имеет права на просмотр информации о группе`);
        }
    });
    
    bot.action('admin_obj_delete', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const objName = ctx.state.userStates[userId].adminSelectedObjName;
        if (!objName) {
            await ctx.reply('Ошибка: объект не выбран.');
            return;
        }
        const usersWithObj = await getUsersByObject(objName);
        const reportsWithObj = await getReportsByObject(objName);
        
        if (reportsWithObj.length > 0) {
            // Предупреждаем о наличии отчетов и предлагаем удалить вместе с отчетами
            await ctx.reply(
                `⚠️ Внимание! Объект "${objName}" имеет ${reportsWithObj.length} отчетов.\n\nПри удалении объекта все отчеты будут также удалены.\n\nПодтвердите удаление:`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('✅ Да, удалить с отчетами', 'admin_obj_delete_with_reports')],
                    [Markup.button.callback('❌ Отмена', `obj_${ctx.state.userStates[userId].adminObjectsList?.indexOf(objName) ?? 0}`)]
                ])
            );
            return;
        }
        
        if (usersWithObj.length > 0) {
            // Предлагаем миграцию пользователей
            const users = await loadUsers();
            const userOrgs = [...new Set(usersWithObj.map(([uid, _]) => users[uid]?.organization).filter(Boolean))];
            const allOrgs = await getAllOrganizations();
            const orgNames = allOrgs.map(org => org.name);
            
            // Сохраняем информацию для миграции
            ctx.state.userStates[userId].objDeleteContext = {
                objName,
                usersToMigrate: usersWithObj.map(([uid, _]) => uid),
                userOrgs
            };
            
            // Получаем доступные объекты для миграции (все объекты кроме удаляемого)
            const allObjects = await getAllObjects();
            const availableObjects = allObjects.filter(obj => obj.name !== objName).map(obj => obj.name);
            
            if (availableObjects.length === 0) {
                await ctx.reply(`⚠️ Невозможно удалить объект "${objName}". Используется ${usersWithObj.length} пользователем(ями), но нет других объектов для миграции.`);
                return;
            }
            
            // Предлагаем выбрать объект для миграции
            ctx.state.userStates[userId].availableObjectsForMigration = availableObjects;
            const currentObjIndex = allObjects.findIndex(o => o.name === objName);
            const buttons = availableObjects.slice(0, 10).map((obj, index) => [
                Markup.button.callback(obj, `admin_obj_migrate_${index}`)
            ]);
            buttons.push([Markup.button.callback('↩️ Отмена', `obj_${currentObjIndex}`)]);
            
            await ctx.reply(
                `⚠️ Объект "${objName}" используется ${usersWithObj.length} пользователем(ями).\n\nВыберите объект для миграции пользователей:`,
                Markup.inlineKeyboard(buttons)
            );
            return;
        }
        
        // Если нет пользователей и отчетов, удаляем объект
        await removeOrganizationFromObject(objName);
        await deleteObject(objName);
        clearConfigCache();
        await ctx.reply(`✅ Объект "${objName}" удален.`);
        await showObjectsList(ctx);
    });
    
    bot.action(/admin_obj_migrate_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const objIndex = parseInt(ctx.match[1], 10);
        const context = ctx.state.userStates[userId].objDeleteContext;
        const availableObjects = ctx.state.userStates[userId].availableObjectsForMigration;
        
        if (!context || !availableObjects || !availableObjects[objIndex]) {
            await ctx.reply('Ошибка: контекст миграции не найден.');
            return;
        }
        
        const targetObject = availableObjects[objIndex];
        const users = await loadUsers();
        
        // Мигрируем пользователей
        for (const uid of context.usersToMigrate) {
            if (users[uid] && Array.isArray(users[uid].selectedObjects)) {
                // Удаляем старый объект из списка пользователя
                users[uid].selectedObjects = users[uid].selectedObjects.filter(obj => obj !== context.objName);
                // Добавляем новый объект, если его еще нет
                if (!users[uid].selectedObjects.includes(targetObject)) {
                    users[uid].selectedObjects.push(targetObject);
                }
                await saveUser(uid, users[uid]);
            }
        }
        
        // Удаляем объект
        await removeOrganizationFromObject(context.objName);
        await deleteObject(context.objName);
        clearConfigCache();
        
        // Очищаем контекст
        delete ctx.state.userStates[userId].objDeleteContext;
        delete ctx.state.userStates[userId].availableObjectsForMigration;
        
        await ctx.reply(`✅ Объект "${context.objName}" удален. Пользователи мигрированы на "${targetObject}".`);
        await showObjectsList(ctx);
    });
    
    bot.action('admin_obj_delete_with_reports', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objName = ctx.state.userStates[userId].adminSelectedObjName;
        if (!objName) {
            await ctx.reply('Ошибка: объект не выбран.');
            return;
        }
        
        const usersWithObj = await getUsersByObject(objName);
        const reportsWithObj = await getReportsByObject(objName);
        
        try {
            // Удаляем все отчеты объекта
            if (reportsWithObj.length > 0) {
                const db = await require('../../config/mongoConfig').connectMongo();
                const reportsCollection = db.collection('reports');
                for (const report of reportsWithObj) {
                    await reportsCollection.deleteOne({ reportid: report.reportId });
                }
            }
            
            // Мигрируем пользователей, если есть
            if (usersWithObj.length > 0) {
                const allObjects = await getAllObjects();
                const availableObjects = allObjects.filter(obj => obj.name !== objName).map(obj => obj.name);
                
                if (availableObjects.length > 0) {
                    // Используем первый доступный объект для миграции
                    const targetObject = availableObjects[0];
                    const users = await loadUsers();
                    
                    for (const [uid, _] of usersWithObj) {
                        if (users[uid] && Array.isArray(users[uid].selectedObjects)) {
                            users[uid].selectedObjects = users[uid].selectedObjects.filter(obj => obj !== objName);
                            if (!users[uid].selectedObjects.includes(targetObject)) {
                                users[uid].selectedObjects.push(targetObject);
                            }
                            await saveUser(uid, users[uid]);
                        }
                    }
                    
                    await ctx.reply(`✅ Объект "${objName}" удален вместе с ${reportsWithObj.length} отчетами. Пользователи мигрированы на "${targetObject}".`);
                } else {
                    // Если нет объектов для миграции, просто удаляем объект из списка пользователей
                    const users = await loadUsers();
                    for (const [uid, _] of usersWithObj) {
                        if (users[uid] && Array.isArray(users[uid].selectedObjects)) {
                            users[uid].selectedObjects = users[uid].selectedObjects.filter(obj => obj !== objName);
                            await saveUser(uid, users[uid]);
                        }
                    }
                    await ctx.reply(`✅ Объект "${objName}" удален вместе с ${reportsWithObj.length} отчетами.`);
                }
            } else {
                await ctx.reply(`✅ Объект "${objName}" удален вместе с ${reportsWithObj.length} отчетами.`);
            }
            
            // Удаляем связи объекта с организациями
            await removeOrganizationFromObject(objName);
            // Удаляем объект
            await deleteObject(objName);
            clearConfigCache();
            
            await showObjectsList(ctx);
        } catch (error) {
            console.error('Ошибка при удалении объекта с отчетами:', error);
            await ctx.reply('Ошибка при удалении объекта: ' + error.message);
        }
    });

    // ========== НАСТРОЙКИ УВЕДОМЛЕНИЙ ==========
    bot.action('admin_notifications', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        await clearPreviousMessages(ctx, userId);
        
        const message = await ctx.reply(
            '🔔 **Настройки уведомлений**\n\nВыберите тип уведомлений для настройки:',
            {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('📋 Отчеты', 'admin_notif_select_reports')],
                    [Markup.button.callback('📊 Статистика', 'admin_notif_select_statistics')],
                    [Markup.button.callback('↩️ Назад', 'admin_panel')]
                ]).reply_markup
            }
        );
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    const showNotificationSettings = async (ctx, type) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        await clearPreviousMessages(ctx, userId);
        const settings = await getNotificationSettings(type);
        const enabledText = settings.enabled ? '✅ Включены' : '❌ Выключены';
        const typeName = type === 'reports' ? 'Отчеты' : 'Статистика';
        let settingsText = `🔔 **Настройки уведомлений: ${typeName}**\n\n${enabledText}\n⏰ Время: ${settings.time}\n🌍 Часовой пояс: ${settings.timezone}`;
        
        if (type === 'reports' && settings.messageTemplate) {
            settingsText += `\n📝 Шаблон сообщения:\n${settings.messageTemplate}`;
        }
        
        const buttons = [
            [Markup.button.callback(settings.enabled ? '❌ Выключить' : '✅ Включить', `admin_notif_toggle_${type}`)],
            [Markup.button.callback('⏰ Изменить время', `admin_notif_time_${type}`)]
        ];
        
        if (type === 'reports') {
            buttons.push([Markup.button.callback('📝 Изменить текст', `admin_notif_text_${type}`)]);
            buttons.push([Markup.button.callback('👁 Предпросмотр', `admin_notif_preview_${type}`)]);
        }
        
        buttons.push([Markup.button.callback('↩️ Назад', 'admin_notifications')]);
        
        const message = await ctx.reply(settingsText.trim(), {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(buttons).reply_markup
        });
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        ctx.state.userStates[userId].currentNotificationType = type;
    };
    
    bot.action('admin_notif_select_reports', async (ctx) => {
        await showNotificationSettings(ctx, 'reports');
    });
    
    bot.action('admin_notif_select_statistics', async (ctx) => {
        await showNotificationSettings(ctx, 'statistics');
    });
    
    bot.action(/^admin_notif_toggle_(reports|statistics)$/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const type = ctx.match[1];
        const settings = await getNotificationSettings(type);
        await updateNotificationSettings(type, { enabled: !settings.enabled });
        clearConfigCache();
        const botInstance = require('../bot');
        if (botInstance.setupAllNotificationCrons) await botInstance.setupAllNotificationCrons();
        await ctx.answerCbQuery('Настройки сохранены');
        await showNotificationSettings(ctx, type);
    });
    
    bot.action(/^admin_notif_time_(reports|statistics)$/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const type = ctx.match[1];
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = `admin_notif_edit_time_${type}`;
        ctx.state.userStates[userId].currentNotificationType = type;
        const message = await ctx.reply('Введите новое время в формате HH:mm (например, 19:00):', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', `admin_notif_select_${type}`)]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action(/^admin_notif_text_(reports|statistics)$/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const type = ctx.match[1];
        if (type !== 'reports') {
            await ctx.answerCbQuery('Изменение текста доступно только для уведомлений об отчетах');
            return;
        }
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = `admin_notif_edit_text_${type}`;
        ctx.state.userStates[userId].currentNotificationType = type;
        const message = await ctx.reply('Введите новый текст шаблона. Используйте переменные {fullName} и {date}:', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', `admin_notif_select_${type}`)]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action(/^admin_notif_preview_(reports|statistics)$/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const type = ctx.match[1];
        if (type !== 'reports') {
            await ctx.answerCbQuery('Предпросмотр доступен только для уведомлений об отчетах');
            return;
        }
        const settings = await getNotificationSettings(type);
        const previewText = formatNotificationMessage(settings.messageTemplate, {
            fullName: 'Иванов Иван Иванович',
            date: '25.12.2024'
        });
        await ctx.reply(`Предпросмотр сообщения:\n\n${previewText}`, Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Назад', `admin_notif_select_${type}`)]
        ]));
    });
    
    // ========== СТАТИСТИКА ==========
    async function showStatistics(ctx) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        await clearPreviousMessages(ctx, userId);
        const users = await loadUsers();
        const { loadAllReports } = require('../../database/reportModel');
        const { formatDate } = require('../utils');
        const allReports = await loadAllReports();
        
        // Подсчет статистики пользователей
        const totalUsers = Object.keys(users).length;
        const approvedUsers = Object.values(users).filter(u => u.isApproved).length;
        const pendingUsers = totalUsers - approvedUsers;
        
        // Статистика по организациям
        const orgStats = {};
        Object.values(users).forEach(user => {
            const org = user.organization || 'Не указана';
            orgStats[org] = (orgStats[org] || 0) + 1;
        });
        
        // Статистика по должностям
        const positionStats = {};
        Object.values(users).forEach(user => {
            const pos = user.position || 'Не указана';
            positionStats[pos] = (positionStats[pos] || 0) + 1;
        });
        
        // Статистика по статусам
        const statusStats = {
            'В работе': Object.values(users).filter(u => u.status === 'В работе').length,
            'В отпуске': Object.values(users).filter(u => u.status === 'В отпуске').length
        };
        
        // Статистика по отчетам
        const allReportsArray = Object.values(allReports);
        const totalReports = allReportsArray.length;
        
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        
        const reportsToday = allReportsArray.filter(r => {
            const reportDate = r.timestamp ? new Date(r.timestamp) : new Date(0);
            return reportDate >= today;
        }).length;
        
        const reportsWeek = allReportsArray.filter(r => {
            const reportDate = r.timestamp ? new Date(r.timestamp) : new Date(0);
            return reportDate >= weekAgo;
        }).length;
        
        const reportsMonth = allReportsArray.filter(r => {
            const reportDate = r.timestamp ? new Date(r.timestamp) : new Date(0);
            return reportDate >= monthAgo;
        }).length;
        
        // Формируем текст статистики
        let statsText = `📈 **Статистика системы**\n\n`;
        
        statsText += `👥 **Пользователи:**\n`;
        statsText += `Всего: ${totalUsers}\n`;
        statsText += `✅ Одобренные: ${approvedUsers}\n`;
        statsText += `⏳ Неодобренные: ${pendingUsers}\n\n`;
        
        statsText += `🏢 **По организациям:**\n`;
        for (const [org, count] of Object.entries(orgStats).sort((a, b) => b[1] - a[1])) {
            statsText += `${org}: ${count}\n`;
        }
        statsText += `\n`;
        
        statsText += `💼 **По должностям:**\n`;
        for (const [pos, count] of Object.entries(positionStats).sort((a, b) => b[1] - a[1])) {
            statsText += `${pos}: ${count}\n`;
        }
        statsText += `\n`;
        
        statsText += `📊 **По статусам:**\n`;
        statsText += `🟢 В работе: ${statusStats['В работе']}\n`;
        statsText += `🔴 В отпуске: ${statusStats['В отпуске']}\n\n`;
        
        statsText += `📋 **Отчеты:**\n`;
        statsText += `Всего: ${totalReports}\n`;
        statsText += `За сегодня: ${reportsToday}\n`;
        statsText += `За неделю: ${reportsWeek}\n`;
        statsText += `За месяц: ${reportsMonth}\n`;
        
        // Breadcrumbs
        ctx.state.userStates[userId].adminBreadcrumbs = ['Админ-панель', 'Статистика'];
        const breadcrumbsText = getBreadcrumbsText(ctx.state.userStates[userId].adminBreadcrumbs);
        const statsTextWithBreadcrumbs = breadcrumbsText + statsText;
        
        const message = await ctx.reply(statsTextWithBreadcrumbs, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('🏠 Главная', 'admin_panel')],
                [Markup.button.callback('🔄 Обновить', 'admin_statistics')],
                [Markup.button.callback('↩️ Назад', 'admin_panel')]
            ]).reply_markup
        });
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    }
    
    bot.action('admin_statistics', async (ctx) => {
        await showStatistics(ctx);
    });
    
    // ========== УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ ==========
    
    // Функция форматирования breadcrumbs
    function getBreadcrumbsText(breadcrumbs) {
        if (!breadcrumbs || breadcrumbs.length === 0) return '';
        return breadcrumbs.join(' > ') + '\n';
    }
    
    // Функция поиска пользователей
    function searchUsers(users, query) {
        if (!query || !query.trim()) return Object.entries(users);
        
        const searchQuery = query.trim().toLowerCase();
        return Object.entries(users).filter(([uid, user]) => {
            // Поиск по ФИО (регистронезависимый)
            if (user.fullName && user.fullName.toLowerCase().includes(searchQuery)) {
                return true;
            }
            // Поиск по телефону
            if (user.phone && user.phone.includes(searchQuery)) {
                return true;
            }
            // Поиск по Telegram ID
            if (uid.includes(searchQuery)) {
                return true;
            }
            return false;
        });
    }
    
    // Функция сортировки пользователей
    async function sortUsers(usersEntries, sortField, sortOrder) {
        if (!sortField || !sortOrder) return usersEntries;
        
        const sorted = [...usersEntries];
        
        switch (sortField) {
            case 'fullName':
                sorted.sort((a, b) => {
                    const nameA = (a[1].fullName || '').toLowerCase();
                    const nameB = (b[1].fullName || '').toLowerCase();
                    return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
                });
                break;
            case 'createdAt':
                sorted.sort((a, b) => {
                    const dateA = a[1].createdAt ? new Date(a[1].createdAt) : new Date(0);
                    const dateB = b[1].createdAt ? new Date(b[1].createdAt) : new Date(0);
                    return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
                });
                break;
            case 'reportsCount':
                // Получаем количество отчетов для каждого пользователя одним запросом
                const { loadAllReports } = require('../../database/reportModel');
                const allReports = await loadAllReports();
                const reportsCounts = {};
                Object.values(allReports).forEach(report => {
                    const uid = report.userId;
                    reportsCounts[uid] = (reportsCounts[uid] || 0) + 1;
                });
                sorted.sort((a, b) => {
                    const countA = reportsCounts[a[0]] || 0;
                    const countB = reportsCounts[b[0]] || 0;
                    return sortOrder === 'asc' ? countA - countB : countB - countA;
                });
                break;
            case 'isApproved':
                sorted.sort((a, b) => {
                    const approvedA = a[1].isApproved ? 1 : 0;
                    const approvedB = b[1].isApproved ? 1 : 0;
                    return sortOrder === 'asc' ? approvedA - approvedB : approvedB - approvedA;
                });
                break;
            default:
                break;
        }
        
        return sorted;
    }
    
    // Функция фильтрации пользователей
    async function applyUserFilters(users, filters, sortField = null, sortOrder = null) {
        let filtered = Object.entries(users);
        
        // Применяем поиск, если есть
        if (filters.search) {
            filtered = searchUsers(Object.fromEntries(filtered), filters.search);
        }
        
        if (filters.org) {
            filtered = filtered.filter(([_, user]) => user.organization === filters.org);
        }
        
        if (filters.obj) {
            filtered = filtered.filter(([_, user]) => 
                Array.isArray(user.selectedObjects) && user.selectedObjects.includes(filters.obj)
            );
        }
        
        if (filters.status !== undefined) {
            if (filters.status === 'approved') {
                filtered = filtered.filter(([_, user]) => user.isApproved);
            } else if (filters.status === 'pending') {
                filtered = filtered.filter(([_, user]) => !user.isApproved);
            }
        }
        
        // Применяем сортировку
        if (sortField && sortOrder) {
            filtered = await sortUsers(filtered, sortField, sortOrder);
        }
        
        return filtered;
    }
    
    // Главная страница управления пользователями
    async function showUsersList(ctx, filters = {}, page = 0) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        // Инициализируем state, если его нет
        if (!ctx.state.userStates[userId]) {
            ctx.state.userStates[userId] = { messageIds: [] };
        }
        if (ctx.state.userStates[userId].adminMultiSelectMode === undefined) {
            ctx.state.userStates[userId].adminMultiSelectMode = false;
        }
        if (!ctx.state.userStates[userId].adminSelectedUsers) {
            ctx.state.userStates[userId].adminSelectedUsers = [];
        }
        
        await clearPreviousMessages(ctx, userId);
        const users = await loadUsers();
        
        // Получаем текущую сортировку
        const sortField = ctx.state.userStates[userId].adminUserSort?.field || null;
        const sortOrder = ctx.state.userStates[userId].adminUserSort?.order || null;
        
        // Применяем фильтры и сортировку
        const filteredUsers = await applyUserFilters(users, filters, sortField, sortOrder);
        const totalPages = Math.ceil(filteredUsers.length / 10);
        const currentPage = Math.min(page, Math.max(0, totalPages - 1));
        
        // Сохраняем текущее состояние
        ctx.state.userStates[userId].adminUserFilters = filters;
        ctx.state.userStates[userId].adminUsersList = filteredUsers.map(([uid, _]) => uid);
        ctx.state.userStates[userId].adminUsersPage = currentPage;
        
        // Получаем пользователей для текущей страницы
        const pageUsers = filteredUsers.slice(currentPage * 10, (currentPage + 1) * 10);
        
        // Создаем кнопки для пользователей
        const buttons = [];
        for (let i = 0; i < pageUsers.length; i++) {
            const [uid, user] = pageUsers[i];
            const buttonText = `${user.fullName || 'Без имени'} (${user.organization || 'Без организации'}) - ${user.position || 'Без должности'}`;
            buttons.push([Markup.button.callback(buttonText, `admin_user_view_${i}`)]);
        }
        
        // Кнопки фильтрации и сортировки
        buttons.push([
            Markup.button.callback('🔍 Поиск', 'admin_users_search'),
            Markup.button.callback('🔄 Сортировка', 'admin_users_sort')
        ]);
        buttons.push([
            Markup.button.callback('🔍 Фильтр: Организация', 'admin_users_filter_org'),
            Markup.button.callback('🔍 Фильтр: Объект', 'admin_users_filter_obj')
        ]);
        buttons.push([
            Markup.button.callback('✅ Только одобренные', 'admin_users_filter_approved'),
            Markup.button.callback('⏳ Только неодобренные', 'admin_users_filter_pending')
        ]);
        if (filters.org || filters.obj || filters.status !== undefined || filters.search) {
            buttons.push([Markup.button.callback('🔄 Сбросить фильтры', 'admin_users_filter_reset')]);
        }
        
        // Кнопки пагинации
        const navButtons = [];
        if (currentPage > 0) {
            navButtons.push(Markup.button.callback('◀️ Назад', `admin_users_page_${currentPage - 1}`));
        }
        if (currentPage < totalPages - 1) {
            navButtons.push(Markup.button.callback('▶️ Вперед', `admin_users_page_${currentPage + 1}`));
        }
        if (navButtons.length > 0) {
            buttons.push(navButtons);
        }
        
        // Кнопка режима мультивыбора
        const multiSelectMode = ctx.state.userStates[userId].adminMultiSelectMode === true;
        if (multiSelectMode) {
            const selectedCount = (ctx.state.userStates[userId].adminSelectedUsers || []).length;
            buttons.push([
                Markup.button.callback(`☑️ Режим выбора (${selectedCount})`, 'admin_users_toggle_select_mode'),
                Markup.button.callback('⚙️ Действия', 'admin_users_bulk_actions')
            ]);
        } else {
            buttons.push([Markup.button.callback('☑️ Режим выбора', 'admin_users_toggle_select_mode')]);
        }
        
        buttons.push([
            Markup.button.callback('📊 Экспорт в Excel', 'admin_users_export_excel'),
            Markup.button.callback('➕ Добавить пользователя', 'admin_user_add')
        ]);
        buttons.push([Markup.button.callback('↩️ Назад', 'admin_panel')]);
        
        const filterText = [];
        if (filters.search) filterText.push(`Поиск: "${filters.search}"`);
        if (filters.org) filterText.push(`Организация: ${filters.org}`);
        if (filters.obj) filterText.push(`Объект: ${filters.obj}`);
        if (filters.status === 'approved') filterText.push('Статус: Одобренные');
        if (filters.status === 'pending') filterText.push('Статус: Неодобренные');
        
        let sortText = '';
        if (sortField) {
            const sortNames = {
                'fullName': 'ФИО',
                'createdAt': 'Дата регистрации',
                'reportsCount': 'Количество отчетов',
                'isApproved': 'Статус одобрения'
            };
            const orderNames = {
                'asc': sortField === 'fullName' ? 'А-Я' : 'По возрастанию',
                'desc': sortField === 'fullName' ? 'Я-А' : 'По убыванию'
            };
            sortText = `\nСортировка: ${sortNames[sortField]} (${orderNames[sortOrder]})`;
        }
        
        // Breadcrumbs
        ctx.state.userStates[userId].adminBreadcrumbs = ['Админ-панель', 'Пользователи'];
        const breadcrumbsText = getBreadcrumbsText(ctx.state.userStates[userId].adminBreadcrumbs);
        
        const headerText = filterText.length > 0 
            ? `${breadcrumbsText}👥 Управление пользователями\n\nФильтры: ${filterText.join(', ')}${sortText}\nВсего: ${filteredUsers.length}\nСтраница ${currentPage + 1} из ${totalPages || 1}`
            : `${breadcrumbsText}👥 Управление пользователями${sortText}\n\nВсего: ${filteredUsers.length}\nСтраница ${currentPage + 1} из ${totalPages || 1}`;
        
        // Добавляем кнопку "Главная" в начало списка кнопок
        const buttonsWithHome = [
            [Markup.button.callback('🏠 Главная', 'admin_panel')],
            ...buttons
        ];
        
        const message = await ctx.reply(headerText, Markup.inlineKeyboard(buttonsWithHome));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    }
    
    bot.action('admin_users', async (ctx) => {
        await showUsersList(ctx, {}, 0);
    });
    
    // Обработчики фильтрации
    bot.action('admin_users_filter_org', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const organizations = await getAllOrganizations();
        const buttons = organizations.map((org, index) => [
            Markup.button.callback(org.name, `admin_users_filter_org_${index}`)
        ]);
        buttons.push([Markup.button.callback('↩️ Отмена', 'admin_users')]);
        
        const message = await ctx.reply('Выберите организацию для фильтра:', Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        ctx.state.userStates[userId].adminFilterOrgs = organizations.map(org => org.name);
    });
    
    bot.action(/admin_users_filter_org_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const orgIndex = parseInt(ctx.match[1], 10);
        const orgNames = ctx.state.userStates[userId].adminFilterOrgs;
        if (!orgNames || !orgNames[orgIndex]) {
            await ctx.reply('Организация не найдена.');
            return;
        }
        
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        filters.org = orgNames[orgIndex];
        await showUsersList(ctx, filters, 0);
    });
    
    bot.action('admin_users_filter_obj', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objects = await getAllObjects();
        const buttons = objects.map((obj, index) => [
            Markup.button.callback(obj.name, `admin_users_filter_obj_${index}`)
        ]);
        buttons.push([Markup.button.callback('↩️ Отмена', 'admin_users')]);
        
        const message = await ctx.reply('Выберите объект для фильтра:', Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        ctx.state.userStates[userId].adminFilterObjs = objects.map(obj => obj.name);
    });
    
    bot.action(/admin_users_filter_obj_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objIndex = parseInt(ctx.match[1], 10);
        const objNames = ctx.state.userStates[userId].adminFilterObjs;
        if (!objNames || !objNames[objIndex]) {
            await ctx.reply('Объект не найден.');
            return;
        }
        
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        filters.obj = objNames[objIndex];
        await showUsersList(ctx, filters, 0);
    });
    
    bot.action('admin_users_filter_approved', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        filters.status = 'approved';
        await showUsersList(ctx, filters, 0);
    });
    
    bot.action('admin_users_filter_pending', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        filters.status = 'pending';
        await showUsersList(ctx, filters, 0);
    });
    
    bot.action('admin_users_filter_reset', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        ctx.state.userStates[userId].adminUserSearch = null;
        await showUsersList(ctx, {}, 0);
    });
    
    // Обработчик поиска
    bot.action('admin_users_search', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_users_search_input';
        const message = await ctx.reply('Введите поисковый запрос (ФИО, телефон или Telegram ID):', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_users')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    // Обработчик сортировки
    bot.action('admin_users_sort', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply('Выберите тип сортировки:', Markup.inlineKeyboard([
            [Markup.button.callback('📝 По ФИО (А-Я)', 'admin_users_sort_fullname_asc')],
            [Markup.button.callback('📝 По ФИО (Я-А)', 'admin_users_sort_fullname_desc')],
            [Markup.button.callback('📅 По дате регистрации (новые)', 'admin_users_sort_created_desc')],
            [Markup.button.callback('📅 По дате регистрации (старые)', 'admin_users_sort_created_asc')],
            [Markup.button.callback('📊 По количеству отчетов (больше)', 'admin_users_sort_reports_desc')],
            [Markup.button.callback('📊 По количеству отчетов (меньше)', 'admin_users_sort_reports_asc')],
            [Markup.button.callback('✅ По статусу одобрения', 'admin_users_sort_approved_desc')],
            [Markup.button.callback('🔄 Сбросить сортировку', 'admin_users_sort_reset')],
            [Markup.button.callback('↩️ Отмена', 'admin_users')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action(/admin_users_sort_(fullname|created|reports|approved)_(asc|desc)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const sortFieldMap = {
            'fullname': 'fullName',
            'created': 'createdAt',
            'reports': 'reportsCount',
            'approved': 'isApproved'
        };
        
        const field = sortFieldMap[ctx.match[1]];
        const order = ctx.match[2];
        
        ctx.state.userStates[userId].adminUserSort = { field, order };
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        await showUsersList(ctx, filters, 0);
    });
    
    bot.action('admin_users_sort_reset', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        ctx.state.userStates[userId].adminUserSort = null;
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        await showUsersList(ctx, filters, 0);
    });
    
    bot.action(/admin_users_page_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const page = parseInt(ctx.match[1], 10);
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        await showUsersList(ctx, filters, page);
    });
    
    // Экспорт пользователей в Excel
    async function exportUsersToExcel(ctx, users, filters) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const ExcelJS = require('exceljs');
        const { formatDate } = require('../utils');
        const { loadAllReports } = require('../../database/reportModel');
        
        // Применяем фильтры и сортировку
        const sortField = ctx.state.userStates[userId].adminUserSort?.field || null;
        const sortOrder = ctx.state.userStates[userId].adminUserSort?.order || null;
        const filteredUsers = await applyUserFilters(users, filters, sortField, sortOrder);
        
        if (filteredUsers.length === 0) {
            await ctx.reply('Нет пользователей для экспорта.');
            return;
        }
        
        // Получаем количество отчетов для каждого пользователя
        const allReports = await loadAllReports();
        const reportsCounts = {};
        Object.values(allReports).forEach(report => {
            const uid = report.userId;
            reportsCounts[uid] = (reportsCounts[uid] || 0) + 1;
        });
        
        await clearPreviousMessages(ctx, userId);
        
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Пользователи');
        
        // Стили
        const headerStyle = {
            font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } },
            alignment: { horizontal: 'center', vertical: 'middle' },
            border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
        };
        
        const cellStyle = {
            font: { name: 'Arial', size: 9 },
            alignment: { vertical: 'middle', wrapText: true },
            border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
        };
        
        // Заголовки
        worksheet.columns = [
            { header: 'ФИО', key: 'fullName', width: 30 },
            { header: 'Telegram ID', key: 'telegramId', width: 15 },
            { header: 'Должность', key: 'position', width: 25 },
            { header: 'Организация', key: 'organization', width: 30 },
            { header: 'Телефон', key: 'phone', width: 15 },
            { header: 'Объекты', key: 'objects', width: 40 },
            { header: 'Статус', key: 'status', width: 15 },
            { header: 'Одобрен', key: 'isApproved', width: 12 },
            { header: 'Дата регистрации', key: 'createdAt', width: 18 },
            { header: 'Количество отчетов', key: 'reportsCount', width: 18 }
        ];
        
        // Применяем стили к заголовкам
        worksheet.getRow(1).eachCell((cell) => {
            cell.style = headerStyle;
        });
        
        // Заполняем данные
        for (const [uid, user] of filteredUsers) {
            const row = worksheet.addRow({
                fullName: user.fullName || '',
                telegramId: uid,
                position: user.position || '',
                organization: user.organization || '',
                phone: user.phone || '',
                objects: Array.isArray(user.selectedObjects) ? user.selectedObjects.join(', ') : '',
                status: user.status || '',
                isApproved: user.isApproved ? 'Да' : 'Нет',
                createdAt: user.createdAt ? formatDate(new Date(user.createdAt)) : '',
                reportsCount: reportsCounts[uid] || 0
            });
            
            row.eachCell((cell) => {
                cell.style = cellStyle;
            });
        }
        
        // Фиксируем первую строку
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];
        
        const buffer = await workbook.xlsx.writeBuffer();
        const filename = `users_export_${formatDate(new Date()).replace(/\./g, '_')}.xlsx`;
        
        const documentMessage = await ctx.replyWithDocument({ source: buffer, filename });
        ctx.state.userStates[userId].messageIds.push(documentMessage.message_id);
    }
    
    bot.action('admin_users_export_excel', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const users = await loadUsers();
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        await exportUsersToExcel(ctx, users, filters);
    });
    
    // Получение расширенной информации о пользователе
    async function getUserExtendedInfo(targetUserId, user) {
        const { loadUserReports } = require('../../database/reportModel');
        const { formatDate } = require('../utils');
        
        const reports = await loadUserReports(targetUserId);
        const reportsCount = Object.keys(reports).length;
        
        // Находим последний отчет
        let lastActivity = 'Нет отчетов';
        let lastReportDate = null;
        if (reportsCount > 0) {
            const reportEntries = Object.values(reports);
            reportEntries.sort((a, b) => {
                const dateA = a.timestamp ? new Date(a.timestamp) : new Date(0);
                const dateB = b.timestamp ? new Date(b.timestamp) : new Date(0);
                return dateB - dateA;
            });
            const lastReport = reportEntries[0];
            if (lastReport && lastReport.timestamp) {
                lastReportDate = new Date(lastReport.timestamp);
                lastActivity = formatDate(lastReportDate);
            }
        }
        
        // Форматируем дату регистрации
        let registrationDate = 'Не указана';
        if (user.createdAt) {
            registrationDate = formatDate(new Date(user.createdAt));
        }
        
        return {
            reportsCount,
            lastActivity,
            lastReportDate,
            registrationDate
        };
    }
    
    // Просмотр детальной информации о пользователе
    async function showUserDetails(ctx, targetUserId, returnPage = 0) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        await clearPreviousMessages(ctx, userId);
        const users = await loadUsers();
        const user = users[targetUserId];
        
        if (!user) {
            await ctx.reply('Пользователь не найден.');
            await showUsersList(ctx, ctx.state.userStates[userId].adminUserFilters || {}, returnPage);
            return;
        }
        
        // Получаем расширенную информацию
        const extendedInfo = await getUserExtendedInfo(targetUserId, user);
        
        // Получаем информацию о Telegram пользователе
        let telegramInfo = `ID: ${targetUserId}`;
        try {
            // Пытаемся получить информацию о пользователе через getChat
            const chat = await ctx.telegram.getChat(targetUserId);
            if (chat) {
                if (chat.username) {
                    telegramInfo = `@${chat.username} (ID: ${targetUserId})`;
                } else if (chat.first_name) {
                    telegramInfo = `${chat.first_name || ''} ${chat.last_name || ''}`.trim() || `ID: ${targetUserId}`;
                }
            }
        } catch (e) {
            // Если не удалось получить информацию, используем только ID
        }
        
        const objectsList = Array.isArray(user.selectedObjects) && user.selectedObjects.length > 0
            ? user.selectedObjects.map(obj => `· ${obj}`).join('\n')
            : 'Не выбраны';
        
        const statusEmoji = user.status === 'В работе' ? '🟢' : user.status === 'В отпуске' ? '🔴' : '⏳';
        const approvedStatus = user.isApproved ? '✅ Одобрен' : '⏳ Не одобрен';
        
        // Breadcrumbs
        ctx.state.userStates[userId].adminBreadcrumbs = ['Админ-панель', 'Пользователи', user.fullName || 'Без имени'];
        const breadcrumbsText = getBreadcrumbsText(ctx.state.userStates[userId].adminBreadcrumbs);
        
        const userText = `
${breadcrumbsText}👤 **${user.fullName || 'Без имени'}**

📱 Telegram: ${telegramInfo}
💼 Должность: ${user.position || 'Не указана'}
🏢 Организация: ${user.organization || 'Не указана'}
📞 Телефон: ${user.phone || 'Не указан'}
${statusEmoji} Статус: ${user.status || 'Не указан'}
${approvedStatus}

📅 Дата регистрации: ${extendedInfo.registrationDate}
📊 Количество отчетов: ${extendedInfo.reportsCount}
🕐 Последняя активность: ${extendedInfo.lastActivity}

🏗 Объекты:
${objectsList}
        `.trim();
        
        // Сохраняем выбранного пользователя и страницу возврата
        ctx.state.userStates[userId].adminSelectedUserId = targetUserId;
        ctx.state.userStates[userId].adminUsersReturnPage = returnPage;
        
        // Быстрые действия
        const quickActions = [];
        if (user.phone) {
            quickActions.push(Markup.button.url('📞 Позвонить', `tel:${user.phone}`));
        }
        quickActions.push(Markup.button.url('💬 Написать', `tg://user?id=${targetUserId}`));
        
        const actionButtons = [];
        actionButtons.push([Markup.button.callback('🏠 Главная', 'admin_panel')]);
        if (quickActions.length > 0) {
            actionButtons.push(quickActions);
        }
        actionButtons.push(
            [Markup.button.callback('📋 История изменений', `admin_user_history_${targetUserId}`)],
            [Markup.button.callback('✏️ Редактировать ФИО', 'admin_user_edit_fullname')],
            [Markup.button.callback('✏️ Редактировать должность', 'admin_user_edit_position')],
            [Markup.button.callback('✏️ Редактировать организацию', 'admin_user_edit_organization')],
            [Markup.button.callback('✏️ Редактировать телефон', 'admin_user_edit_phone')],
            [Markup.button.callback('✏️ Редактировать объекты', 'admin_user_edit_objects')],
            [Markup.button.callback('✏️ Изменить статус', 'admin_user_edit_status')],
            [Markup.button.callback(user.isApproved ? '❌ Отклонить' : '✅ Одобрить', 'admin_user_toggle_approved')],
            [Markup.button.callback('🗑 Удалить', 'admin_user_delete')],
            [Markup.button.callback('↩️ Назад', 'admin_users')]
        );
        
        const message = await ctx.reply(userText, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(actionButtons).reply_markup
        });
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    }
    
    bot.action(/admin_user_view_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const userIndex = parseInt(ctx.match[1], 10);
        const userList = ctx.state.userStates[userId].adminUsersList;
        const returnPage = ctx.state.userStates[userId].adminUsersPage || 0;
        
        if (!userList || !userList[userIndex]) {
            await ctx.reply('Пользователь не найден.');
            return;
        }
        
        const targetUserId = userList[userIndex];
        await showUserDetails(ctx, targetUserId, returnPage);
    });
    
    // Быстрые действия из списка
    bot.action(/admin_user_quick_approve_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const userIndex = parseInt(ctx.match[1], 10);
        const userList = ctx.state.userStates[userId].adminUsersList;
        
        if (!userList || !userList[userIndex]) {
            await ctx.reply('Пользователь не найден.');
            return;
        }
        
        const targetUserId = userList[userIndex];
        const users = await loadUsers();
        if (users[targetUserId]) {
            users[targetUserId].isApproved = 1;
            await saveUser(targetUserId, users[targetUserId]);
            
            // Логируем изменение
            const { logUserChange } = require('../../database/auditLogModel');
            await logUserChange(targetUserId, userId, 'approve', 'isApproved', 0, 1);
            
            await ctx.answerCbQuery('Пользователь одобрен');
            const filters = ctx.state.userStates[userId].adminUserFilters || {};
            const page = ctx.state.userStates[userId].adminUsersPage || 0;
            await showUsersList(ctx, filters, page);
        }
    });
    
    bot.action(/admin_user_quick_disapprove_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const userIndex = parseInt(ctx.match[1], 10);
        const userList = ctx.state.userStates[userId].adminUsersList;
        
        if (!userList || !userList[userIndex]) {
            await ctx.reply('Пользователь не найден.');
            return;
        }
        
        const targetUserId = userList[userIndex];
        const users = await loadUsers();
        if (users[targetUserId]) {
            users[targetUserId].isApproved = 0;
            await saveUser(targetUserId, users[targetUserId]);
            
            // Логируем изменение
            const { logUserChange } = require('../../database/auditLogModel');
            await logUserChange(targetUserId, userId, 'disapprove', 'isApproved', 1, 0);
            
            await ctx.answerCbQuery('Пользователь отклонен');
            const filters = ctx.state.userStates[userId].adminUserFilters || {};
            const page = ctx.state.userStates[userId].adminUsersPage || 0;
            await showUsersList(ctx, filters, page);
        }
    });
    
    // Обработчики редактирования пользователя
    bot.action('admin_user_edit_fullname', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        if (!targetUserId) {
            await ctx.reply('Ошибка: пользователь не выбран.');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_user_edit_fullname';
        const message = await ctx.reply('Введите новое ФИО:', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_user_back')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_user_edit_phone', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        if (!targetUserId) {
            await ctx.reply('Ошибка: пользователь не выбран.');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_user_edit_phone';
        const message = await ctx.reply('Введите новый телефон:', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_user_back')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_user_edit_position', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        if (!targetUserId) {
            await ctx.reply('Ошибка: пользователь не выбран.');
            return;
        }
        
        const users = await loadUsers();
        const targetUser = users[targetUserId];
        if (!targetUser) {
            await ctx.reply('Ошибка: пользователь не найден.');
            return;
        }
        
        const userOrganization = targetUser.organization;
        if (!userOrganization) {
            await ctx.reply('У пользователя не указана организация. Сначала укажите организацию.');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        const positions = await getAllPositions(userOrganization);
        if (positions.length === 0) {
            await ctx.reply(`Для организации "${userOrganization}" не настроены должности. Сначала создайте должности для этой организации.`);
            return;
        }
        
        const buttons = positions.map((pos, index) => [
            Markup.button.callback(pos.name, `admin_user_set_position_${index}`)
        ]);
        buttons.push([Markup.button.callback('↩️ Отмена', 'admin_user_back')]);
        
        ctx.state.userStates[userId].adminEditPositions = positions.map(pos => pos.name);
        const message = await ctx.reply(`Выберите новую должность (организация: ${userOrganization}):`, Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action(/admin_user_set_position_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const posIndex = parseInt(ctx.match[1], 10);
        const posNames = ctx.state.userStates[userId].adminEditPositions;
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        
        if (!posNames || !posNames[posIndex] || !targetUserId) {
            await ctx.reply('Ошибка: данные не найдены.');
            return;
        }
        
        const users = await loadUsers();
        if (users[targetUserId]) {
            const oldValue = users[targetUserId].position;
            users[targetUserId].position = posNames[posIndex];
            await saveUser(targetUserId, users[targetUserId]);
            
            // Логируем изменение
            const { logUserChange } = require('../../database/auditLogModel');
            await logUserChange(targetUserId, userId, 'update', 'position', oldValue, posNames[posIndex]);
            
            await ctx.reply(`Должность изменена на "${posNames[posIndex]}".`);
            const returnPage = ctx.state.userStates[userId].adminUsersReturnPage || 0;
            await showUserDetails(ctx, targetUserId, returnPage);
        }
    });
    
    bot.action('admin_user_edit_organization', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        if (!targetUserId) {
            await ctx.reply('Ошибка: пользователь не выбран.');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        const organizations = await getAllOrganizations();
        const buttons = organizations.map((org, index) => [
            Markup.button.callback(org.name, `admin_user_set_org_${index}`)
        ]);
        buttons.push([Markup.button.callback('↩️ Отмена', 'admin_user_back')]);
        
        ctx.state.userStates[userId].adminEditOrgs = organizations.map(org => org.name);
        const message = await ctx.reply('Выберите новую организацию:', Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action(/admin_user_set_org_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const orgIndex = parseInt(ctx.match[1], 10);
        const orgNames = ctx.state.userStates[userId].adminEditOrgs;
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        
        if (!orgNames || !orgNames[orgIndex] || !targetUserId) {
            await ctx.reply('Ошибка: данные не найдены.');
            return;
        }
        
        const users = await loadUsers();
        if (users[targetUserId]) {
            const oldValue = users[targetUserId].organization;
            users[targetUserId].organization = orgNames[orgIndex];
            await saveUser(targetUserId, users[targetUserId]);
            
            // Логируем изменение
            const { logUserChange } = require('../../database/auditLogModel');
            await logUserChange(targetUserId, userId, 'update', 'organization', oldValue, orgNames[orgIndex]);
            
            await ctx.reply(`Организация изменена на "${orgNames[orgIndex]}".`);
            const returnPage = ctx.state.userStates[userId].adminUsersReturnPage || 0;
            await showUserDetails(ctx, targetUserId, returnPage);
        }
    });
    
    bot.action('admin_user_edit_objects', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        if (!targetUserId) {
            await ctx.reply('Ошибка: пользователь не выбран.');
            return;
        }
        
        const users = await loadUsers();
        const user = users[targetUserId];
        if (!user) {
            await ctx.reply('Пользователь не найден.');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        
        // Используем специальный step для админского редактирования
        if (!ctx.state.userStates[targetUserId]) {
            ctx.state.userStates[targetUserId] = { messageIds: [] };
        }
        const targetState = ctx.state.userStates[targetUserId];
        targetState.step = 'admin_user_edit_objects';
        targetState.selectedObjects = [...(user.selectedObjects || [])];
        
        // Создаем собственный интерфейс выбора объектов для админа
        const { getOrganizationObjects } = require('../../database/configService');
        const availableObjects = await getOrganizationObjects(user.organization);
        
        if (!availableObjects.length) {
            await ctx.reply('Для организации пользователя нет доступных объектов.');
            return;
        }
        
        const buttons = availableObjects.map((obj, index) => {
            const isSelected = targetState.selectedObjects.includes(obj);
            return [Markup.button.callback(`${isSelected ? '✅ ' : ''}${obj}`, `admin_toggle_object_${index}_${targetUserId}`)];
        });
        buttons.push([Markup.button.callback('✅ Готово', `admin_confirm_objects_${targetUserId}`)]);
        buttons.push([Markup.button.callback('↩️ Отмена', 'admin_user_back')]);
        
        const message = await ctx.reply('Выберите объекты (можно выбрать несколько):', Markup.inlineKeyboard(buttons));
        targetState.messageIds = [message.message_id];
    });
    
    bot.action(/admin_toggle_object_(\d+)_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objectIndex = parseInt(ctx.match[1], 10);
        const targetUserId = ctx.match[2];
        
        const { getOrganizationObjects } = require('../../database/configService');
        const users = await loadUsers();
        const user = users[targetUserId];
        if (!user) {
            await ctx.reply('Пользователь не найден.');
            return;
        }
        
        const availableObjects = await getOrganizationObjects(user.organization);
        const objectName = availableObjects[objectIndex];
        
        if (!ctx.state.userStates[targetUserId]) {
            ctx.state.userStates[targetUserId] = { messageIds: [] };
        }
        const targetState = ctx.state.userStates[targetUserId];
        
        if (targetState.step !== 'admin_user_edit_objects') return;
        
        let selectedObjects = targetState.selectedObjects || [];
        const index = selectedObjects.indexOf(objectName);
        if (index === -1) {
            selectedObjects.push(objectName);
        } else {
            selectedObjects.splice(index, 1);
        }
        targetState.selectedObjects = selectedObjects;
        
        // Обновляем сообщение
        const buttons = availableObjects.map((obj, idx) => {
            const isSelected = selectedObjects.includes(obj);
            return [Markup.button.callback(`${isSelected ? '✅ ' : ''}${obj}`, `admin_toggle_object_${idx}_${targetUserId}`)];
        });
        buttons.push([Markup.button.callback('✅ Готово', `admin_confirm_objects_${targetUserId}`)]);
        buttons.push([Markup.button.callback('↩️ Отмена', 'admin_user_back')]);
        
        const lastMessageId = targetState.messageIds[targetState.messageIds.length - 1];
        try {
            await ctx.telegram.editMessageText(ctx.chat.id, lastMessageId, null, 'Выберите объекты (можно выбрать несколько):', Markup.inlineKeyboard(buttons));
        } catch (e) {
            await ctx.reply('Выберите объекты (можно выбрать несколько):', Markup.inlineKeyboard(buttons));
        }
    });
    
    // Обработчик подтверждения объектов при редактировании в админ-панели
    bot.action(/admin_confirm_objects_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.match[1];
        const targetState = ctx.state.userStates[targetUserId];
        
        if (!targetState || !targetState.selectedObjects || targetState.step !== 'admin_user_edit_objects') {
            await ctx.reply('Ошибка: объекты не выбраны.');
            return;
        }
        
        const users = await loadUsers();
        if (users[targetUserId]) {
            const oldValue = JSON.stringify(users[targetUserId].selectedObjects || []);
            users[targetUserId].selectedObjects = targetState.selectedObjects;
            await saveUser(targetUserId, users[targetUserId]);
            
            // Логируем изменение
            const { logUserChange } = require('../../database/auditLogModel');
            await logUserChange(targetUserId, userId, 'update', 'selectedObjects', oldValue, JSON.stringify(targetState.selectedObjects));
            
            targetState.step = null;
            targetState.selectedObjects = [];
            await ctx.reply('Объекты успешно обновлены.');
            const returnPage = ctx.state.userStates[userId].adminUsersReturnPage || 0;
            await showUserDetails(ctx, targetUserId, returnPage);
        }
    });
    
    bot.action('admin_user_edit_status', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        if (!targetUserId) {
            await ctx.reply('Ошибка: пользователь не выбран.');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply('Выберите новый статус:', Markup.inlineKeyboard([
            [Markup.button.callback('🟢 В работе', 'admin_user_set_status_work')],
            [Markup.button.callback('🔴 В отпуске', 'admin_user_set_status_vacation')],
            [Markup.button.callback('↩️ Отмена', 'admin_user_back')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_user_set_status_work', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        if (!targetUserId) {
            await ctx.reply('Ошибка: пользователь не выбран.');
            return;
        }
        
        const users = await loadUsers();
        if (users[targetUserId]) {
            const oldValue = users[targetUserId].status;
            users[targetUserId].status = 'В работе';
            await saveUser(targetUserId, users[targetUserId]);
            
            // Логируем изменение
            const { logUserChange } = require('../../database/auditLogModel');
            await logUserChange(targetUserId, userId, 'update', 'status', oldValue, 'В работе');
            
            await ctx.reply('Статус изменен на "В работе".');
            const returnPage = ctx.state.userStates[userId].adminUsersReturnPage || 0;
            await showUserDetails(ctx, targetUserId, returnPage);
        }
    });
    
    bot.action('admin_user_set_status_vacation', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        if (!targetUserId) {
            await ctx.reply('Ошибка: пользователь не выбран.');
            return;
        }
        
        const users = await loadUsers();
        if (users[targetUserId]) {
            const oldValue = users[targetUserId].status;
            users[targetUserId].status = 'В отпуске';
            await saveUser(targetUserId, users[targetUserId]);
            
            // Логируем изменение
            const { logUserChange } = require('../../database/auditLogModel');
            await logUserChange(targetUserId, userId, 'update', 'status', oldValue, 'В отпуске');
            
            await ctx.reply('Статус изменен на "В отпуске".');
            const returnPage = ctx.state.userStates[userId].adminUsersReturnPage || 0;
            await showUserDetails(ctx, targetUserId, returnPage);
        }
    });
    
    bot.action('admin_user_toggle_approved', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        if (!targetUserId) {
            await ctx.reply('Ошибка: пользователь не выбран.');
            return;
        }
        
        const users = await loadUsers();
        if (users[targetUserId]) {
            const oldValue = users[targetUserId].isApproved;
            users[targetUserId].isApproved = users[targetUserId].isApproved ? 0 : 1;
            await saveUser(targetUserId, users[targetUserId]);
            
            // Логируем изменение
            const { logUserChange } = require('../../database/auditLogModel');
            await logUserChange(targetUserId, userId, users[targetUserId].isApproved ? 'approve' : 'disapprove', 'isApproved', oldValue, users[targetUserId].isApproved);
            
            const status = users[targetUserId].isApproved ? 'одобрен' : 'отклонен';
            await ctx.reply(`Пользователь ${status}.`);
            const returnPage = ctx.state.userStates[userId].adminUsersReturnPage || 0;
            await showUserDetails(ctx, targetUserId, returnPage);
        }
    });
    
    // История изменений пользователя
    async function showUserChangeHistory(ctx, targetUserId) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        await clearPreviousMessages(ctx, userId);
        const { getUserChangeHistory } = require('../../database/auditLogModel');
        const { formatDate } = require('../utils');
        const history = await getUserChangeHistory(targetUserId, 20);
        
        if (history.length === 0) {
            await ctx.reply('История изменений пуста.');
            const returnPage = ctx.state.userStates[userId].adminUsersReturnPage || 0;
            await showUserDetails(ctx, targetUserId, returnPage);
            return;
        }
        
        let historyText = `📋 **История изменений**\n\n`;
        
        for (const entry of history) {
            const date = formatDate(entry.timestamp);
            const time = new Date(entry.timestamp).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' });
            const actionNames = {
                'update': 'Изменение',
                'delete': 'Удаление',
                'approve': 'Одобрение',
                'disapprove': 'Отклонение',
                'create': 'Создание'
            };
            
            historyText += `📅 ${date} ${time}\n`;
            historyText += `Действие: ${actionNames[entry.action] || entry.action}\n`;
            if (entry.field && entry.field !== 'multiple') {
                historyText += `Поле: ${entry.field}\n`;
            }
            if (entry.oldValue !== null && entry.oldValue !== undefined) {
                historyText += `Было: ${entry.oldValue}\n`;
            }
            if (entry.newValue !== null && entry.newValue !== undefined) {
                historyText += `Стало: ${entry.newValue}\n`;
            }
            historyText += `\n`;
        }
        
        const message = await ctx.reply(historyText, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Назад к пользователю', `admin_user_back_from_history_${targetUserId}`)]
            ]).reply_markup
        });
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    }
    
    bot.action(/admin_user_history_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.match[1];
        await showUserChangeHistory(ctx, targetUserId);
    });
    
    bot.action(/admin_user_back_from_history_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.match[1];
        const returnPage = ctx.state.userStates[userId].adminUsersReturnPage || 0;
        await showUserDetails(ctx, targetUserId, returnPage);
    });
    
    bot.action('admin_user_back', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        const returnPage = ctx.state.userStates[userId].adminUsersReturnPage || 0;
        
        if (targetUserId) {
            await showUserDetails(ctx, targetUserId, returnPage);
        } else {
            await showUsersList(ctx, ctx.state.userStates[userId].adminUserFilters || {}, returnPage);
        }
    });
    
    // Добавление пользователя
    bot.action('admin_user_add', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply('Выберите способ добавления пользователя:', Markup.inlineKeyboard([
            [Markup.button.callback('➕ Добавить напрямую', 'admin_user_add_direct')],
            [Markup.button.callback('🔑 Создать пригласительный код', 'admin_invite_code_menu')],
            [Markup.button.callback('↩️ Назад', 'admin_users')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_user_add_direct', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_user_add_telegramid';
        ctx.state.userStates[userId].adminNewUser = {};
        const message = await ctx.reply('Введите Telegram ID нового пользователя:', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_users')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    // Удаление пользователя
    bot.action('admin_user_delete', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        if (!targetUserId) {
            await ctx.reply('Ошибка: пользователь не выбран.');
            return;
        }
        
        const users = await loadUsers();
        const user = users[targetUserId];
        if (!user) {
            await ctx.reply('Пользователь не найден.');
            return;
        }
        
        // Проверяем наличие отчетов
        const userReports = await loadUserReports(targetUserId);
        const reportsCount = Object.keys(userReports).length;
        
        if (reportsCount > 0) {
            await ctx.reply(`⚠️ Внимание! У пользователя есть ${reportsCount} отчетов. Они будут удалены вместе с пользователем.\n\nПодтвердите удаление:`, Markup.inlineKeyboard([
                [Markup.button.callback('✅ Да, удалить', 'admin_user_delete_confirm')],
                [Markup.button.callback('❌ Отмена', 'admin_user_back')]
            ]));
        } else {
            await ctx.reply('Подтвердите удаление пользователя:', Markup.inlineKeyboard([
                [Markup.button.callback('✅ Да, удалить', 'admin_user_delete_confirm')],
                [Markup.button.callback('❌ Отмена', 'admin_user_back')]
            ]));
        }
    });
    
    bot.action('admin_user_delete_confirm', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        if (!targetUserId) {
            await ctx.reply('Ошибка: пользователь не выбран.');
            return;
        }
        
        const users = await loadUsers();
        const user = users[targetUserId];
        if (!user) {
            await ctx.reply('Пользователь не найден.');
            return;
        }
        
        try {
            // Логируем удаление
            const { logUserChange } = require('../../database/auditLogModel');
            await logUserChange(targetUserId, userId, 'delete', 'user', JSON.stringify(user), null, { fullName: user.fullName });
            
            // Удаляем отчеты пользователя
            const userReports = await loadUserReports(targetUserId);
            const db = await require('../../config/mongoConfig').connectMongo();
            const reportsCollection = db.collection('reports');
            for (const reportId of Object.keys(userReports)) {
                await reportsCollection.deleteOne({ reportid: reportId });
            }
            
            // Удаляем пользователя
            await deleteUser(targetUserId);
            await ctx.reply(`✅ Пользователь "${user.fullName || targetUserId}" удален.`);
            
            // Возвращаемся к списку пользователей
            const returnPage = ctx.state.userStates[userId].adminUsersReturnPage || 0;
            const filters = ctx.state.userStates[userId].adminUserFilters || {};
            delete ctx.state.userStates[userId].adminSelectedUserId;
            await showUsersList(ctx, filters, returnPage);
        } catch (error) {
            console.error('Ошибка при удалении пользователя:', error);
            await ctx.reply('Ошибка при удалении пользователя: ' + error.message);
        }
    });
    
    // Обработчики для добавления пользователя (выбор организации и должности)
    bot.action(/admin_user_add_set_org_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const orgIndex = parseInt(ctx.match[1], 10);
        const orgNames = ctx.state.userStates[userId].adminAddOrgs;
        
        if (!orgNames || !orgNames[orgIndex]) {
            await ctx.reply('Организация не найдена.');
            return;
        }
        
        const orgName = orgNames[orgIndex];
        if (!ctx.state.userStates[userId].adminNewUser) {
            ctx.state.userStates[userId].adminNewUser = {};
        }
        ctx.state.userStates[userId].adminNewUser.organization = orgName;
        
        // Показываем должности организации
        const positions = await getAllPositions(orgName);
        if (positions.length === 0) {
            await ctx.reply(`Для организации "${orgName}" не настроены должности. Сначала создайте должности для этой организации.`);
            return;
        }
        
        const buttons = positions.map((pos, index) => [
            Markup.button.callback(pos.name, `admin_user_add_set_position_${index}`)
        ]);
        buttons.push([Markup.button.callback('↩️ Отмена', 'admin_users')]);
        ctx.state.userStates[userId].adminAddPositions = positions.map(pos => pos.name);
        
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply(`Выберите должность (организация: ${orgName}):`, Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action(/admin_user_add_set_position_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const posIndex = parseInt(ctx.match[1], 10);
        const posNames = ctx.state.userStates[userId].adminAddPositions;
        
        if (!posNames || !posNames[posIndex]) {
            await ctx.reply('Должность не найдена.');
            return;
        }
        
        if (!ctx.state.userStates[userId].adminNewUser) {
            ctx.state.userStates[userId].adminNewUser = {};
        }
        ctx.state.userStates[userId].adminNewUser.position = posNames[posIndex];
        
        // Показываем выбор объектов для организации
        const orgName = ctx.state.userStates[userId].adminNewUser.organization;
        const { getOrganizationObjects } = require('../../database/configService');
        const availableObjects = await getOrganizationObjects(orgName);
        
        if (!availableObjects.length) {
            // Если объектов нет, пропускаем этот шаг
            ctx.state.userStates[userId].adminNewUser.selectedObjects = [];
            ctx.state.userStates[userId].step = 'admin_user_add_phone';
            const msg = await ctx.reply('Для этой организации нет объектов. Введите телефон (или /skip для пропуска):', Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Отмена', 'admin_users')]
            ]));
            ctx.state.userStates[userId].messageIds.push(msg.message_id);
            return;
        }
        
        // Используем специальные переменные для админского добавления
        const adminState = ctx.state.userStates[userId];
        adminState.adminAddSelectedObjects = [];
        
        const buttons = availableObjects.map((obj, index) => [
            Markup.button.callback(obj, `admin_user_add_toggle_obj_${index}`)
        ]);
        buttons.push([Markup.button.callback('✅ Готово', 'admin_user_add_confirm_objects')]);
        buttons.push([Markup.button.callback('↩️ Отмена', 'admin_users')]);
        adminState.adminAddAvailableObjects = availableObjects;
        
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply('Выберите объекты (можно выбрать несколько):', Markup.inlineKeyboard(buttons));
        adminState.messageIds.push(message.message_id);
    });
    
    bot.action(/admin_user_add_toggle_obj_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objIndex = parseInt(ctx.match[1], 10);
        const adminState = ctx.state.userStates[userId];
        const availableObjects = adminState.adminAddAvailableObjects;
        
        if (!availableObjects || !availableObjects[objIndex]) {
            await ctx.reply('Объект не найден.');
            return;
        }
        
        const objectName = availableObjects[objIndex];
        let selectedObjects = adminState.adminAddSelectedObjects || [];
        const index = selectedObjects.indexOf(objectName);
        if (index === -1) {
            selectedObjects.push(objectName);
        } else {
            selectedObjects.splice(index, 1);
        }
        adminState.adminAddSelectedObjects = selectedObjects;
        
        // Обновляем сообщение
        const buttons = availableObjects.map((obj, idx) => {
            const isSelected = selectedObjects.includes(obj);
            return [Markup.button.callback(`${isSelected ? '✅ ' : ''}${obj}`, `admin_user_add_toggle_obj_${idx}`)];
        });
        buttons.push([Markup.button.callback('✅ Готово', 'admin_user_add_confirm_objects')]);
        buttons.push([Markup.button.callback('↩️ Отмена', 'admin_users')]);
        
        const lastMessageId = adminState.messageIds[adminState.messageIds.length - 1];
        try {
            await ctx.telegram.editMessageText(ctx.chat.id, lastMessageId, null, 'Выберите объекты (можно выбрать несколько):', Markup.inlineKeyboard(buttons));
        } catch (e) {
            await ctx.reply('Выберите объекты (можно выбрать несколько):', Markup.inlineKeyboard(buttons));
        }
    });
    
    bot.action('admin_user_add_confirm_objects', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const adminState = ctx.state.userStates[userId];
        if (!adminState.adminNewUser) {
            await ctx.reply('Ошибка: данные пользователя не найдены.');
            return;
        }
        
        adminState.adminNewUser.selectedObjects = adminState.adminAddSelectedObjects || [];
        adminState.step = 'admin_user_add_phone';
        
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply('Введите телефон (или /skip для пропуска):', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_users')]
        ]));
        adminState.messageIds.push(message.message_id);
    });
    
    // Массовые операции
    bot.action('admin_users_toggle_select_mode', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const currentMode = ctx.state.userStates[userId].adminMultiSelectMode || false;
        ctx.state.userStates[userId].adminMultiSelectMode = !currentMode;
        
        if (!currentMode) {
            // Включаем режим выбора
            ctx.state.userStates[userId].adminSelectedUsers = [];
        } else {
            // Выключаем режим выбора
            ctx.state.userStates[userId].adminSelectedUsers = [];
        }
        
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        const page = ctx.state.userStates[userId].adminUsersPage || 0;
        await showUsersList(ctx, filters, page);
    });
    
    bot.action(/admin_user_select_toggle_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const userIndex = parseInt(ctx.match[1], 10);
        const userList = ctx.state.userStates[userId].adminUsersList;
        
        if (!userList || !userList[userIndex]) {
            await ctx.reply('Пользователь не найден.');
            return;
        }
        
        const targetUserId = userList[userIndex];
        let selectedUsers = ctx.state.userStates[userId].adminSelectedUsers || [];
        
        const index = selectedUsers.indexOf(targetUserId);
        if (index === -1) {
            selectedUsers.push(targetUserId);
        } else {
            selectedUsers.splice(index, 1);
        }
        
        ctx.state.userStates[userId].adminSelectedUsers = selectedUsers;
        
        // Обновляем список
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        const page = ctx.state.userStates[userId].adminUsersPage || 0;
        await showUsersList(ctx, filters, page);
    });
    
    bot.action('admin_users_bulk_actions', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const selectedUsers = ctx.state.userStates[userId].adminSelectedUsers || [];
        if (selectedUsers.length === 0) {
            await ctx.answerCbQuery('Выберите хотя бы одного пользователя');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply(
            `Выбрано пользователей: ${selectedUsers.length}\n\nВыберите действие:`,
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ Одобрить выбранных', 'admin_users_bulk_approve')],
                [Markup.button.callback('❌ Отклонить выбранных', 'admin_users_bulk_disapprove')],
                [Markup.button.callback('🗑 Удалить выбранных', 'admin_users_bulk_delete')],
                [Markup.button.callback('↩️ Назад', 'admin_users')]
            ])
        );
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_users_bulk_approve', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const selectedUsers = ctx.state.userStates[userId].adminSelectedUsers || [];
        if (selectedUsers.length === 0) {
            await ctx.reply('Нет выбранных пользователей.');
            return;
        }
        
        const users = await loadUsers();
        const { logUserChange } = require('../../database/auditLogModel');
        
        let successCount = 0;
        for (const targetUserId of selectedUsers) {
            if (users[targetUserId] && !users[targetUserId].isApproved) {
                const oldValue = users[targetUserId].isApproved;
                users[targetUserId].isApproved = 1;
                await saveUser(targetUserId, users[targetUserId]);
                await logUserChange(targetUserId, userId, 'approve', 'isApproved', oldValue, 1);
                successCount++;
            }
        }
        
        await ctx.reply(`✅ Одобрено пользователей: ${successCount}`);
        ctx.state.userStates[userId].adminSelectedUsers = [];
        ctx.state.userStates[userId].adminMultiSelectMode = false;
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        await showUsersList(ctx, filters, 0);
    });
    
    bot.action('admin_users_bulk_disapprove', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const selectedUsers = ctx.state.userStates[userId].adminSelectedUsers || [];
        if (selectedUsers.length === 0) {
            await ctx.reply('Нет выбранных пользователей.');
            return;
        }
        
        const users = await loadUsers();
        const { logUserChange } = require('../../database/auditLogModel');
        
        let successCount = 0;
        for (const targetUserId of selectedUsers) {
            if (users[targetUserId] && users[targetUserId].isApproved) {
                const oldValue = users[targetUserId].isApproved;
                users[targetUserId].isApproved = 0;
                await saveUser(targetUserId, users[targetUserId]);
                await logUserChange(targetUserId, userId, 'disapprove', 'isApproved', oldValue, 0);
                successCount++;
            }
        }
        
        await ctx.reply(`❌ Отклонено пользователей: ${successCount}`);
        ctx.state.userStates[userId].adminSelectedUsers = [];
        ctx.state.userStates[userId].adminMultiSelectMode = false;
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        await showUsersList(ctx, filters, 0);
    });
    
    bot.action('admin_users_bulk_delete', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const selectedUsers = ctx.state.userStates[userId].adminSelectedUsers || [];
        if (selectedUsers.length === 0) {
            await ctx.reply('Нет выбранных пользователей.');
            return;
        }
        
        await ctx.reply(
            `⚠️ Внимание! Вы собираетесь удалить ${selectedUsers.length} пользователя(ей).\n\nПодтвердите удаление:`,
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ Да, удалить', 'admin_users_bulk_delete_confirm')],
                [Markup.button.callback('❌ Отмена', 'admin_users')]
            ])
        );
    });
    
    bot.action('admin_users_bulk_delete_confirm', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const selectedUsers = ctx.state.userStates[userId].adminSelectedUsers || [];
        if (selectedUsers.length === 0) {
            await ctx.reply('Нет выбранных пользователей.');
            return;
        }
        
        const users = await loadUsers();
        const { logUserChange } = require('../../database/auditLogModel');
        const { loadUserReports } = require('../../database/reportModel');
        const db = await require('../../config/mongoConfig').connectMongo();
        const reportsCollection = db.collection('reports');
        
        let successCount = 0;
        for (const targetUserId of selectedUsers) {
            if (users[targetUserId]) {
                try {
                    // Логируем удаление
                    await logUserChange(targetUserId, userId, 'delete', 'user', JSON.stringify(users[targetUserId]), null, { fullName: users[targetUserId].fullName });
                    
                    // Удаляем отчеты
                    const userReports = await loadUserReports(targetUserId);
                    for (const reportId of Object.keys(userReports)) {
                        await reportsCollection.deleteOne({ reportid: reportId });
                    }
                    
                    // Удаляем пользователя
                    await deleteUser(targetUserId);
                    successCount++;
                } catch (error) {
                    console.error(`Ошибка при удалении пользователя ${targetUserId}:`, error);
                }
            }
        }
        
        await ctx.reply(`✅ Удалено пользователей: ${successCount}`);
        ctx.state.userStates[userId].adminSelectedUsers = [];
        ctx.state.userStates[userId].adminMultiSelectMode = false;
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        await showUsersList(ctx, filters, 0);
    });
    
    // Экспортируем функции для использования в других модулях
    exportedFunctions.showOrganizationsList = showOrganizationsList;
    exportedFunctions.showObjectsList = showObjectsList;
    exportedFunctions.showUsersList = showUsersList;
    exportedFunctions.showUserDetails = showUserDetails;
};

// Экспортируем функции для использования в других модулях
Object.assign(module.exports, {
    showOrganizationsList: (ctx) => {
        if (exportedFunctions.showOrganizationsList) {
            return exportedFunctions.showOrganizationsList(ctx);
        }
    },
    showObjectsList: (ctx) => {
        if (exportedFunctions.showObjectsList) {
            return exportedFunctions.showObjectsList(ctx);
        }
    },
    showUsersList: (ctx, filters, page) => {
        if (exportedFunctions.showUsersList) {
            return exportedFunctions.showUsersList(ctx, filters, page);
        }
    },
    showUserDetails: (ctx, targetUserId, returnPage) => {
        if (exportedFunctions.showUserDetails) {
            return exportedFunctions.showUserDetails(ctx, targetUserId, returnPage);
        }
    }
});