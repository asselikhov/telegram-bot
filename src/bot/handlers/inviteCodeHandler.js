const { Markup } = require('telegraf');
const { pool } = require('../../database/db'); // Корректный путь из src/bot/handlers/ к src/database/db
const { generateInviteCode } = require('../../database/inviteCodeModel');
const { loadUsers } = require('../../database/userModel');
const { clearPreviousMessages } = require('../utils');

module.exports = (bot) => {
    bot.action('generate_code', async (ctx) => {
        const userId = ctx.from.id.toString();
        const users = await loadUsers();

        if (!users[userId] || !users[userId].isApproved) {
            await ctx.reply('Только подтвержденные пользователи могут генерировать коды.');
            return;
        }

        const organization = users[userId].organization;
        const code = await generateInviteCode(userId, organization);

        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply(
            `Ваш пригласительный код: \`${code}\`\nОтправьте его пользователю для регистрации.`,
            { parse_mode: 'Markdown' }
        );
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
};