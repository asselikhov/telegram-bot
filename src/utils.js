const { Markup } = require('telegraf');

function escapeMarkdown(text) {
    return text.replace(/([_*[\]()~`>#+\-.!])/g, '\\$1');
}

async function clearPreviousMessages(ctx, userId) {
    const state = ctx.state;
    if (!state || !state.messageIds.length) return;

    await Promise.all(state.messageIds.map(async (messageId) => {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
            state.messageIds = state.messageIds.filter(id => id !== messageId);
        } catch (e) {
            console.error(`Не удалось удалить сообщение ${messageId}:`, e.message);
        }
    }));
}

async function sendMenu(ctx, userId, text, buttons) {
    await clearPreviousMessages(ctx, userId);
    const message = await ctx.reply(text, Markup.inlineKeyboard(buttons));
    ctx.state.messageIds.push(message.message_id);
    return message;
}

module.exports = { escapeMarkdown, clearPreviousMessages, sendMenu };