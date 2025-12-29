const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { clearPreviousMessages } = require('../utils');
const { ADMIN_ID } = require('../../config/config');
const { getOrganizationObjects, getObjectGroups, getGeneralGroupChatIds, getReportUsers } = require('../../database/configService');
const { getAllObjects } = require('../../database/objectModel');
const { ensureUserState, addMessageId } = require('../utils/stateHelper');

async function showMainMenu(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId] || {};

    await clearPreviousMessages(ctx, userId);
    const state = ensureUserState(ctx);
    if (state) {
        state.messageIds = [];
    }

    const menuText = `
🚀 ГЛАВНОЕ МЕНЮ 
➖➖➖➖➖➖➖➖➖➖➖  
    `.trim();

    const buttons = [
        [Markup.button.callback('👤 Личный кабинет', 'profile')],
        [Markup.button.callback('📋 Отчеты', 'reports_menu')],
        [Markup.button.callback('🚨 Проблемы', 'problems')],
        [Markup.button.callback('📦 Потребности', 'needs')]
    ];
    
    if (userId === ADMIN_ID) {
        buttons.push([Markup.button.callback('👑 Админ-панель', 'admin_panel')]);
    }

    const message = await ctx.reply(menuText, Markup.inlineKeyboard(buttons));
    addMessageId(ctx, message.message_id);
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
    
    await clearPreviousMessages(ctx, userId);

    const statusEmoji = user.status === 'Online' ? '🟢' : user.status === 'Offline' ? '🔴' : '⏳';
    const displayStatus = user.status || 'Не указан';

    // Формируем название организации без ссылки
    const organizationText = user.organization || 'Не указана';

    // Формируем список объектов со ссылками
    let objectsList;
    if (filteredObjects.length > 0) {
        const objectsWithLinks = await Promise.all(
            filteredObjects.map(async (objName) => {
                const objInfo = allObjects.find(obj => obj.name === objName);
                if (objInfo && objInfo.telegramGroupId) {
                    try {
                        const chat = await ctx.telegram.getChat(objInfo.telegramGroupId);
                        let objUrl;
                        if (chat.username) {
                            objUrl = `https://t.me/${chat.username}`;
                        } else {
                            try {
                                objUrl = await ctx.telegram.exportChatInviteLink(objInfo.telegramGroupId);
                            } catch (inviteError) {
                                console.error(`Ошибка при генерации invite link для объекта ${objName}:`, inviteError);
                                // Оставляем текст без ссылки
                                return `· ${objName}`;
                            }
                        }
                        if (objUrl) {
                            // Экранируем только квадратные скобки в названии для Markdown ссылок
                            const escapedObjName = objName.replace(/[\[\]]/g, '\\$&');
                            return `· [${escapedObjName}](${objUrl})`;
                        }
                    } catch (error) {
                        console.error(`Ошибка при получении информации о чате объекта ${objName}:`, error);
                        // Оставляем текст без ссылки
                    }
                }
                return `· ${objName}`;
            })
        );
        objectsList = objectsWithLinks.join('\n');
    } else {
        objectsList = 'Не выбраны';
    }

        const profileText = `
👤 ЛИЧНЫЙ КАБИНЕТ  
➖➖➖➖➖➖➖➖➖➖➖  
${user.position || 'Не указана'}  
${organizationText}  
${user.fullName || 'Не указано'}  
📞 ${user.phone || 'Не указан'}

${objectsList}  

${statusEmoji} ${displayStatus}
`.trim();

    // Основные кнопки меню
    const buttons = [
        [Markup.button.callback('✏️ Изменить данные', 'edit_data')],
    ];
    
    if (user.isApproved) {
        buttons.push([Markup.button.callback('📤 Выгрузить людей', 'download_users')]);
    }
    
    buttons.push([Markup.button.callback('🔑 Пригласительный код', userId === ADMIN_ID ? 'admin_invite_code_menu' : 'generate_invite_code')]);
    buttons.push([Markup.button.callback('↩️ Назад', 'main_menu')]);

    const message = await ctx.reply(profileText, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup
    });
    addMessageId(ctx, message.message_id);
}

async function showEditData(ctx) {
    const userId = ctx.from.id.toString();
    await clearPreviousMessages(ctx, userId);

    const buttons = [
        [Markup.button.callback('✏️ Изменить ФИО', 'edit_fullName')],
        [Markup.button.callback('✏️ Изменить должность', 'edit_position')],
        [Markup.button.callback('✏️ Изменить организацию', 'edit_organization')],
        [Markup.button.callback('✏️ Изменить телефон', 'edit_phone')],
        [Markup.button.callback('✏️ Изменить объекты', 'edit_object')],
        [Markup.button.callback('✏️ Изменить статус', 'edit_status')],
        [Markup.button.callback('↩️ Назад', 'profile')]
    ];

    const message = await ctx.reply('Выберите, что хотите изменить:', Markup.inlineKeyboard(buttons));
    addMessageId(ctx, message.message_id);
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
        addMessageId(ctx, message.message_id);
    });
    
    bot.action('edit_phone', async (ctx) => {
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);

        const state = ensureUserState(ctx);
        if (state) {
            state.step = 'editPhoneInput';
        }
        const message = await ctx.reply('Введите новый контактный телефон:');
        addMessageId(ctx, message.message_id);
    });

    bot.action('problems', async (ctx) => {
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        
        try {
            const message = await ctx.reply('🚨 Проблемы\n\nЭта функция находится в разработке.', Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Назад', 'main_menu')]
            ]));
            addMessageId(ctx, message.message_id);
        } catch (error) {
            console.error('Ошибка в обработчике problems:', error);
            await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
        }
    });

    bot.action('needs', async (ctx) => {
        const { showNeedsMenu } = require('./needs');
        await showNeedsMenu(ctx);
    });
};

module.exports.showMainMenu = showMainMenu;
module.exports.showProfile = showProfile;