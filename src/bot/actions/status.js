const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { clearPreviousMessages } = require('../utils');

const STATUSES = ['В работе', 'В отпуске'];

module.exports = (bot) => {
    bot.action('edit_status', async (ctx) => {
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);

        const buttons = STATUSES.map((status, index) => [Markup.button.callback(status, `select_status_${index}`)]);
        buttons.push([Markup.button.callback('↩️ Назад', 'profile')]);

        await ctx.reply('Выберите новый статус:', Markup.inlineKeyboard(buttons));
    });

    bot.action(/select_status_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const statusIndex = parseInt(ctx.match[1], 10);
        const selectedStatus = STATUSES[statusIndex];
        if (!selectedStatus) return;

        await clearPreviousMessages(ctx, userId);

        const users = await loadUsers();
        users[userId].status = selectedStatus;
        await saveUser(userId, users[userId]);

        await ctx.reply(`Статус обновлен на "${selectedStatus}".`);
        await require('../handlers/menu').showProfile(ctx);
    });
};