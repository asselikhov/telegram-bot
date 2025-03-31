async function clearPreviousMessages(ctx, userId) {
    const state = ctx.state.userStates[userId];
    console.log(`clearPreviousMessages вызван для userId ${userId}. State:`, state);

    if (state && Array.isArray(state.messageIds) && state.messageIds.length > 0) {
        console.log(`Найдено ${state.messageIds.length} сообщений для удаления:`, state.messageIds);
        const newMessageIds = [];
        for (const messageId of state.messageIds) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
                console.log(`Сообщение ${messageId} успешно удалено`);
            } catch (e) {
                console.log(`Не удалось удалить сообщение ${messageId}:`, e.message);
            }
        }
        state.messageIds = newMessageIds;
        console.log(`messageIds обновлён для userId ${userId}:`, state.messageIds);
    } else {
        console.log(`Нет сообщений для удаления для userId ${userId}. State:`, state);
    }
}

module.exports = { clearPreviousMessages };