const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { OBJECTS_LIST_CYRILLIC } = require('../../config/config');
const { clearPreviousMessages } = require('../utils');
const { showPositionSelection } = require('./position');

async function showObjectSelection(ctx, userId, selectedObjects) {
    await clearPreviousMessages(ctx, userId);

    const buttons = OBJECTS_LIST_CYRILLIC.map((obj, index) => {
        const isSelected = selectedObjects.includes(obj);
        return [Markup.button.callback(`${isSelected ? '✅ ' : ''}${obj}`, `toggle_object_${index}`)];
    });
    buttons.push([Markup.button.callback('Готово', 'finish_objects')]);

    const message = await ctx.reply('Выберите объекты (можно выбрать несколько):', Markup.inlineKeyboard(buttons));
    ctx.state.userStates[userId].messageIds.push(message.message_id);
}

module.exports = (bot) => {
    bot.action(/toggle_object_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const objectIndex = parseInt(ctx.match[1], 10);
        const objectName = OBJECTS_LIST_CYRILLIC[objectIndex];
        if (!objectName) return;

        const users = await loadUsers();
        let selectedObjects = users[userId]?.selectedObjects || [];

        if (selectedObjects.includes(objectName)) {
            selectedObjects = selectedObjects.filter(obj => obj !== objectName);
        } else {
            selectedObjects.push(objectName);
        }

        users[userId].selectedObjects = selectedObjects;
        await saveUser(userId, users[userId]);
        ctx.state.userStates[userId].selectedObjects = selectedObjects;

        await showObjectSelection(ctx, userId, selectedObjects);
    });

    bot.action('finish_objects', async (ctx) => {
        const userId = ctx.from.id.toString();
        const users = await loadUsers();
        const selectedObjects = users[userId]?.selectedObjects || [];

        if (selectedObjects.length === 0) {
            await ctx.reply('Пожалуйста, выберите хотя бы один объект.');
            return showObjectSelection(ctx, userId, selectedObjects);
        }

        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'selectPosition';
        await showPositionSelection(ctx, userId);
    });

    bot.action('edit_object', async (ctx) => {
        const userId = ctx.from.id.toString();
        const users = await loadUsers();
        const selectedObjects = users[userId]?.selectedObjects || [];
        await showObjectSelection(ctx, userId, selectedObjects);
    });
};

module.exports.showObjectSelection = showObjectSelection;