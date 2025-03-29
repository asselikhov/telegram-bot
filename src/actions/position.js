const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { BASE_POSITIONS_LIST, ADMIN_ID } = require('../../config/config');
const { sendMenu } = require('../utils');
const { showOrganizationSelection } = require('./organization');

function getPositionsList(userId) {
    const positions = [...BASE_POSITIONS_LIST];
    if (userId === ADMIN_ID) positions.push('Админ');
    return positions;
}

async function showPositionSelection(ctx, userId) {
    const positions = getPositionsList(userId);
    const buttons = positions.map((pos, index) => [Markup.button.callback(pos, `select_initial_position_${index}`)]);
    buttons.push([Markup.button.callback('Ввести свою должность', 'custom_position')]);
    await sendMenu(ctx, userId, 'Выберите вашу должность:', buttons);
}

module.exports = (bot) => {
    bot.action(/select_initial_position_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const positionIndex = parseInt(ctx.match[1], 10);
        const selectedPosition = getPositionsList(userId)[positionIndex];
        if (!selectedPosition) return;

        const users = await loadUsers();
        users[userId].position = selectedPosition;
        await saveUser(userId, users[userId]);
        ctx.state.step = 'selectOrganization';
        await showOrganizationSelection(ctx, userId);
    });

    bot.action('custom_position', async (ctx) => {
        const userId = ctx.from.id.toString();
        ctx.state.step = 'customPositionInput';
        await ctx.reply('Введите название вашей должности:');
    });

    bot.action('edit_position', async (ctx) => {
        const userId = ctx.from.id.toString();
        const positions = getPositionsList(userId);
        const buttons = positions.map((pos, index) => [Markup.button.callback(pos, `select_position_${index}`)]);
        buttons.push([Markup.button.callback('Ввести свою должность', 'custom_position_edit')]);
        buttons.push([Markup.button.callback('↩️ Назад', 'profile')]);
        await sendMenu(ctx, userId, 'Выберите новую должность:', buttons);
    });

    bot.action(/select_position_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const positionIndex = parseInt(ctx.match[1], 10);
        const selectedPosition = getPositionsList(userId)[positionIndex];
        if (!selectedPosition) return;

        const users = await loadUsers();
        users[userId].position = selectedPosition;
        await saveUser(userId, users[userId]);
        ctx.state.step = null;
        await ctx.reply(`Ваша должность изменена на "${selectedPosition}"`);
        await require('../handlers/menu').showProfile(ctx);
    });

    bot.action('custom_position_edit', async (ctx) => {
        const userId = ctx.from.id.toString();
        ctx.state.step = 'customPositionEditInput';
        await ctx.reply('Введите новое название должности:');
    });

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state;
        if (!state || !['customPositionInput', 'customPositionEditInput'].includes(state.step)) return;

        const position = ctx.message.text.trim();
        if (!position) {
            await ctx.reply('Должность не может быть пустой. Введите снова:');
            return;
        }

        const users = await loadUsers();
        users[userId].position = position;
        await saveUser(userId, users[userId]);

        if (state.step === 'customPositionInput') {
            state.step = 'selectOrganization';
            await showOrganizationSelection(ctx, userId);
        } else {
            state.step = null;
            await ctx.reply(`Должность обновлена на "${position}".`);
            await require('../handlers/menu').showProfile(ctx);
        }
    });
};

module.exports.showPositionSelection = showPositionSelection;