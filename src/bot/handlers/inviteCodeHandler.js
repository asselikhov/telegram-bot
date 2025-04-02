const { Markup } = require('telegraf');
const { generateInviteCode } = require('../../database/inviteCodeModel');
const { loadUsers } = require('../../database/userModel');
const { clearPreviousMessages } = require('../utils');
const { ORGANIZATION_OBJECTS, ADMIN_ID } = require('../../config/config');

module.exports = (bot) => {
    bot.action('generate_invite_code', async (ctx) => {
        const userId = ctx.from.id.toString();
        const users = await loadUsers();

        if (!users[userId]?.isApproved) {
            await ctx.reply('Только подтвержденные пользователи могут генерировать коды.');
            return;
        }

        const organization = users[userId].organization;
        const code = await generateInviteCode(userId, organization);

        await clearPreviousMessages(ctx, userId);
        const messageText = `
🔑 **Пригласительный код**  
➖➖➖➖➖➖➖➖➖  
**${organization}**  
Код: \`${code}\`  
Отправьте этот код пользователю для регистрации.
        `.trim();

        await ctx.reply(messageText, { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Вернуться в личный кабинет', 'profile')]
            ]).reply_markup });
    });

    bot.action('admin_invite_code_menu', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        await clearPreviousMessages(ctx, userId);
        const organizations = Object.keys(ORGANIZATION_OBJECTS);
        const buttons = organizations.map((org, index) => [
            Markup.button.callback(org, `generate_admin_code_${index}`)
        ]).concat([[Markup.button.callback('↩️ Вернуться в личный кабинет', 'profile')]]);
        await ctx.reply('🔑 **Генерация кода**\nВыберите организацию:', Markup.inlineKeyboard(buttons));
    });

    bot.action(/generate_admin_code_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        const orgIndex = parseInt(ctx.match[1], 10);
        const users = await loadUsers();
        const organization = Object.keys(ORGANIZATION_OBJECTS)[orgIndex];
        if (!organization) return;

        const code = await generateInviteCode(userId, organization);
        await clearPreviousMessages(ctx, userId);

        const messageText = `
🔑 **Пригласительный код**  
➖➖➖➖➖➖➖➖➖  
**${organization}**  
Код: \`${code}\`  
Отправьте этот код пользователю для регистрации.
        `.trim();

        await ctx.reply(messageText, { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Вернуться в личный кабинет', 'profile')]
            ]).reply_markup });
    });
};