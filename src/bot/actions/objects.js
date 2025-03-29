const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { OBJECTS_LIST_CYRILLIC } = require('../../config/config');
const { clearPreviousMessages } = require('../utils');

async function showObjectSelection(ctx, userId, selected = [], messageId = null) {
    const buttons = OBJECTS_LIST_CYRILLIC.map((obj, index) => {
        const isSelected = selected.includes(obj);
        return [Markup.button.callback(`${isSelected ? '✅ ' : ''}${obj}`, `toggle_object_${index}`)];
    });
    buttons.push([Markup.button.callback('Готово', 'confirm_objects')]);
    buttons.push([Markup.button.callback('↩️ Назад', 'profile')]);

    const keyboard = Markup.inlineKeyboard(buttons);
    const text = 'Выберите объекты (можно выбрать несколько):';

    if (messageId) {
        // Редактируем существующее сообщение
        try {
            await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, text, keyboard);
            console.log(`Сообщение ${messageId} отредактировано для userId ${userId}. Выбрано:`, selected);
        } catch (e) {
            console.log(`Не удалось отредактировать сообщение ${messageId}:`, e.message);
            await ctx.reply(text, keyboard); // Если редактирование не удалось, отправляем новое
        }
    } else {
        // Отправляем новое сообщение и сохраняем его ID
        await clearPreviousMessages(ctx, userId); // Очищаем предыдущие сообщения только при первом вызове
        const message = await ctx.reply(text, keyboard);
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        console.log(`Новое сообщение ${message.message_id} отправлено для userId ${userId}. Выбрано:`, selected);
    }
}

module.exports = (bot) => {
    bot.action(/toggle_object_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const objectIndex = parseInt(ctx.match[1], 10);
        const objectName = OBJECTS_LIST_CYRILLIC[objectIndex];
        const state = ctx.state.userStates[userId];

        console.log(`toggle_object_${objectIndex} вызван для userId ${userId}. State:`, state);

        if (!state || (state.step !== 'selectObjects' && state.step !== 'editObjects')) {
            console.log(`Ошибка: Неверное состояние для userId ${userId}. State:`, state);
            return;
        }

        const selectedObjects = state.selectedObjects;
        const index = selectedObjects.indexOf(objectName);
        if (index === -1) selectedObjects.push(objectName); // Добавляем объект
        else selectedObjects.splice(index, 1); // Удаляем объект

        // Редактируем текущее сообщение
        const lastMessageId = state.messageIds[state.messageIds.length - 1];
        await showObjectSelection(ctx, userId, selectedObjects, lastMessageId);
    });

    bot.action('confirm_objects', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state.userStates[userId];

        console.log(`confirm_objects вызван для userId ${userId}. State:`, state);

        if (!state || state.selectedObjects.length === 0) {
            await clearPreviousMessages(ctx, userId);
            await ctx.reply('Выберите хотя бы один объект.');
            return;
        }

        const users = await loadUsers();
        users[userId].selectedObjects = state.selectedObjects;
        await saveUser(userId, users[userId]);
        ctx.state.userStates[userId] = { step: null, selectedObjects: [], messageIds: state.messageIds };
        console.log(`Состояние обновлено после confirm_objects для userId ${userId}:`, ctx.state.userStates[userId]);
        await clearPreviousMessages(ctx, userId);
        await require('../handlers/menu').showProfile(ctx);
    });

    bot.action('edit_object', async (ctx) => {
        const userId = ctx.from.id.toString();
        const users = await loadUsers();
        const currentObjects = users[userId].selectedObjects || [];
        ctx.state.userStates[userId] = { step: 'editObjects', selectedObjects: [...currentObjects], messageIds: ctx.state.userStates[userId].messageIds };
        console.log(`edit_object вызван для userId ${userId}. State:`, ctx.state.userStates[userId]);
        await showObjectSelection(ctx, userId, currentObjects); // Первоначальный вызов без messageId
    });
};