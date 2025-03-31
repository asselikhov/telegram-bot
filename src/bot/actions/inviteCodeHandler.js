const { Markup } = require('telegraf');
const { loadUsers } = require('../../database/userModel');
const { generateInviteCode, getAllInviteCodes } = require('../../database/inviteCodeModel');
const { clearPreviousMessages } = require('../utils');
const { ADMIN_ID } = require('../../config/config');

async function handleGenerateInviteCode(ctx) {
    const userId = ctx.from.id.toString();
    const users = await loadUsers();
    const user = users[userId];

    if (!user.isApproved || !user.organization) {
        await ctx.reply('Вы не можете сгенерировать код, пока ваш профиль не подтвержден или не указана организация.');
        return;
    }

    await clearPreviousMessages(ctx, userId);
    const code = await generateInviteCode(userId, user.organization);
    const message = await ctx.reply(`Ваш пригласительный код: \`${code}\`\nПередайте его пользователю для регистрации в вашей организации.`, { parse_mode: 'Markdown' });
    ctx.state.userStates[userId].messageIds.push(message.message_id);
}

async function handleAdminInviteCodes(ctx) {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;

    await clearPreviousMessages(ctx, userId);
    const codes = await getAllInviteCodes();

    if (codes.length === 0) {
        const message = await ctx.reply('Пригласительных кодов пока нет.');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        return;
    }

    const codesText = codes.map(c =>
        `${c.code} - ${c.organization} (${c.isUsed ? 'Использован' : 'Активен'}) - Создан: ${c.createdBy} (${new Date(c.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })})`
    ).join('\n');

    const message = await ctx.reply(`📋 ВСЕ ПРИГЛАСИТЕЛЬНЫЕ КОДЫ:\n\n${codesText}`, Markup.inlineKeyboard([
        [Markup.button.callback('↩️ Назад', 'profile')]
    ]));
    ctx.state.userStates[userId].messageIds.push(message.message_id);
}

module.exports = (bot) => {
    bot.action('generate_invite_code', handleGenerateInviteCode);
    bot.action('admin_invite_codes', handleAdminInviteCodes);
};