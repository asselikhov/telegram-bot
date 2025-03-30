// src/bot/actions/position.js
const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { BASE_POSITIONS_LIST, ADMIN_ID } = require('../../config/config');
const { clearPreviousMessages } = require('../utils');

function getPositionsList(userId) {
    const positions = [...BASE_POSITIONS_LIST];
    if (userId === ADMIN_ID) positions.push('Админ');
    return positions;
}

async function showPositionSelection(ctx, userId) {
    await clearPreviousMessages(ctx, userId);

    const positions = getPositionsList(userId);
    const buttons = positions.map((pos, index) => [Markup.button.callback(pos, `select_initial_position_${index}_${userId}`)]);
    buttons.push([Markup.button.callback('Ввести свою должность', `custom_position_${userId}`)]);
    const message = await ctx.reply('Выберите вашу должность:', Markup.inlineKeyboard(buttons));
    ctx.state.userStates[userId].messageIds.push(message.message_id);
}

module.exports = (bot) => {
    bot.action(/select_initial_position_(\d+)_(\d+)/, async (ctx) => {
        const positionIndex = parseInt(ctx.match[1], 10);
        const userId = ctx.match[2];
        const selectedPosition = getPositionsList(userId)[positionIndex];
        if (!selectedPosition) return;

        await clearPreviousMessages(ctx, userId);

        const users = await loadUsers();
        users[userId].position = selectedPosition;
        await saveUser(userId, users[userId]);
        console.log(`Сохранена должность для userId ${userId}: ${selectedPosition}`);

        ctx.state.userStates[userId].step = 'enterFullName';
        const message = await ctx.reply('Введите ваше ФИО:');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        console.log(`Переход к вводу ФИО для userId ${userId} после выбора должности`);
    });

    bot.action(/custom_position_(\d+)/, async (ctx) => {
        const userId = ctx.match[1];
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'customPositionInput';
        const message = await ctx.reply('Введите название вашей должности:');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });

    bot.action('edit_position', async (ctx) => {
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        const positions = getPositionsList(userId);
        const buttons = positions.map((pos, index) => [Markup.button.callback(pos, `select_position_${index}`)]);
        buttons.push([Markup.button.callback('Ввести свою должность', 'custom_position_edit')]);
        buttons.push([Markup.button.callback('↩️ Назад', 'profile')]);
        const message = await ctx.reply('Выберите новую должность:', Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
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
        const message = await ctx.reply('Введите новое название должности:');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state.userStates[userId];
        if (!state) return;

        await clearPreviousMessages(ctx, userId);
        const users = await loadUsers();

        if (state.step === 'customPositionInput') {
            const position = ctx.message.text.trim();
            users[userId].position = position;
            await saveUser(userId, users[userId]);
            console.log(`Сохранена пользовательская должность для userId ${userId}: ${position}`);

            state.step = 'enterFullName';
            const message = await ctx.reply('Введите ваше ФИО:');
            ctx.state.userStates[userId].messageIds.push(message.message_id);
            console.log(`Переход к вводу ФИО для userId ${userId} после ввода своей должности`);
        } else if (state.step === 'enterFullName') {
            const fullName = ctx.message.text.trim();
            users[userId].fullName = fullName;
            await saveUser(userId, users[userId]);
            console.log(`Сохранено ФИО для userId ${userId}: ${fullName}`);

            const message = await ctx.reply('Ваша заявка на рассмотрении, ожидайте');
            state.messageIds.push(message.message_id);

            const adminText = `\n${users[userId].fullName || 'Не указано'} - ${users[userId].position || 'Не указано'} (${users[user