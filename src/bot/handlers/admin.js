const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { clearPreviousMessages } = require('../utils');
const { ADMIN_ID } = require('../../config/config');

module.exports = (bot) => {
    bot.action('admin_panel', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) {
            return ctx.reply('У вас нет доступа к админ-панели.');
        }

        await clearPreviousMessages(ctx, userId);

        const users = await loadUsers();
        const pendingUsers = Object.entries(users).filter(([_, user]) => !user.isApproved);

        if (pendingUsers.length === 0) {
            return ctx.reply('Нет заявок на рассмотрении.');
        }

        for (const [userId, user] of pendingUsers) {
            const adminText = `\n${user.fullName} - ${user.position} (${user.organization})\n\n${user.selectedObjects.join(', ') || 'Не выбраны'}`;
            await ctx.reply(`📝 СПИСОК ЗАЯВОК${adminText}`, Markup.inlineKeyboard([
                [Markup.button.callback(`✅ Одобрить (${user.fullName})`, `approve_${userId}`)],
                [Markup.button.callback(`❌ Отклонить (${user.fullName})`, `reject_${userId}`)]
            ]));
        }
    });

    bot.action(/approve_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        const targetUserId = ctx.match[1];
        const users = await loadUsers();
        if (!users[targetUserId]) return;

        users[targetUserId].isApproved = true;
        await saveUser(targetUserId, users[targetUserId]);

        await ctx.reply(`Пользователь ${users[targetUserId].fullName} одобрен.`);
        await ctx.telegram.sendMessage(targetUserId, '✅ Ваша заявка одобрена! Используйте /start для начала работы.');
        await ctx.deleteMessage();
    });

    bot.action(/reject_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        const targetUserId = ctx.match[1];
        const users = await loadUsers();
        if (!users[targetUserId]) return;

        delete users[targetUserId];
        const client = await require('../../database/db').pool.connect();
        try {
            await client.query('DELETE FROM users WHERE userId = $1', [targetUserId]);
        } finally {
            client.release();
        }

        await ctx.reply(`Пользователь ${targetUserId} отклонён.`);
        await ctx.telegram.sendMessage(targetUserId, '❌ Ваша заявка отклонена.');
        await ctx.deleteMessage();
    });
};