const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { ORGANIZATION_OBJECTS } = require('../../config/config');
const { clearPreviousMessages } = require('../utils');

async function showObjectSelection(ctx, userId, selected = [], messageId = null) {
    const users = await loadUsers();
    const userOrganization = users[userId].organization;
    const availableObjects = ORGANIZATION_OBJECTS[userOrganization] || [];

    if (!availableObjects.length) {
        await clearPreviousMessages(ctx, userId);
        await ctx.reply('Для вашей организации нет доступных объектов. Обратитесь к администратору.');
        return;
    }

    const buttons = availableObjects.map((obj, index) => {
        const isSelected = selected.includes(obj);
        return [Markup.button.callback(`${isSelected ? '✅ ' : ''}${obj}`, `toggle_object_${index}_${userId}`)];
    });
    buttons.push([Markup.button.callback('Готово', `confirm_objects_${userId}`)]);

    const keyboard = Markup.inlineKeyboard(buttons);
    const text = 'Выберите объекты (можно выбрать несколько):';

    if (messageId) {
        try {
            await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, text, keyboard);
        } catch (e) {
            await ctx.reply(text, keyboard);
        }
    } else {
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply(text, keyboard);
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    }
}

module.exports = (bot) => {
    bot.action(/toggle_object_(\d+)_(\d+)/, async (ctx) => {
        const objectIndex = parseInt(ctx.match[1], 10);
        const userId = ctx.match[2];
        const users = await loadUsers();
        const userOrganization = users[userId].organization;
        const availableObjects = ORGANIZATION_OBJECTS[userOrganization] || [];
        const objectName = availableObjects[objectIndex];
        const state = ctx.state.userStates[userId];

        if (!state || (state.step !== 'selectObjects' && state.step !== 'editObjects')) return;

        let selectedObjects = state.selectedObjects || [];
        const index = selectedObjects.indexOf(objectName);
        if (index === -1) selectedObjects.push(objectName);
        else selectedObjects.splice(index, 1);

        state.selectedObjects = selectedObjects;
        const lastMessageId = state.messageIds[state.messageIds.length - 1];
        await showObjectSelection(ctx, userId, selectedObjects, lastMessageId);
    });

    bot.action(/confirm_objects_(\d+)/, async (ctx) => {
        const userId = ctx.match[1];
        const state = ctx.state.userStates[userId];

        if (!state || !state.selectedObjects || state.selectedObjects.length === 0) {
            await clearPreviousMessages(ctx, userId);
            await ctx.reply('Выберите хотя бы один объект.');
            await showObjectSelection(ctx, userId, []);
            return;
        }

        const users = await loadUsers();
        users[userId].selectedObjects = state.selectedObjects;
        await saveUser(userId, users[userId]);

        await clearPreviousMessages(ctx, userId);

        if (state.step === 'editObjects') {
            state.step = null;
            state.selectedObjects = [];
            await ctx.reply('Объекты успешно обновлены.');
            await require('../handlers/menu').showProfile(ctx);
        } else if (state.step === 'selectObjects') {
            state.step = 'selectPosition';
            state.selectedObjects = [];
            const { showPositionSelection } = require('./position');
            await showPositionSelection(ctx, userId);
        }
    });

    bot.action('edit_object', async (ctx) => {
        const userId = ctx.from.id.toString();
        const users = await loadUsers();
        const currentObjects = users[userId].selectedObjects || [];
        ctx.state.userStates[userId] = {
            step: 'editObjects',
            selectedObjects: [...currentObjects],
            messageIds: ctx.state.userStates[userId].messageIds || []
        };
        await showObjectSelection(ctx, userId, currentObjects);
    });
};

module.exports.showObjectSelection = showObjectSelection;