async function clearPreviousMessages(ctx, userId) {
    const state = ctx.state.userStates[userId];
    if (state && state.messageIds.length > 0) {
        for (const messageId of state.messageIds) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
            } catch (e) {
                console.log(`Не удалось удалить сообщение ${messageId}:`, e.message);
            }
        }
        state.messageIds = []; // Очищаем массив после удаления
    }
}

module.exports = { clearPreviousMessages };