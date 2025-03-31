const { Markup } = require('telegraf');
const { loadUsers, saveUser, deleteUser } = require('../../database/userModel');
const { clearPreviousMessages } = require('../utils');
const { showMainMenu } = require('./menu');
const { ADMIN_ID } = require('../../config/config');
const { loadInviteCode } = require('../../database/inviteCodeModel');

async function showAdminPanel(ctx) {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;

    await clearPreviousMessages(ctx, userId);
    const message = await ctx.reply(
        '👑 Админ-панель\nВыберите действие:',
        Markup.inlineKeyboard([
            [Markup.button.callback('📋 Просмотреть заявки', 'view_applications')],
            [Markup.button.callback('↩️ Назад', 'main_menu')]
        ])
    );
    ctx.state.userStates[userId].messageIds.push(message.message_id);
}

async function showApplications(ctx) {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;

    await clearPreviousMessages(ctx, userId);
    const users = await loadUsers();
    const pendingUsers = Object.entries(users).filter(([_, user]) => !user.isApproved);

    if (pendingUsers.length === 0) {
        const message = await ctx.reply('Заявок на рассмотрение нет.', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Назад', 'admin_panel')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        return;
    }

    const buttons = pendingUsers.map(([uid, user]) => [
        Markup.button.callback(
            `${user.fullName} (${user.organization})`,
            `review_${uid}`
        )
    ]);
    buttons.push([Markup.button.callback('↩️ Назад', 'admin_panel')]);

    const message = await ctx.reply('Заявки на рассмотрение:', Markup.inlineKeyboard(buttons));
    ctx.state.userStates[userId].messageIds.push(message.message_id);
}

module.exports = (bot) => {
    bot.action('admin_panel', showAdminPanel);
    bot.action('view_applications', showApplications);

    bot.action(/review_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        const reviewUserId = ctx.match[1];
        const users = await loadUsers();
        const user = users[reviewUserId];

        if (!user || user.isApproved) return;

        const inviteCodeData = await loadInviteCode(reviewUserId);
        console.log('[review] Полные данные inviteCodeData для userId', reviewUserId, ':', inviteCodeData);

        const creatorId = inviteCodeData?.createdby; // Используем createdby вместо createdBy
        console.log('[review] ID создателя кода:', creatorId, 'для пользователя:', reviewUserId);

        let creatorFullName;
        if (!inviteCodeData || !creatorId) {
            creatorFullName = 'Код не зарегистрирован';
        } else {
            const creator = users[creatorId];
            creatorFullName = creator ? creator.fullName : 'Пользователь не найден';
        }
        console.log('[review] Создатель:', creatorFullName);

        // Форматирование времени использования
        const usedAt = inviteCodeData?.usedat // Используем usedat вместо usedAt
            ? new Date(inviteCodeData.usedat).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })
            : 'Не указано';

        // Обработка selectedObjects
        const selectedObjects = Array.isArray(user.selectedObjects)
            ? user.selectedObjects
            : user.selectedObjects
                ? [user.selectedObjects]
                : [];
        const objectsList = selectedObjects.length > 0
            ? selectedObjects.map(obj => `· ${obj}`).join('\n')
            : 'Не выбраны';

        await clearPreviousMessages(ctx, userId);

        const userData = `
📝 **Заявка на регистрацию**  
➖➖➖➖➖➖➖➖➖➖➖  
👤 **ФИО:** ${user.fullName || 'Не указано'}  
🏢 **Организация:** ${user.organization || 'Не указано'}  
💼 **Должность:** ${user.position || 'Не указана'}  
🏗 **Объекты:**  
${objectsList}  
🔑 **Код создан:** ${creatorFullName}  
⏰ **Использован:** ${usedAt}
    `.trim();

        const message = await ctx.reply(userData, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('✅ Одобрить', `approve_${reviewUserId}`)],
                [Markup.button.callback('❌ Отклонить', `reject_${reviewUserId}`)],
                [Markup.button.callback('↩️ Назад', 'view_applications')]
            ]).reply_markup
        });
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });

    bot.action(/approve_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        const approveUserId = ctx.match[1];
        const users = await loadUsers();
        const user = users[approveUserId];

        if (user && !user.isApproved) {
            users[approveUserId].isApproved = 1;
            await saveUser(approveUserId, users[approveUserId]);
            await ctx.telegram.sendMessage(approveUserId, 'Ваша заявка одобрена! Используйте /start для входа.');
            await ctx.reply(`Пользователь ${user.fullName} одобрен.`);
        }
        await showApplications(ctx);
    });

    bot.action(/reject_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        const rejectUserId = ctx.match[1];
        const users = await loadUsers();
        const user = users[rejectUserId];

        if (user && !user.isApproved) {
            await deleteUser(rejectUserId);
            await ctx.telegram.sendMessage(rejectUserId, 'Ваша заявка отклонена администратором.');
            await ctx.reply(`Заявка ${user.fullName} отклонена.`);
        }
        await showApplications(ctx);
    });
};