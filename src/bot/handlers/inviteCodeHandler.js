const { Markup } = require('telegraf');
const { pool } = require('../../database/db');
const { generateInviteCode } = require('../../database/inviteCodeModel');
const { loadUsers } = require('../../database/userModel');
const { clearPreviousMessages } = require('../utils');
const { ORGANIZATION_OBJECTS } = require('../../config/config');
const { ADMIN_ID } = require('../../config/config');

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

            const messageText = `
🔑 **Пригласительный код**  
➖➖➖➖➖➖➖➖➖  
Организация: **${organization}**  
Код: \`${code}\`  
Отправьте этот код пользователю для регистрации.
            `.trim();

            const message = await ctx.reply(
                messageText,
                {
                    parse_mode: 'Markdown',
                    reply_markup: Markup.inlineKeyboard([
                        [Markup.button.callback('📋 Скопировать код', `copy_code_${code}`)],
                        [Markup.button.callback('↩️ Вернуться в личный кабинет', 'profile')]
                    ]).reply_markup
                }
            );
            console.log('[generate_invite_code] Код отправлен, message_id:', message.message_id);
            ctx.state.userStates[userId].messageIds.push(message.message_id);
        } catch (error) {
            console.error('[generate_invite_code] Ошибка при генерации кода:', error);
            await ctx.reply('Произошла ошибка при генерации кода. Попробуйте позже.');
        }
    });

    // Обработчик для администратора - показ списка организаций
    bot.action('admin_invite_code_menu', async (ctx) => {
        console.log('[admin_invite_code_menu] Обработка действия admin_invite_code_menu для userId:', ctx.from.id);
        const userId = ctx.from.id.toString();

        if (userId !== ADMIN_ID) {
            console.log('[admin_invite_code_menu] Доступ запрещен, не администратор:', userId);
            await ctx.reply('Доступ только для администратора.');
            return;
        }

        await clearPreviousMessages(ctx, userId);
        console.log('[admin_invite_code_menu] Предыдущие сообщения очищены для userId:', userId);

        // Получаем список организаций из конфига
        const organizations = Object.keys(ORGANIZATION_OBJECTS);
        console.log('[admin_invite_code_menu] Доступные организации:', organizations);

        if (organizations.length === 0) {
            await ctx.reply('Нет доступных организаций для генерации кодов.');
            return;
        }

        // Создаем кнопки с индексами вместо полных названий
        const buttons = organizations.map((org, index) => [
            Markup.button.callback(org, `generate_admin_code_${index}`)
        ]);
        buttons.push([Markup.button.callback('↩️ Вернуться в личный кабинет', 'profile')]);

        const message = await ctx.reply(
            '🔑 **Генерация пригласительного кода**\nВыберите организацию:',
            Markup.inlineKeyboard(buttons)
        );
        console.log('[admin_invite_code_menu] Меню отправлено, message_id:', message.message_id);
        ctx.state.userStates[userId].messageIds.push(message.message_id);

        // Сохраняем список организаций в состоянии для последующего доступа
        ctx.state.userStates[userId].adminOrganizations = organizations;
    });

    // Обработчик выбора организации администратором
    bot.action(/generate_admin_code_(\d+)/, async (ctx) => {
        console.log('[generate_admin_code] Обработка действия generate_admin_code для userId:', ctx.from.id);
        const userId = ctx.from.id.toString();
        const orgIndex = parseInt(ctx.match[1], 10);

        if (userId !== ADMIN_ID) {
            console.log('[generate_admin_code] Доступ запрещен, не администратор:', userId);
            await ctx.reply('Доступ только для администратора.');
            return;
        }

        try {
            const users = await loadUsers();
            console.log('[generate_admin_code] Пользователи загружены:', Object.keys(users));

            if (!users[userId]) {
                console.log('[generate_admin_code] Пользователь не найден:', userId);
                await ctx.reply('Пользователь не зарегистрирован.');
                return;
            }

            const organizations = ctx.state.userStates[userId].adminOrganizations || [];
            if (!organizations[orgIndex]) {
                console.log('[generate_admin_code] Организация не найдена по индексу:', orgIndex);
                await ctx.reply('Организация не найдена.');
                return;
            }

            const organization = organizations[orgIndex];
            console.log('[generate_admin_code] Генерация кода для организации:', organization);
            const code = await generateInviteCode(userId, organization);

            await clearPreviousMessages(ctx, userId);
            console.log('[generate_admin_code] Предыдущие сообщения очищены для userId:', userId);

            const messageText = `
🔑 **Пригласительный код**  
➖➖➖➖➖➖➖➖➖  
Организация: **${organization}**  
Код: \`${code}\`  
Отправьте этот код пользователю для регистрации.
            `.trim();

            const message = await ctx.reply(
                messageText,
                {
                    parse_mode: 'Markdown',
                    reply_markup: Markup.inlineKeyboard([
                        [Markup.button.callback('📋 Скопировать код', `copy_code_${code}`)],
                        [Markup.button.callback('↩️ Вернуться в личный кабинет', 'profile')]
                    ]).reply_markup
                }
            );
            console.log('[generate_admin_code] Код отправлен, message_id:', message.message_id);
            ctx.state.userStates[userId].messageIds.push(message.message_id);
        } catch (error) {
            console.error('[generate_admin_code] Ошибка при генерации кода:', error);
            await ctx.reply('Произошла ошибка при генерации кода. Попробуйте позже.');
        }
    });

    // Обработчик копирования кода
    bot.action(/copy_code_(.+)/, async (ctx) => {
        const code = ctx.match[1];
        console.log('[copy_code] Копирование кода:', code, 'для userId:', ctx.from.id);

        await ctx.reply(`Код для копирования: \`${code}\`\nВыделите код выше и скопируйте его.`, { parse_mode: 'Markdown' });
    });
};