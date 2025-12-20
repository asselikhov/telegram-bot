const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { ADMIN_ID } = require('../../config/config');
const { getPositions } = require('../../database/configService');
const { clearPreviousMessages } = require('../utils');

async function getPositionsList(userId) {
    const positions = await getPositions();
    const positionNames = positions.map(p => p.name);
    if (userId === ADMIN_ID) positionNames.push('Админ');
    return positionNames;
}

async function showPositionSelection(ctx, userId) {
    await clearPreviousMessages(ctx, userId);

    const positions = await getPositionsList(userId);
    const buttons = positions.map((pos, index) => [Markup.button.callback(pos, `select_initial_position_${index}_${userId}`)]);

    const message = await ctx.reply('Выберите вашу должность:', Markup.inlineKeyboard(buttons));
    ctx.state.userStates[userId].messageIds.push(message.message_id);
}

module.exports = (bot) => {
    bot.action(/select_initial_position_(\d+)_(\d+)/, async (ctx) => {
        const positionIndex = parseInt(ctx.match[1], 10);
        const userId = ctx.match[2];
        const positions = await getPositionsList(userId);
        const selectedPosition = positions[positionIndex];
        if (!selectedPosition) return;

        await clearPreviousMessages(ctx, userId);

        const users = await loadUsers();
        users[userId].position = selectedPosition;
        await saveUser(userId, users[userId]);

        ctx.state.userStates[userId].step = 'enterFullName';
        const message = await ctx.reply('Введите ваше ФИО:');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });

    bot.action('edit_position', async (ctx) => {
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        const positions = await getPositionsList(userId);
        const buttons = positions.map((pos, index) => [Markup.button.callback(pos, `select_position_${index}`)]);
        buttons.push([Markup.button.callback('↩️ Назад', 'profile')]);

        const message = await ctx.reply('Выберите новую должность:', Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });

    bot.action(/select_position_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const positionIndex = parseInt(ctx.match[1], 10);
        const positions = await getPositionsList(userId);
        const selectedPosition = positions[positionIndex];
        if (!selectedPosition) return;

        await clearPreviousMessages(ctx, userId);
        const users = await loadUsers();
        users[userId].position = selectedPosition;
        await saveUser(userId, users[userId]);
        ctx.state.userStates[userId].step = null;
        await ctx.reply(`Ваша должность изменена на "${selectedPosition}"`);
        await require('../handlers/menu').showProfile(ctx);
    });
};

module.exports.showPositionSelection = showPositionSelection;