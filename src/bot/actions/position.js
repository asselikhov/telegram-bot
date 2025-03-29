const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { BASE_POSITIONS_LIST, ADMIN_ID } = require('../../config/config');
const { clearPreviousMessages } = require('../utils');
const { showOrganizationSelection } = require('./organization'); // Импортируем для перехода

function getPositionsList(userId) {
    const positions = [...BASE_POSITIONS_LIST];
    if (userId === ADMIN_ID) positions.push('Админ');
    return positions;
}

async function showPositionSelection(ctx, userId) {
    await clearPreviousMessages(ctx, userId);

    const positions = getPositionsList(userId);
    const buttons = positions.map((pos, index) => [Markup.button.callback(pos, `select_initial_position_${index}`)]);
    buttons.push([Markup.button.callback('Ввести свою должность', 'custom_position')]);
    await ctx.reply('Выберите вашу должность:', Markup.inlineKeyboard(buttons));
}

module.exports = (bot) => {
    bot.action(/select_initial_position_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const positionIndex = parseInt(ctx.match[1], 10);
        const selectedPosition = getPositionsList(userId)[positionIndex];
        if (!selectedPosition) return;

        await clearPreviousMessages(ctx, userId);

        const users = await loadUsers();
        users[userId].position = selectedPosition;
        await saveUser(userId, users[userId]);

        // Переход к выбору организации
        ctx.state.userStates[userId].step = 'selectOrganization';
        await showOrganizationSelection(ctx, userId);
    });

    bot.action('custom_position', async (ctx) => {
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'customPositionInput';
        await ctx.reply('Введите название вашей должности:');
    });

    bot.action('edit_position', async (ctx) => {
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        const positions = getPositionsList(userId);
        const buttons = positions.map((pos, index) => [Markup.button.callback(pos, `select_position_${index}`)]);
        buttons.push([Markup.button.callback('Ввести свою должность', 'custom_position_edit')]);
        buttons.push([Markup.button.callback('↩️ Назад', 'profile')]);
        await ctx.reply('Выберите новую должность:', Markup.inlineKeyboard(buttons));
    });

    bot.action(/select_position_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const positionIndex = parseInt(ctx.match[1], 10);
        const selectedPosition = getPositionsList(userId)[positionIndex];
        if (!selectedPosition) return;

        await clearPreviousMessages(ctx, userId);
        const users = await loadUsers();
        users[userId].position = selectedPosition;
        await saveUser(userId, users[userId]);
        ctx.state.userStates[userId].step = null;
        await ctx.reply(`Ваша должность изменена на "${selectedPosition}"`);
        await require('../handlers/menu').showProfile(ctx);
    });

    bot.action('custom_position_edit', async (ctx) => {
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'customPositionEditInput';
        await ctx.reply('Введите новое название должности:');
    });

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state.userStates[userId];
        if (!state || (!state.step.includes('customPositionInput') && !state.step.includes('customPositionEditInput'))) return;

        await clearPreviousMessages(ctx, userId);

        const users = await loadUsers();
        if (state.step === 'customPositionInput') {
            users[userId].position = ctx.message.text.trim();
            await saveUser(userId, users[userId]);
            state.step = 'selectOrganization';
            await showOrganizationSelection(ctx, userId);
        } else if (state.step === 'customPositionEditInput') {
            users[userId].position = ctx.message.text.trim();
            await saveUser(userId, users[userId]);
            state.step = null;
            await ctx.reply(`Должность обновлена на "${users[userId].position}".`);
            await require('../handlers/menu').showProfile(ctx);
        }
    });
};

module.exports.showPositionSelection = showPositionSelection;