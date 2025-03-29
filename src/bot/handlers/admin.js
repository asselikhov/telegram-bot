const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { ADMIN_ID } = require('../../config/config');

async function showAdminPanel(ctx) {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;

    const users = await loadUsers();
    const pendingUsers = Object.entries(users)
        .filter(([_, user]) => !user.isApproved)
        .map(([userId, user]) => ({
            userId,
            fullName: user.fullName || 'Не указано',
            position: user.position || 'Не указана',
            organization: user.organization || 'Не указана',
            objects: user.selectedObjects.length > 0 ? user.selectedObjects.join('\n') : 'Не выбраны'
        }));

    const adminText = pendingUsers.length === 0
        ? 'Нет неподтвержденных заявок.'
        : pendingUsers.map(u => `ЗАЯВКА\n${u.fullName} - ${u.position} (${u.organization})\nОбъекты: ${u.objects}`).join('\n\n');

    const buttons = pendingUsers.map(u => [
        Markup.button.callback(`✅ ${u.fullName}`, `approve_${u.userId}`),
        Markup.button.callback(`❌ ${u.fullName}`, `reject_${u.userId}`)
    ]);
    buttons.push([Markup.button.callback('↩️ Вернуться в главное меню', 'main_menu')]);

    await ctx.reply(`👑 АДМИН-ПАНЕЛЬ\n${adminText}`, Markup.inlineKeyboard(buttons));
}

module.exports = (bot) => {
    bot.action('admin_panel', showAdminPanel);
    bot.action(/approve_(.+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const targetUserId = ctx.match[1];
        if (userId !== ADMIN_ID) return;

        const users = await loadUsers();
        users[targetUserId].isApproved = true;
        await saveUser(targetUserId, users[targetUserId]);
        await ctx.reply(`Пользователь ${users[targetUserId].fullName} одобрен.`);
        await bot.telegram.sendMessage(targetUserId, '✅ Ваш профиль подтвержден.');
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
        } finally {
            client.release();
        }
    });
};