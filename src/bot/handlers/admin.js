const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { pool } = require('../../database/db');
const { ADMIN_ID } = require('../../config/config');
const { clearPreviousMessages } = require('../utils');

async function showAdminPanel(ctx) {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;

    await clearPreviousMessages(ctx, userId); // Очистка предыдущих сообщений

    const buttons = [
        [Markup.button.callback('📝 Заявки', 'show_requests')],
        [Markup.button.callback('↩️ Вернуться в главное меню', 'main_menu')]
    ];

    const message = await ctx.reply('👑 АДМИН-ПАНЕЛЬ', Markup.inlineKeyboard(buttons));
    ctx.state.userStates[userId].messageIds.push(message.message_id);
}

async function showRequests(ctx) {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;

    await clearPreviousMessages(ctx, userId); // Очистка предыдущих сообщений

    const users = await loadUsers();
    const pendingUsers = Object.entries(users)
        .filter(([_, user]) => !user.isApproved)
        .map(([userId, user]) => ({
            userId,
            fullName: user.fullName || 'Не указано',
            position: user.position || 'Не указана',
            organization: user.organization || 'Не указана',
            objects: user.selectedObjects.length > 0 ? user.selectedObjects.join(', ') : 'Не выбраны'
        }));

    const requestsText = pendingUsers.length === 0
        ? 'Нет неподтвержденных заявок.'
        : pendingUsers.map(u => `\n${u.fullName} - ${u.position} (${u.organization})\n\n${u.objects}`).join('\n\n');

    const buttons = pendingUsers.map(u => [
        Markup.button.callback(`✅ Одобрить (${u.fullName})`, `approve_${u.userId}`),
        Markup.button.callback(`❌ Отклонить (${u.fullName})`, `reject_${u.userId}`)
    ]);
    buttons.push([Markup.button.callback('↩️ Назад в админ-панель', 'admin_panel')]);

    const message = await ctx.reply(`📝 СПИСОК ЗАЯВОК\n\n${requestsText}`, Markup.inlineKeyboard(buttons));
    ctx.state.userStates[userId].messageIds.push(message.message_id);
}

module.exports = (bot) => {
    bot.action('admin_panel', showAdminPanel);

    bot.action('show_requests', showRequests);

    bot.action(/approve_(.+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const targetUserId = ctx.match[1];
        if (userId !== ADMIN_ID) return;

        const users = await loadUsers();
        if (!users[targetUserId]) return;

        users[targetUserId].isApproved = true;
        await saveUser(targetUserId, users[targetUserId]);
        await ctx.reply(`Пользователь ${users[targetUserId].fullName} одобрен.`);
        await bot.telegram.sendMessage(targetUserId, '✅ Ваш профиль подтвержден.');
        await showRequests(ctx); // Обновляем список заявок
    });

    bot.action(/reject_(.+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const targetUserId = ctx.match[1];
        if (userId !== ADMIN_ID) return;

        const client = await pool.connect();
        try {
            await client.query('DELETE FROM users WHERE userId = $1', [targetUserId]);
            await ctx.reply('Заявка отклонена.');
            await bot.telegram.sendMessage(targetUserId, '❌ Ваша заявка отклонена.');
            await showRequests(ctx); // Обновляем список заявок
        } finally {
            client.release();
        }
    });
};