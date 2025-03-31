const { Markup } = require('telegraf');
const { pool } = require('../../database/db');
const { generateInviteCode } = require('../../database/inviteCodeModel');
const { loadUsers } = require('../../database/userModel');
const { clearPreviousMessages } = require('../utils');

module.exports = (bot) => {
    // Обработчик для обычных пользователей
    bot.action('generate_invite_code', async (ctx) => {
        console.log('[generate_invite_code] Обработка действия generate_invite_code для userId:', ctx.from.id);
        const userId = ctx.from.id.toString();

        try {
            const users = await loadUsers();
            console.log('[generate_invite_code] Пользователи загружены:', Object.keys(users));

            if (!users[userId]) {
                console.log('[generate_invite_code] Пользователь не найден:', userId);
                await ctx.reply('Пользователь не зарегистрирован.');
                return;
            }

            if (!users[userId].isApproved) {
                console.log('[generate_invite_code] Пользователь не подтвержден:', userId);
                await ctx.reply('Только подтвержденные пользователи могут генерировать коды.');
                return;
            }

            const organization = users[userId].organization;
            console.log('[generate_invite_code] Генерация кода для организации:', organization);
            const code = await generateInviteCode(userId, organization);

            await clearPreviousMessages(ctx, userId);
            console.log('[generate_invite_code] Предыдущие сообщения очищены для userId:', userId);

            const message = await ctx.reply(
                `Ваш пригласительный код: \`${code}\`\nОтправьте его пользователю для регистрации.`,
                { parse_mode: 'Markdown' }
            );
            console.log('[generate_invite_code] Код отправлен, message_id:', message.message_id);
            ctx.state.userStates[userId].messageIds.push(message.message_id);
        } catch (error) {
            console.error('[generate_invite_code] Ошибка при генерации кода:', error);
            await ctx.reply('Произошла ошибка при генерации кода. Попробуйте позже.');
        }
    });

    // Обработчик для администратора
    bot.action('admin_invite_code_menu', async (ctx) => {
        console.log('[admin_invite_code_menu] Обработка действия admin_invite_code_menu для userId:', ctx.from.id);
        const userId = ctx.from.id.toString();

        try {
            const users = await loadUsers();
            console.log('[admin_invite_code_menu] Пользователи загружены:', Object.keys(users));

            if (!users[userId]) {
                console.log('[admin_invite_code_menu] Пользователь не найден:', userId);
                await ctx.reply('Пользователь не зарегистрирован.');
                return;
            }

            if (!users[userId].isApproved) {
                console.log('[admin_invite_code_menu] Пользователь не подтвержден:', userId);
                await ctx.reply('Только подтвержденные пользователи могут генерировать коды.');
                return;
            }

            const organization = users[userId].organization;
            console.log('[admin_invite_code_menu] Генерация кода для организации:', organization);
            const code = await generateInviteCode(userId, organization);

            await clearPreviousMessages(ctx, userId);
            console.log('[admin_invite_code_menu] Предыдущие сообщения очищены для userId:', userId);

            const message = await ctx.reply(
                `Ваш пригласительный код: \`${code}\`\nОтправьте его пользователю для регистрации.\n\nКак администратор, вы можете сгенерировать еще один код, нажав кнопку снова.`,
                { parse_mode: 'Markdown' }
            );
            console.log('[admin_invite_code_menu] Код отправлен, message_id:', message.message_id);
            ctx.state.userStates[userId].messageIds.push(message.message_id);
        } catch (error) {
            console.error('[admin_invite_code_menu] Ошибка при генерации кода:', error);
            await ctx.reply('Произошла ошибка при генерации кода. Попробуйте позже.');
        }
    });
};