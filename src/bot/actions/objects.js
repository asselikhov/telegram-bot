const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { OBJECTS_LIST_CYRILLIC } = require('../../config/config');
const { sendMenu } = require('../utils');
const { showPositionSelection } = require('./position');

async function showObjectSelection(ctx, userId, selected = [], messageId = null) {
    const buttons = OBJECTS_LIST_CYRILLIC.map((obj, index) => {
        const isSelected = selected.includes(obj);
        return [Markup.button.callback(`${isSelected ? '✅ ' : ''}${obj}`, `toggle_object_${index}`)];
    });
    buttons.push([Markup.button.callback('Готово', 'confirm_objects')]);

    const text = 'Выберите объекты (можно выбрать несколько):';
    if (messageId) {
        try {
            await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, text, Markup.inlineKeyboard(buttons));
        } catch (e) {
            console.error(`Не удалось отредактировать сообщение ${messageId}:`, e.message);
            await sendMenu(ctx, userId, text, buttons);
        }
    } else {
        await sendMenu(ctx, userId, text, buttons);
    }
}

module.exports = (bot) => {
    bot.action(/toggle_object_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const objectIndex = parseInt(ctx.match[1], 10);
        const objectName = OBJECTS_LIST_CYRILLIC[objectIndex];
        const state = ctx.state;

        if (!state || !['selectObjects', 'editObjects'].includes(state.step)) return;

        const selectedObjects = state.selectedObjects;
        const index = selectedObjects.indexOf(objectName);
        if (index === -1) selectedObjects.push(objectName);
        else selectedObjects.splice(index, 1);

        const lastMessageId = state.messageIds[state.messageIds.length - 1];
        await showObjectSelection(ctx, userId, selectedObjects, lastMessageId);
    });

    bot.action('confirm_objects', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state;
        if (!state || state.selectedObjects.length === 0) {
            await ctx.reply('Выберите хотя бы один объект.');
            return;
        }

        const users = await loadUsers();
        users[userId].selectedObjects = state.selectedObjects;
        await saveUser(userId, users[userId]);

        if (state.step === 'editObjects') {
            state.step = null;
            state.selectedObjects = [];
            await ctx.reply('Объекты успешно обновлены.');
            await require('../handlers/menu').showProfile(ctx);
        } else if (state.step === 'selectObjects') {
            state.step = 'selectPosition';
            state.selectedObjects = [];
            await showPositionSelection(ctx, userId);
        }
    });

    bot.action('edit_object', async (ctx) => {
        const userId = ctx.from.id.toString();
        const users = await loadUsers();
        const currentObjects = users[userId].selectedObjects || [];
        ctx.state.step = 'editObjects';
        ctx.state.selectedObjects = [...currentObjects];
        await showObjectSelection(ctx, userId, currentObjects);
    });
};

module.exports.showObjectSelection = showObjectSelection;