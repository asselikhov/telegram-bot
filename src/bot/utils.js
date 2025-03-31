function formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0'); // +1, т.к. месяцы с 0
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}

// Новая функция для обработки даты из базы
function parseAndFormatDate(dateString) {
    // Если дата уже в формате DD.MM.YYYY, возвращаем как есть
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateString)) {
        return dateString;
    }
    // Иначе предполагаем, что это ISO или другой формат, и преобразуем
    const d = new Date(dateString);
    if (isNaN(d.getTime())) {
        console.error(`Невалидная дата: ${dateString}`);
        return dateString; // Возвращаем как есть, если не удалось распознать
    }
    return formatDate(d);
}

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

module.exports = { clearPreviousMessages, formatDate, parseAndFormatDate };