const { Markup } = require('telegraf');
const { loadUsers } = require('../../database/userModel');
const { clearPreviousMessages } = require('../utils');

async function showMainMenu(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId] || {};

    await clearPreviousMessages(ctx, userId);
    if (ctx.state.userStates[userId]) {
        ctx.state.userStates[userId].messageIds = [];
        console.log(`messageIds очищен для userId ${userId} при возврате в главное меню`);
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
    if (userId === process.env.ADMIN_ID) {
        buttons.push([Markup.button.callback('👑 Админ-панель', 'admin_panel')]);
    }

    const message = await ctx.reply(menuText, Markup.inlineKeyboard(buttons));
    ctx.state.userStates[userId].messageIds.push(message.message_id);
}

async function showProfile(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId] || {};
    const objectsList = user.selectedObjects.length > 0
        ? user.selectedObjects.map(obj => `· ${obj}`).join('\n')
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
➖➖➖➖➖➖➖➖➖➖➖
`.trim();

    const buttons = [
        [Markup.button.callback('✏️ Изменить ФИО', 'edit_fullName')],
        [Markup.button.callback('✏️ Изменить должность', 'edit_position')],
        [Markup.button.callback('✏️ Изменить организацию', 'edit_organization')],
        [Markup.button.callback('✏️ Изменить объекты', 'edit_object')],
        [Markup.button.callback('✏️ Изменить статус', 'edit_status')],
        [Markup.button.callback('📋 Посмотреть мои отчеты', 'view_reports')],
        [Markup.button.callback('↩️ Вернуться в главное меню', 'main_menu')]
    ];

    const message = await ctx.reply(profileText, Markup.inlineKeyboard(buttons));
    ctx.state.userStates[userId].messageIds.push(message.message_id);
}

module.exports = (bot) => {
    bot.action('main_menu', showMainMenu);
    bot.action('profile', showProfile);
};

module.exports.showMainMenu = showMainMenu;
module.exports.showProfile = showProfile;