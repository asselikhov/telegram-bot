const { Markup } = require('telegraf');

async function clearPreviousMessages(ctx, userId) {
    const messageIds = ctx.state.userStates[userId]?.messageIds || [];
    for (const messageId of messageIds) {
        try {
            await ctx.deleteMessage(messageId);
        } catch (e) {
            console.log(`Не удалось удалить сообщение ${messageId}: ${e.message}`);
        }
    }
    if (ctx.state.userStates[userId]) {
        ctx.state.userStates[userId].messageIds = [];
    }
}

function escapeMarkdown(text) {
    return text.replace(/([_*[\]()~`>#+-=|{}.!])/g, '\\$1');
}

module.exports = { clearPreviousMessages, escapeMarkdown };