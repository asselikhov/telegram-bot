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
    getNotificationSettings, 
    updateNotificationSettings 
} = require('../../database/notificationSettingsModel');
const { 
    loadAllReports 
} = require('../../database/reportModel');
const { 
    getOrganizations: getOrgFromService,
    getPositions: getPosFromService,
    getObjects: getObjFromService,
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
            [Markup.button.callback('🏢 Управление организациями', 'admin_organizations')],
            [Markup.button.callback('💼 Управление должностями', 'admin_positions')],
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
    
    async function showOrganizationsList(ctx) {
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
        
        const buttons = organizations.map((org, index) => {
            // Обрезаем текст кнопки до 64 символов (лимит Telegram)
            const buttonText = org.name.length > 64 ? org.name.substring(0, 61) + '...' : org.name;
            // Используем короткий callback_data (лимит 64 байта)
            const callbackData = `org_${index}`;
            if (callbackData.length > 64) {
                console.error(`Callback data too long: ${callbackData}`);
            }
            return [Markup.button.callback(buttonText, callbackData)];
        });
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
        
        // Сохраняем orgName для обработчиков редактирования/удаления
        ctx.state.userStates[userId].adminSelectedOrgName = orgName;
        
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

    // Обработчики удаления и редактирования организаций будут добавлены через textHandler
    // Базовые обработчики для должностей, объектов и уведомлений добавлены ниже
    
    // ========== УПРАВЛЕНИЕ ДОЛЖНОСТЯМИ ==========
    async function showPositionsList(ctx) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        await clearPreviousMessages(ctx, userId);
        const positions = await getAllPositions();
        ctx.state.userStates[userId].adminPositionsList = positions.map(pos => pos.name);
        const buttons = positions.map((pos, index) => {
            // Обрезаем текст кнопки до 64 символов (лимит Telegram)
            const buttonText = pos.name.length > 64 ? pos.name.substring(0, 61) + '...' : pos.name;
            // Используем короткий callback_data (лимит 64 байта)
            const callbackData = `pos_${index}`;
            if (callbackData.length > 64) {
                console.error(`Callback data too long: ${callbackData}`);
            }
            return [Markup.button.callback(buttonText, callbackData)];
        });
        buttons.push([Markup.button.callback('➕ Добавить должность', 'admin_pos_add')]);
        buttons.push([Markup.button.callback('↩️ Назад', 'admin_panel')]);
        const message = await ctx.reply('💼 Управление должностями\nВыберите должность:', Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    }
    bot.action('admin_positions', showPositionsList);
    bot.action('admin_pos_add', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_pos_add_name';
        const message = await ctx.reply('Введите название новой должности:', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_positions')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action(/^pos_(\d+)$/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const posIndex = parseInt(ctx.match[1], 10);
        const posNames = ctx.state.userStates[userId].adminPositionsList;
        if (!posNames || !posNames[posIndex]) {
            await ctx.reply('Должность не найдена.');
            await showPositionsList(ctx);
            return;
        }
        const posName = posNames[posIndex];
        ctx.state.userStates[userId].adminSelectedPosName = posName;
        
        const usersWithPos = await getUsersByPosition(posName);
        await clearPreviousMessages(ctx, userId);
        const posText = `💼 **${posName}**\n\n👥 Используется пользователями: ${usersWithPos.length}`;
        const message = await ctx.reply(posText, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('🗑 Удалить', 'admin_pos_delete')],
                [Markup.button.callback('↩️ Назад', 'admin_positions')]
            ]).reply_markup
        });
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_pos_delete', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const posName = ctx.state.userStates[userId].adminSelectedPosName;
        if (!posName) {
            await ctx.reply('Ошибка: должность не выбрана.');
            return;
        }
        const usersWithPos = await getUsersByPosition(posName);
        if (usersWithPos.length > 0) {
            await ctx.reply(`⚠️ Невозможно удалить должность "${posName}". Она используется ${usersWithPos.length} пользователем(ями).`);
            return;
        }
        await deletePosition(posName);
        clearConfigCache();
        await ctx.reply(`✅ Должность "${posName}" удалена.`);
        await showPositionsList(ctx);
    });

    // ========== УПРАВЛЕНИЕ ОБЪЕКТАМИ ==========
    async function showObjectsList(ctx) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        await clearPreviousMessages(ctx, userId);
        const objects = await getAllObjects();
        ctx.state.userStates[userId].adminObjectsList = objects.map(obj => obj.name);
        const buttons = objects.map((obj, index) => {
            // Обрезаем текст кнопки до 64 символов (лимит Telegram)
            const buttonText = obj.name.length > 64 ? obj.name.substring(0, 61) + '...' : obj.name;
            // Используем короткий callback_data (лимит 64 байта)
            const callbackData = `obj_${index}`;
            if (callbackData.length > 64) {
                console.error(`Callback data too long: ${callbackData}`);
            }
            return [Markup.button.callback(buttonText, callbackData)];
        });
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
        const objText = `🏗 **${obj.name}**\n\n📱 ID группы: ${obj.telegramGroupId || 'Не указан'}\n👥 Используется пользователями: ${usersWithObj.length}\n📄 Отчетов: ${reportsWithObj.length}`;
        const message = await ctx.reply(objText, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('🗑 Удалить', 'admin_obj_delete')],
                [Markup.button.callback('↩️ Назад', 'admin_objects')]
            ]).reply_markup
        });
        ctx.state.userStates[userId].messageIds.push(message.message_id);
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
        if (usersWithObj.length > 0 || reportsWithObj.length > 0) {
            await ctx.reply(`⚠️ Невозможно удалить объект "${objName}". Используется ${usersWithObj.length} пользователем(ями) и имеет ${reportsWithObj.length} отчетов.`);
            return;
        }
        await removeOrganizationFromObject(objName);
        await deleteObject(objName);
        clearConfigCache();
        await ctx.reply(`✅ Объект "${objName}" удален.`);
        await showObjectsList(ctx);
    });

    // ========== НАСТРОЙКИ УВЕДОМЛЕНИЙ ==========
    bot.action('admin_notifications', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        await clearPreviousMessages(ctx, userId);
        const settings = await getNotificationSettings();
        const enabledText = settings.enabled ? '✅ Включены' : '❌ Выключены';
        const settingsText = `
🔔 **Настройки уведомлений**

${enabledText}
⏰ Время: ${settings.time}
🌍 Часовой пояс: ${settings.timezone}
📝 Шаблон сообщения:
${settings.messageTemplate}
        `.trim();
        const message = await ctx.reply(settingsText, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback(settings.enabled ? '❌ Выключить' : '✅ Включить', 'admin_notif_toggle')],
                [Markup.button.callback('⏰ Изменить время', 'admin_notif_time')],
                [Markup.button.callback('📝 Изменить текст', 'admin_notif_text')],
                [Markup.button.callback('👁 Предпросмотр', 'admin_notif_preview')],
                [Markup.button.callback('↩️ Назад', 'admin_panel')]
            ]).reply_markup
        });
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_notif_toggle', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const settings = await getNotificationSettings();
        await updateNotificationSettings({ enabled: !settings.enabled });
        clearConfigCache();
        const botInstance = require('../bot');
        if (botInstance.setupReminderCron) await botInstance.setupReminderCron();
        await ctx.answerCbQuery('Настройки сохранены');
        // Перезагружаем страницу настроек - просто вызываем обработчик заново
        const actionHandler = async (ctx) => {
            const userId = ctx.from.id.toString();
            if (userId !== ADMIN_ID) return;
            await clearPreviousMessages(ctx, userId);
            const settings = await getNotificationSettings();
            const enabledText = settings.enabled ? '✅ Включены' : '❌ Выключены';
            const settingsText = `🔔 **Настройки уведомлений**\n\n${enabledText}\n⏰ Время: ${settings.time}\n🌍 Часовой пояс: ${settings.timezone}\n📝 Шаблон сообщения:\n${settings.messageTemplate}`.trim();
            const message = await ctx.reply(settingsText, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback(settings.enabled ? '❌ Выключить' : '✅ Включить', 'admin_notif_toggle')],
                    [Markup.button.callback('⏰ Изменить время', 'admin_notif_time')],
                    [Markup.button.callback('📝 Изменить текст', 'admin_notif_text')],
                    [Markup.button.callback('👁 Предпросмотр', 'admin_notif_preview')],
                    [Markup.button.callback('↩️ Назад', 'admin_panel')]
                ]).reply_markup
            });
            ctx.state.userStates[userId].messageIds.push(message.message_id);
        };
        await actionHandler(ctx);
    });
    
    bot.action('admin_notif_time', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_notif_edit_time';
        const message = await ctx.reply('Введите новое время в формате HH:mm (например, 19:00):', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_notifications')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_notif_text', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_notif_edit_text';
        const message = await ctx.reply('Введите новый текст шаблона. Используйте переменные {fullName} и {date}:', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_notifications')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_notif_preview', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const settings = await getNotificationSettings();
        const previewText = formatNotificationMessage(settings.messageTemplate, {
            fullName: 'Иванов Иван Иванович',
            date: '25.12.2024'
        });
        await ctx.reply(`Предпросмотр сообщения:\n\n${previewText}`, Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Назад', 'admin_notifications')]
        ]));
    });
};