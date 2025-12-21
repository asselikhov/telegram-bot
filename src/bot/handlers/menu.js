const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { clearPreviousMessages } = require('../utils');
const { ADMIN_ID } = require('../../config/config');
const { getOrganizationObjects, getObjectGroups, getGeneralGroupChatIds } = require('../../database/configService');
const { getAllObjects } = require('../../database/objectModel');

async function showMainMenu(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId] || {};

    await clearPreviousMessages(ctx, userId);
    if (ctx.state.userStates[userId]) {
        ctx.state.userStates[userId].messageIds = [];
    }

    const menuText = `
🚀 ГЛАВНОЕ МЕНЮ 
➖➖➖➖➖➖➖➖➖➖➖  
Выберите действие ниже:  
    `.trim();

    const buttons = [
        [Markup.button.callback('👤 Личный кабинет', 'profile')]
    ];
    if (user.isApproved && user.position === 'Производитель работ') {
        buttons.splice(1, 0, [Markup.button.callback('📝 Создать отчет', 'create_report')]);
    }
    if (user.isApproved) {
        buttons.splice(1, 0, [Markup.button.callback('📤 Выгрузить отчет', 'download_report')]);
    }
    if (userId === ADMIN_ID) {
        buttons.push([Markup.button.callback('👑 Админ-панель', 'admin_panel')]);
    }

    const message = await ctx.reply(menuText, Markup.inlineKeyboard(buttons));
    ctx.state.userStates[userId].messageIds.push(message.message_id);
}

async function showProfile(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId] || {};

    const availableObjects = await getOrganizationObjects(user.organization);
    const filteredObjects = user.selectedObjects.filter(obj => availableObjects.includes(obj));
    
    // Получаем информацию о группах
    const generalGroupChatIds = await getGeneralGroupChatIds();
    const allObjects = await getAllObjects();
    
    // Формируем текст профиля (объекты как текст для отображения, но кнопки будут отдельно)
    const objectsList = filteredObjects.length > 0
        ? filteredObjects.map(obj => `· ${obj}`).join('\n')
        : 'Не выбраны';

    await clearPreviousMessages(ctx, userId);

    const statusEmoji = user.status === 'В работе' ? '🟢' : user.status === 'В отпуске' ? '🔴' : '⏳';

    const profileText = `
👤 ЛИЧНЫЙ КАБИНЕТ  
➖➖➖➖➖➖➖➖➖➖➖  
${user.position || 'Не указана'}  
${user.organization || 'Не указана'}  
${user.fullName || 'Не указано'}  

${objectsList}  

${statusEmoji} ${user.status || 'Не указан'}
`.trim();

    const buttons = [];
    
    // Кнопка для организации
    if (user.organization) {
        const orgChatInfo = generalGroupChatIds[user.organization];
        if (orgChatInfo && orgChatInfo.chatId) {
            try {
                const chat = await ctx.telegram.getChat(orgChatInfo.chatId);
                if (chat.username) {
                    // Группа с username - прямая ссылка
                    buttons.push([Markup.button.url(`🏢 ${user.organization}`, `https://t.me/${chat.username}`)]);
                } else {
                    // Группа без username - callback для генерации invite link
                    const orgNameEncoded = encodeURIComponent(user.organization);
                    buttons.push([Markup.button.callback(`🏢 ${user.organization}`, `org_group_link_${orgNameEncoded}`)]);
                }
            } catch (error) {
                // Если не удалось получить информацию о чате, используем callback
                const orgNameEncoded = encodeURIComponent(user.organization);
                buttons.push([Markup.button.callback(`🏢 ${user.organization}`, `org_group_link_${orgNameEncoded}`)]);
            }
        }
    }
    
    // Кнопки для объектов
    for (const objName of filteredObjects) {
        const objInfo = allObjects.find(obj => obj.name === objName);
        if (objInfo && objInfo.telegramGroupId) {
            try {
                const chat = await ctx.telegram.getChat(objInfo.telegramGroupId);
                if (chat.username) {
                    // Группа с username - прямая ссылка
                    buttons.push([Markup.button.url(`🏗 ${objName}`, `https://t.me/${chat.username}`)]);
                } else {
                    // Группа без username - callback для генерации invite link
                    const objNameEncoded = encodeURIComponent(objName);
                    buttons.push([Markup.button.callback(`🏗 ${objName}`, `object_group_link_${objNameEncoded}`)]);
                }
            } catch (error) {
                // Если не удалось получить информацию о чате, используем callback
                const objNameEncoded = encodeURIComponent(objName);
                buttons.push([Markup.button.callback(`🏗 ${objName}`, `object_group_link_${objNameEncoded}`)]);
            }
        }
    }
    
    // Основные кнопки меню
    buttons.push(
        [Markup.button.callback('✏️ Изменить данные', 'edit_data')],
        [Markup.button.callback('📋 Посмотреть мои отчеты', 'view_reports')],
        [Markup.button.callback('🔑 Пригласительный код', userId === ADMIN_ID ? 'admin_invite_code_menu' : 'generate_invite_code')],
        [Markup.button.callback('↩️ Вернуться в главное меню', 'main_menu')]
    );

    const message = await ctx.reply(profileText, Markup.inlineKeyboard(buttons));
    ctx.state.userStates[userId].messageIds.push(message.message_id);
}

