const { Markup } = require('telegraf');
const { loadUsers } = require('../../database/userModel');

async function showMainMenu(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId] || {};

    const menuText = `
🚀 Главное меню  
━━━━━━━━━━━━━━━━━━━━  
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

    await ctx.reply(menuText, Markup.inlineKeyboard(buttons));
}

async function showProfile(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId] || {};
    const objectsList = user.selectedObjects.length > 0
        ? user.selectedObjects.map(obj => `· ${obj}`).join('\n')
        : 'Не выбраны';

    const statusEmoji = user.status === 'В работе' ? '🟢' : user.status === 'В отпуске' ? '🔴' : '⏳';

    const profileText = `
👤 ЛИЧНЫЙ КАБИНЕТ  
➖➖➖➖➖➖➖➖➖➖➖  
📋 ${user.position || 'Не указана'}  
🏢 ${user.organization || 'Не указана'}  
👷 ${user.fullName || 'Не указано'}  
${objectsList}  
${statusEmoji} ${user.status || 'Не указан'}  
➖➖➖➖➖➖➖➖➖➖➖
`.trim();

    const buttons = [
        [Markup.button.callback('✏️ Изменить ФИО', 'edit_fullName')],
        [Markup.button.callback('🏢 Изменить должность', 'edit_position')],
        [Markup.button.callback('🏭 Изменить организацию', 'edit_organization')],
        [Markup.button.callback('🏠 Изменить объекты', 'edit_object')],
        [Markup.button.callback('📅 Изменить статус', 'edit_status')],
        [Markup.button.callback('📋 Посмотреть мои отчеты', 'view_reports')],
        [Markup.button.callback('↩️ Вернуться в главное меню', 'main_menu')]
    ];

    await ctx.reply(profileText, Markup.inlineKeyboard(buttons));
}

// Экспорт функций и обработчиков
module.exports = (bot) => {
    bot.action('main_menu', showMainMenu);
    bot.action('profile', showProfile);
};

module.exports.showMainMenu = showMainMenu; // Экспорт функции для использования в других модулях
module.exports.showProfile = showProfile;   // Экспорт функции (опционально, если потребуется)