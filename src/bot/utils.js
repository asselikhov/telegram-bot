async function clearPreviousMessages(ctx, userId) {
    const state = ctx.state.userStates[userId];
    console.log(`clearPreviousMessages вызван для userId ${userId}. State:`, state);

    if (!ctx.chat || !ctx.chat.id) {
        console.error(`Ошибка: ctx.chat.id отсутствует для userId ${userId}`);
        return;
    }

    if (state && Array.isArray(state.messageIds) && state.messageIds.length > 0) {
        console.log(`Найдено ${state.messageIds.length} сообщений для удаления:`, state.messageIds);
        const newMessageIds = [];
        for (const messageId of state.messageIds) {
            try {
                console.log(`Попытка удалить сообщение ${messageId} в чате ${ctx.chat.id}`);
                await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
                console.log(`Сообщение ${messageId} успешно удалено`);
            } catch (e) {
                console.log(`Не удалось удалить сообщение ${messageId}: ${e.message}`);
            }
        }
        state.messageIds = newMessageIds;
        console.log(`messageIds обновлён для userId ${userId}:`, state.messageIds);
    } else {
        console.log(`Нет сообщений для удаления для userId ${userId}. State:`, state);
    }
    console.log(`clearPreviousMessages завершён для userId ${userId}`);
}

module.exports = { clearPreviousMessages };