const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { clearPreviousMessages } = require('../utils');

module.exports = (bot) => {
    bot.action('edit_status', async (ctx) => {
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'selectStatus'; // Устанавливаем step
        await ctx.reply('Выберите новый статус:', Markup.inlineKeyboard([
            [Markup.button.callback('В работе', 'status_work')],
            [Markup.button.callback('В отпуске', 'status_vacation')],
            [Markup.button.callback('↩️ Назад', 'profile')]
        ]));
    });

    bot.action('status_work', async (ctx) => {
        const userId = ctx.from.id.toString();
        const users = await loadUsers();

        await clearPreviousMessages(ctx, userId);
        users[userId].status = 'В работе';
        await saveUser(userId, users[userId]);
        ctx.state.userStates[userId].step = null; // Сбрасываем только step
        await ctx.reply('Статус обновлён на "В работе".');
        await require('../handlers/menu').showProfile(ctx);
    });

    bot.action('status_vacation', async (ctx) => {
        const userId = ctx.from.id.toString();
        const users = await loadUsers();

        await clearPreviousMessages(ctx, userId);
        users[userId].status = 'В отпуске';
        await saveUser(userId, users[userId]);
        ctx.state.userStates[userId].step = null; // Сбрасываем только step
        await ctx.reply('Статус обновлён на "В отпуске".');
        await require('../handlers/menu').showProfile(ctx);
    });

    bot.action('profile', async (ctx) => {
        await require('../handlers/menu').showProfile(ctx);
    });
};