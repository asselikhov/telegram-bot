const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { BASE_POSITIONS_LIST, ADMIN_ID } = require('../../config/config');

function getPositionsList(userId) {
    const positions = [...BASE_POSITIONS_LIST];
    if (userId === ADMIN_ID) positions.push('Админ');
    return positions;
}

async function showPositionSelection(ctx, userId) {
    // Удаляем предыдущее сообщение
    if (ctx.state.lastMessageId) {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, ctx.state.lastMessageId);
        } catch (e) {
            console.log('Не удалось удалить сообщение:', e.message);
        }
    }

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

        // Удаляем предыдущее сообщение
        if (ctx.state.lastMessageId) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, ctx.state.lastMessageId);
            } catch (e) {
                console.log('Не удалось удалить сообщение:', e.message);
            }
        }

        const users = await loadUsers();
        users[userId].position = selectedPosition;
        await saveUser(userId, users[userId]);
        ctx.state.userStates[userId] = { step: 'selectOrganization' };
        await require('./organization').showOrganizationSelection(ctx, userId);
    });

    bot.action('custom_position', async (ctx) => {
        const userId = ctx.from.id.toString();
        // Удаляем предыдущее сообщение
        if (ctx.state.lastMessageId) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, ctx.state.lastMessageId);
            } catch (e) {
                console.log('Не удалось удалить сообщение:', e.message);
            }
        }
        ctx.state.userStates[userId] = { step: 'customPositionInput' };
        await ctx.reply('Введите название вашей должности:');
    });

    // Обработчик для edit_position
    bot.action('edit_position', async (ctx) => {
        const userId = ctx.from.id.toString();
        // Удаляем предыдущее сообщение
        if (ctx.state.lastMessageId) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, ctx.state.lastMessageId);
            } catch (e) {
                console.log('Не удалось удалить сообщение:', e.message);
            }
        }
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

        // Удаляем предыдущее сообщение
        if (ctx.state.lastMessageId) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, ctx.state.lastMessageId);
            } catch (e) {
                console.log('Не удалось удалить сообщение:', e.message);
            }
        }

        const users = await loadUsers();
        users[userId].position = selectedPosition;
        await saveUser(userId, users[userId]);
        await ctx.reply(`Должность обновлена на "${selectedPosition}".`);
        await require('../handlers/menu').showProfile(ctx); // Возвращаемся в профиль
    });

    bot.action('custom_position_edit', async (ctx) => {
        const userId = ctx.from.id.toString();
        // Удаляем предыдущее сообщение
        if (ctx.state.lastMessageId) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, ctx.state.lastMessageId);
            } catch (e) {
                console.log('Не удалось удалить сообщение:', e.message);
            }
        }
        ctx.state.userStates[userId] = { step: 'customPositionEditInput' };
        await ctx.reply('Введите новое название должности:');
    });

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state.userStates[userId];
        if (!state || (!state.step.includes('customPositionInput') && !state.step.includes('customPositionEditInput'))) return;

        // Удаляем предыдущее сообщение
        if (ctx.state.lastMessageId) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, ctx.state.lastMessageId);
            } catch (e) {
                console.log('Не удалось удалить сообщение:', e.message);
            }
        }

        const users = await loadUsers();
        if (state.step === 'customPositionInput') {
            users[userId].position = ctx.message.text.trim();
            await saveUser(userId, users[userId]);
            ctx.state.userStates[userId] = { step: 'selectOrganization' };
            await require('./organization').showOrganizationSelection(ctx, userId);
        } else if (state.step === 'customPositionEditInput') {
            users[userId].position = ctx.message.text.trim();
            await saveUser(userId, users[userId]);
            await ctx.reply(`Должность обновлена на "${users[userId].position}".`);
            delete ctx.state.userStates[userId];
            await require('../handlers/menu').showProfile(ctx);
        }
    });
};

module.exports.showPositionSelection = showPositionSelection;