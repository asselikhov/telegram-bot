const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { sendMenu } = require('../utils');

module.exports = (bot) => {
    bot.action('edit_status', async (ctx) => {
        const userId = ctx.from.id.toString();
        ctx.state.step = 'selectStatus';
        const buttons = [
            [Markup.button.callback('В работе', 'status_work')],
            [Markup.button.callback('В отпуске', 'status_vacation')],
            [Markup.button.callback('↩️ Назад', 'profile')]
        ];
        await sendMenu(ctx, userId, 'Выберите новый статус:', buttons);
    });

    bot.action('status_work', async (ctx) => {
        const userId = ctx.from.id.toString();
        const users = await loadUsers();
        users[userId].status = 'В работе';
        await saveUser(userId, users[userId]);
        ctx.state.step = null;
        await ctx.reply('Статус обновлён на "В работе".');
        await require('../handlers/menu').showProfile(ctx);
    });

    bot.action('status_vacation', async (ctx) => {
        const userId = ctx.from.id.toString();
        const users = await loadUsers();
        users[userId].status = 'В отпуске';
        await saveUser(userId, users[userId]);
        ctx.state.step = null;
        await ctx.reply('Статус обновлён на "В отпуске".');
        await require('../handlers/menu').showProfile(ctx);
    });
};