async function showEditData(ctx) {
    const userId = ctx.from.id.toString();
    await clearPreviousMessages(ctx, userId);

    const buttons = [
        [Markup.button.callback('✏️ Изменить ФИО', 'edit_fullName')],
        [Markup.button.callback('✏️ Изменить должность', 'edit_position')],
        [Markup.button.callback('✏️ Изменить организацию', 'edit_organization')],
        [Markup.button.callback('✏️ Изменить объекты', 'edit_object')],
        [Markup.button.callback('✏️ Изменить статус', 'edit_status')],
        [Markup.button.callback('↩️ Назад', 'profile')]
    ];

    const message = await ctx.reply('Выберите, что хотите изменить:', Markup.inlineKeyboard(buttons));
    ctx.state.userStates[userId].messageIds.push(message.message_id);
}

module.exports = (bot) => {
    bot.action('main_menu', showMainMenu);
    bot.action('profile', showProfile);
    bot.action('edit_data', showEditData);

    bot.action('edit_fullName', async (ctx) => {
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);

        ctx.state.userStates[userId].step = 'editFullNameInput';
        const message = await ctx.reply('Введите новое ФИО:');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    // Обработчик для генерации invite link для объекта
    bot.action(/^object_group_link_(.+)$/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const objNameEncoded = ctx.match[1];
        const objName = decodeURIComponent(objNameEncoded);
        
        try {
            const allObjects = await getAllObjects();
            const objInfo = allObjects.find(obj => obj.name === objName);
            
            if (!objInfo || !objInfo.telegramGroupId) {
                await ctx.answerCbQuery('Группа для этого объекта не настроена.');
                return;
            }
            
            const inviteLink = await ctx.telegram.exportChatInviteLink(objInfo.telegramGroupId);
            await ctx.reply(`🔗 Ссылка на группу объекта "${objName}":\n\n${inviteLink}`);
            await ctx.answerCbQuery();
        } catch (error) {
            console.error('Ошибка при генерации invite link для объекта:', error);
            let errorMessage = 'Не удалось получить ссылку на группу.';
            if (error.response?.description) {
                if (error.response.description.includes('not found')) {
                    errorMessage = 'Группа не найдена. Проверьте настройки объекта.';
                } else if (error.response.description.includes('not enough rights')) {
                    errorMessage = 'Бот не имеет прав для создания ссылки на группу.';
                } else if (error.response.description.includes('not a member')) {
                    errorMessage = 'Бот не является участником группы.';
                }
            }
            await ctx.answerCbQuery(errorMessage, { show_alert: true });
        }
    });
    
    // Обработчик для генерации invite link для организации
    bot.action(/^org_group_link_(.+)$/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const orgNameEncoded = ctx.match[1];
        const orgName = decodeURIComponent(orgNameEncoded);
        
        try {
            const generalGroupChatIds = await getGeneralGroupChatIds();
            const orgChatInfo = generalGroupChatIds[orgName];
            
            if (!orgChatInfo || !orgChatInfo.chatId) {
                await ctx.answerCbQuery('Группа для этой организации не настроена.');
                return;
            }
            
            const inviteLink = await ctx.telegram.exportChatInviteLink(orgChatInfo.chatId);
            await ctx.reply(`🔗 Ссылка на группу организации "${orgName}":\n\n${inviteLink}`);
            await ctx.answerCbQuery();
        } catch (error) {
            console.error('Ошибка при генерации invite link для организации:', error);
            let errorMessage = 'Не удалось получить ссылку на группу.';
            if (error.response?.description) {
                if (error.response.description.includes('not found')) {
                    errorMessage = 'Группа не найдена. Проверьте настройки организации.';
                } else if (error.response.description.includes('not enough rights')) {
                    errorMessage = 'Бот не имеет прав для создания ссылки на группу.';
                } else if (error.response.description.includes('not a member')) {
                    errorMessage = 'Бот не является участником группы.';
                }
            }
            await ctx.answerCbQuery(errorMessage, { show_alert: true });
        }
    });
};

module.exports.showMainMenu = showMainMenu;
module.exports.showProfile = showProfile;