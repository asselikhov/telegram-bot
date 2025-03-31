const { Markup } = require('telegraf');
const { loadUsers } = require('../../database/userModel');
const { generateInviteCode, getAllInviteCodes } = require('../../database/inviteCodeModel');
const { clearPreviousMessages } = require('../utils');
const { ADMIN_ID } = require('../../config/config');
const { pool } = require('../../database/db');

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
    const message = await ctx.reply(
        `Ваш пригласительный код: \`${code}\`\nПривязан к организации: ${user.organization}\nПередайте его пользователю для регистрации.`,
        { parse_mode: 'Markdown' }
    );
    ctx.state.userStates[userId].messageIds.push(message.message_id);
}

async function handleAdminInviteCodeMenu(ctx) {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;

    await clearPreviousMessages(ctx, userId);

    // Получаем все уникальные организации из таблицы users
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT DISTINCT organization FROM users WHERE organization IS NOT NULL');
        const organizations = res.rows.map(row => row.organization);

        if (organizations.length === 0) {
            const message = await ctx.reply('В базе данных нет организаций.');
            ctx.state.userStates[userId].messageIds.push(message.message_id);
            return;
        }

        const buttons = organizations.map((org, index) => [
            Markup.button.callback(org, `admin_generate_code_${index}`)
        ]);
        buttons.push([Markup.button.callback('↩️ Назад', 'profile')]);

        const message = await ctx.reply(
            'Выберите организацию для генерации пригласительного кода:',
            Markup.inlineKeyboard(buttons)
        );
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    } finally {
        client.release();
    }
}

async function handleAdminGenerateCode(ctx, orgIndex) {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;

    await clearPreviousMessages(ctx, userId);

    const client = await pool.connect();
    try {
        const res = await client.query('SELECT DISTINCT organization FROM users WHERE organization IS NOT NULL');
        const organizations = res.rows.map(row => row.organization);
        const selectedOrg = organizations[orgIndex];

        if (!selectedOrg) {
            const message = await ctx.reply('Ошибка: организация не найдена.');
            ctx.state.userStates[userId].messageIds.push(message.message_id);
            return;
        }

        const code = await generateInviteCode(userId, selectedOrg);
        const message = await ctx.reply(
            `Пригласительный код для "${selectedOrg}": \`${code}\`\nПередайте его пользователю для регистрации.`,
            { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard([[Markup.button.callback('↩️ Назад', 'profile')]]) }
        );
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    } finally {
        client.release();
    }
}

module.exports = (bot) => {
    bot.action('generate_invite_code', handleGenerateInviteCode);
    bot.action('admin_invite_code_menu', handleAdminInviteCodeMenu);
    bot.action(/admin_generate_code_(\d+)/, async (ctx) => {
        const orgIndex = parseInt(ctx.match[1], 10);
        await handleAdminGenerateCode(ctx, orgIndex);
    });
};