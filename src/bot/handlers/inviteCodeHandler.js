const { Markup } = require('telegraf');
const { pool } = require('../../database/db');
const { generateInviteCode } = require('../../database/inviteCodeModel');
const { loadUsers } = require('../../database/userModel');
const { clearPreviousMessages } = require('../utils');

module.exports = (bot) => {
    bot.action('generate_code', async (ctx) => {
        console.log('[generate_code] Обработка действия generate_code для userId:', ctx.from.id);
        const userId = ctx.from.id.toString();

        try {
            const users = await loadUsers();
            console.log('[generate_code] Пользователи загружены:', Object.keys(users));

            if (!users[userId]) {
                console.log('[generate_code] Пользователь не найден:', userId);
                await ctx.reply('Пользователь не зарегистрирован.');
                return;
            }

            if (!users[userId].isApproved) {
                console.log('[generate_code] Пользователь не подтвержден:', userId);
                await ctx.reply('Только подтвержденные пользователи могут генерировать коды.');
                return;
            }

            const organization = users[userId].organization;
            console.log('[generate_code] Генерация кода для организации:', organization);
            const code = await generateInviteCode(userId, organization);

            await clearPreviousMessages(ctx, userId);
            console.log('[generate_code] Предыдущие сообщения очищены для userId:', userId);

            const message = await ctx.reply(
                `Ваш пригласительный код: \`${code}\`\nОтправьте его пользователю для регистрации.`,
                { parse_mode: 'Markdown' }
            );
            console.log('[generate_code] Код отправлен, message_id:', message.message_id);
            ctx.state.userStates[userId].messageIds.push(message.message_id);
        } catch (error) {
            console.error('[generate_code] Ошибка при генерации кода:', error);
            await ctx.reply('Произошла ошибка при генерации кода. Попробуйте позже.');
        }
    });
};