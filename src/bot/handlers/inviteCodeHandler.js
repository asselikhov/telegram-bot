const { Markup } = require('telegraf');
const { pool } = require('../../database/db');
const { generateInviteCode } = require('../../database/inviteCodeModel');
const { loadUsers } = require('../../database/userModel');
const { clearPreviousMessages } = require('../utils');
const { ORGANIZATION_OBJECTS } = require('../../config/config');
const { ADMIN_ID } = require('../../config/config');

module.exports = (bot) => {
    bot.action('generate_invite_code', async (ctx) => {
        const userId = ctx.from.id.toString();

        try {
            const users = await loadUsers();

            if (!users[userId]) {
                await ctx.reply('Пользователь не зарегистрирован.');
                return;
            }

            if (!users[userId].isApproved) {
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

            const message = await ctx.reply(
                messageText,
                {
                    parse_mode: 'Markdown',
                    reply_markup: Markup.inlineKeyboard([
                        [Markup.button.callback('↩️ Вернуться в личный кабинет', 'profile')]
                    ]).reply_markup
                }
            );
            ctx.state.userStates[userId].messageIds.push(message.message_id);
        } catch (error) {
            await ctx.reply('Произошла ошибка при генерации кода. Попробуйте позже.');
        }
    });

    bot.action('admin_invite_code_menu', async (ctx) => {
        const userId = ctx.from.id.toString();

        if (userId !== ADMIN_ID) {
            await ctx.reply('Доступ только для администратора.');
            return;
        }

        await clearPreviousMessages(ctx, userId);

        const organizations = Object.keys(ORGANIZATION_OBJECTS);

        if (organizations.length === 0) {
            await ctx.reply('Нет доступных организаций для генерации кодов.');
            return;
        }

        const buttons = organizations.map((org, index) => [
            Markup.button.callback(org, `generate_admin_code_${index}`)
        ]);
        buttons.push([Markup.button.callback('↩️ Вернуться в личный кабинет', 'profile')]);

        const message = await ctx.reply(
            '🔑 **Генерация пригласительного кода**\nВыберите организацию:',
            Markup.inlineKeyboard(buttons)
        );
        ctx.state.userStates[userId].messageIds.push(message.message_id);

        ctx.state.userStates[userId].adminOrganizations = organizations;
    });

    bot.action(/generate_admin_code_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const orgIndex = parseInt(ctx.match[1], 10);

        if (userId !== ADMIN_ID) {
            await ctx.reply('Доступ только для администратора.');
            return;
        }

        try {
            const users = await loadUsers();

            if (!users[userId]) {
                await ctx.reply('Пользователь не зарегистрирован.');
                return;
            }

            const organizations = ctx.state.userStates[userId].adminOrganizations || [];
            if (!organizations[orgIndex]) {
                await ctx.reply('Организация не найдена.');
                return;
            }

            const organization = organizations[orgIndex];
            const code = await generateInviteCode(userId, organization);

            await clearPreviousMessages(ctx, userId);

            const messageText = `
🔑 **Пригласительный код**  
➖➖➖➖➖➖➖➖➖  
**${organization}**  
Код: \`${code}\`  
Отправьте этот код пользователю для регистрации.
            `.trim();

            const message = await ctx.reply(
                messageText,
                {
                    parse_mode: 'Markdown',
                    reply_markup: Markup.inlineKeyboard([
                        [Markup.button.callback('↩️ Вернуться в личный кабинет', 'profile')]
                    ]).reply_markup
                }
            );
            ctx.state.userStates[userId].messageIds.push(message.message_id);
        } catch (error) {
            await ctx.reply('Произошла ошибка при генерации кода. Попробуйте позже.');
        }
    });
};