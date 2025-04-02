function formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}

function parseAndFormatDate(dateString) {
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateString)) return dateString;
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? dateString : formatDate(d);
}

async function clearPreviousMessages(ctx, userId) {
    const state = ctx.state.userStates[userId];
    if (state?.lastMessageId) {
        await ctx.telegram.deleteMessage(ctx.chat.id, state.lastMessageId).catch(() => {});
        state.lastMessageId = null;
    }
}

module.exports = { clearPreviousMessages, formatDate, parseAndFormatDate };