const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { OBJECTS_LIST_CYRILLIC } = require('../../config/config');

async function showObjectSelection(ctx, userId, selected = []) {
    const buttons = OBJECTS_LIST_CYRILLIC.map((obj, index) => {
        const isSelected = selected.includes(obj);
        return [Markup.button.callback(`${isSelected ? '✅ ' : ''}${obj}`, `toggle_object_${index}`)];
    });
    buttons.push([Markup.button.callback('Готово', 'confirm_objects')]);
    await ctx.reply('Выберите объекты:', Markup.inlineKeyboard(buttons));
}

module.exports = (bot) => {
    bot.action(/toggle_object_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const objectIndex = parseInt(ctx.match[1], 10);
        const objectName = OBJECTS_LIST_CYRILLIC[objectIndex];
        const state = ctx.state.userStates[userId];

        if (!state || state.step !== 'selectObjects') return;

        const selectedObjects = state.selectedObjects;
        const index = selectedObjects.indexOf(objectName);
        if (index === -1) selectedObjects.push(objectName);
        else selectedObjects.splice(index, 1);

        await showObjectSelection(ctx, userId, selectedObjects);
    });
    bot.action('confirm_objects', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state.userStates[userId];
        const users = await loadUsers();

        if (state.selectedObjects.length === 0) {
            await ctx.reply('Выберите хотя бы один объект.');
            return;
        }

        users[userId].selectedObjects = state.selectedObjects;
        await saveUser(userId, users[userId]);
        await ctx.reply('Объекты выбраны.');
        delete ctx.state.userStates[userId];
    });
};