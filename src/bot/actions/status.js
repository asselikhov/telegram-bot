const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');

module.exports = (bot) => {
    bot.action('edit_status', async (ctx) => {
        await ctx.reply('Выберите новый статус:', Markup.inlineKeyboard([
            [Markup.button.callback('В работе', 'status_work')],
            [Markup.button.callback('В отпуске', 'status_vacation')]
        ]));
    });
    bot.action('status_work', async (ctx) => {
        const userId = ctx.from.id.toString();
        const users = await loadUsers();
        users[userId].status = 'В работе';
        await saveUser(userId, users[userId]);
        await ctx.reply('Статус обновлен на "В работе".');
    });
    bot.action('status_vacation', async (ctx) => {
        const userId = ctx.from.id.toString();
        const users = await loadUsers();
        users[userId].status = 'В отпуске';
        await saveUser(userId, users[userId]);
        await ctx.reply('Статус обновлен на "В отпуске".');
    });
};