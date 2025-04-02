const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { clearPreviousMessages } = require('../utils');

module.exports = (bot) => {
    bot.action('edit_status', async (ctx) => {
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'selectStatus';
        const message = await ctx.reply('Выберите новый статус:', Markup.inlineKeyboard([
            [Markup.button.callback('В работе', 'status_work')],
            [Markup.button.callback('В отпуске', 'status_vacation')],
            [Markup.button.callback('↩️ Назад', 'profile')]
        ]));
        ctx.state.userStates[userId].lastMessageId = message.message_id;
    });

    bot.action('status_work', async (ctx) => {
        const userId = ctx.from.id.toString();
        const users = await loadUsers();

        await clearPreviousMessages(ctx, userId);
        users[userId].status = 'В работе';
        await saveUser(userId, users[userId]);
        ctx.state.userStates[userId].step = null;

        const lastMessageId = ctx.state.userStates[userId].lastMessageId;
        if (lastMessageId) {
            await ctx.telegram.editMessageText(ctx.chat.id, lastMessageId, null, 'Статус обновлен на "В работе".', Markup.inlineKeyboard([]))
                .catch(async () => {
                    const message = await ctx.reply('Статус обновлен на "В работе".');
                    ctx.state.userStates[userId].lastMessageId = message.message_id;
                });
        } else {
            const message = await ctx.reply('Статус обновлен на "В работе".');
            ctx.state.userStates[userId].lastMessageId = message.message_id;
        }
        await require('../handlers/menu').showProfile(ctx); // Обновляем профиль
    });

    bot.action('status_vacation', async (ctx) => {
        const userId = ctx.from.id.toString();
        const users = await loadUsers();

        await clearPreviousMessages(ctx, userId);
        users[userId].status = 'В отпуске';
        await saveUser(userId, users[userId]);
        ctx.state.userStates[userId].step = null;

        const lastMessageId = ctx.state.userStates[userId].lastMessageId;
        if (lastMessageId) {
            await ctx.telegram.editMessageText(ctx.chat.id, lastMessageId, null, 'Статус обновлен на "В отпуске".', Markup.inlineKeyboard([]))
                .catch(async () => {
                    const message = await ctx.reply('Статус обновлен на "В отпуске".');
                    ctx.state.userStates[userId].lastMessageId = message.message_id;
                });
        } else {
            const message = await ctx.reply('Статус обновлен на "В отпуске".');
            ctx.state.userStates[userId].lastMessageId = message.message_id;
        }
        await require('../handlers/menu').showProfile(ctx); // Обновляем профиль
    });

    bot.action('profile', async (ctx) => {
        await require('../handlers/menu').showProfile(ctx);
    });
};