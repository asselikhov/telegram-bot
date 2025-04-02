const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { ORGANIZATION_OBJECTS } = require('../../config/config');
const { clearPreviousMessages } = require('../utils');

async function showObjectSelection(ctx, userId, selected = [], messageId = null) {
    const users = await loadUsers();
    const availableObjects = ORGANIZATION_OBJECTS[users[userId].organization] || [];

    const buttons = availableObjects.map((obj, index) => {
        const isSelected = selected.includes(obj);
        return [Markup.button.callback(`${isSelected ? '✅ ' : ''}${obj}`, `toggle_object_${index}_${userId}`)];
    }).concat([[Markup.button.callback('Готово', `confirm_objects_${userId}`)]]);

    const text = 'Выберите объекты (можно выбрать несколько):';
    if (messageId) {
        await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, text, Markup.inlineKeyboard(buttons)).catch(async () => {
            await clearPreviousMessages(ctx, userId);
            const message = await ctx.reply(text, Markup.inlineKeyboard(buttons));
            ctx.state.userStates[userId].lastMessageId = message.message_id;
        });
    } else {
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply(text, Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].lastMessageId = message.message_id;
    }
}

module.exports = (bot) => {
    bot.action(/toggle_object_(\d+)_(\d+)/, async (ctx) => {
        const objectIndex = parseInt(ctx.match[1], 10);
        const userId = ctx.match[2];
        const state = ctx.state.userStates[userId];
        if (!state || (state.step !== 'selectObjects' && state.step !== 'editObjects')) return;

        const users = await loadUsers();
        const availableObjects = ORGANIZATION_OBJECTS[users[userId].organization] || [];
        const objectName = availableObjects[objectIndex];
        let selectedObjects = state.selectedObjects || [];
        const index = selectedObjects.indexOf(objectName);
        if (index === -1) selectedObjects.push(objectName);
        else selectedObjects.splice(index, 1);

        state.selectedObjects = selectedObjects;
        await showObjectSelection(ctx, userId, selectedObjects, state.lastMessageId);
    });

    bot.action(/confirm_objects_(\d+)/, async (ctx) => {
        const userId = ctx.match[1];
        const state = ctx.state.userStates[userId];
        if (!state?.selectedObjects?.length) return;

        await clearPreviousMessages(ctx, userId);
        const users = await loadUsers();
        users[userId].selectedObjects = state.selectedObjects;
        await saveUser(userId, users[userId]);

        if (state.step === 'editObjects') {
            const message = await ctx.reply('Объекты обновлены.');
            ctx.state.userStates[userId].lastMessageId = message.message_id;
            await require('../handlers/menu').showProfile(ctx); // Обновляем профиль
        } else {
            state.step = 'selectPosition';
            const { showPositionSelection } = require('./position');
            await showPositionSelection(ctx, userId);
        }
        state.selectedObjects = [];
    });

    bot.action('edit_object', async (ctx) => {
        const userId = ctx.from.id.toString();
        const users = await loadUsers();
        ctx.state.userStates[userId] = { step: 'editObjects', selectedObjects: [...(users[userId].selectedObjects || [])], lastMessageId: null };
        await showObjectSelection(ctx, userId, users[userId].selectedObjects || []);
    });
};

module.exports.showObjectSelection = showObjectSelection;