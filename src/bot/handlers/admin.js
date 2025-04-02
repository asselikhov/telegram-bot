const { Markup } = require('telegraf');
const { loadUsers, saveUser, deleteUser } = require('../../database/userModel');
const { clearPreviousMessages } = require('../utils');
const { ADMIN_ID } = require('../../config/config');

module.exports = (bot) => {
    bot.action('admin_panel', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        await clearPreviousMessages(ctx, userId);
        await ctx.reply('👑 Админ-панель\nВыберите действие:', Markup.inlineKeyboard([
            [Markup.button.callback('📋 Просмотреть заявки', 'view_applications')],
            [Markup.button.callback('↩️ Назад', 'main_menu')]
        ]));
    });

    bot.action('view_applications', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        const users = await loadUsers();
        const pendingUsers = Object.entries(users).filter(([_, user]) => !user.isApproved);

        await clearPreviousMessages(ctx, userId);
        if (pendingUsers.length === 0) {
            await ctx.reply('Заявок нет.', Markup.inlineKeyboard([[Markup.button.callback('↩️ Назад', 'admin_panel')]]));
            return;
        }

        const buttons = pendingUsers.map(([uid, user]) => [
            Markup.button.callback(`${user.fullName} (${user.organization})`, `review_${uid}`)
        ]).concat([[Markup.button.callback('↩️ Назад', 'admin_panel')]]);
        await ctx.reply('Заявки на рассмотрение:', Markup.inlineKeyboard(buttons));
    });

    bot.action(/review_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        const reviewUserId = ctx.match[1];
        const users = await loadUsers();
        const user = users[reviewUserId];
        if (!user || user.isApproved) return;

        await clearPreviousMessages(ctx, userId);
        const objectsList = user.selectedObjects.length > 0 ? user.selectedObjects.map(obj => `· ${obj}`).join('\n') : 'Не выбраны';
        const userData = `
📝 **Заявка**  
➖➖➖➖➖➖➖➖➖➖➖  
👤 **ФИО:** ${user.fullName || 'Не указано'}  
🏢 **Организация:** ${user.organization || 'Не указано'}  
💼 **Должность:** ${user.position || 'Не указана'}  
🏗 **Объекты:**\n${objectsList}
        `.trim();

        await ctx.reply(userData, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('✅ Одобрить', `approve_${reviewUserId}`)],
                [Markup.button.callback('❌ Отклонить', `reject_${reviewUserId}`)],
                [Markup.button.callback('↩️ Назад', 'view_applications')]
            ]).reply_markup
        });
    });

    bot.action(/approve_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        const approveUserId = ctx.match[1];
        const users = await loadUsers();
        if (users[approveUserId] && !users[approveUserId].isApproved) {
            users[approveUserId].isApproved = 1;
            await saveUser(approveUserId, users[approveUserId]);
            await ctx.telegram.sendMessage(approveUserId, '✅ Ваша заявка одобрена! Используйте /start.');
        }
        await ctx.reply('Заявка одобрена.');
    });

    bot.action(/reject_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        const rejectUserId = ctx.match[1];
        const users = await loadUsers();
        if (users[rejectUserId] && !users[rejectUserId].isApproved) {
            await deleteUser(rejectUserId);
            await ctx.telegram.sendMessage(rejectUserId, '❌ Ваша заявка отклонена.');
        }
        await ctx.reply('Заявка отклонена.');
    });
};