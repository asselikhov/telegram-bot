function formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}

function parseAndFormatDate(dateString) {
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateString)) {
        return dateString;
    }
    const d = new Date(dateString);
    if (isNaN(d.getTime())) {
        return dateString;
    }
    return formatDate(d);
}

/**
 * Валидация даты рождения в формате ДД.ММ.ГГГГ
 * @param {string} dateString - Дата в формате ДД.ММ.ГГГГ
 * @returns {Object} - { valid: boolean, error: string }
 */
function validateBirthdate(dateString) {
    // Проверка формата
    const dateRegex = /^\d{2}\.\d{2}\.\d{4}$/;
    if (!dateRegex.test(dateString)) {
        return { valid: false, error: 'Неверный формат. Используйте формат ДД.ММ.ГГГГ (например, 15.05.1990)' };
    }
    
    const parts = dateString.split('.');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    
    // Проверка диапазонов
    if (month < 1 || month > 12) {
        return { valid: false, error: 'Месяц должен быть от 1 до 12' };
    }
    
    if (day < 1 || day > 31) {
        return { valid: false, error: 'День должен быть от 1 до 31' };
    }
    
    // Проверка разумного диапазона года (1900-2100)
    if (year < 1900 || year > 2100) {
        return { valid: false, error: 'Год должен быть в диапазоне 1900-2100' };
    }
    
    // Проверка корректности даты (например, 31.02.2024 - невалидная)
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        return { valid: false, error: 'Некорректная дата (например, 31.02.2024 не существует)' };
    }
    
    return { valid: true, error: null };
}

async function clearPreviousMessages(ctx, userId) {
    const state = ctx.state.userStates[userId];
    if (state && Array.isArray(state.messageIds) && state.messageIds.length > 0) {
        const newMessageIds = [];
        for (const messageId of state.messageIds) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
            } catch (e) {}
        }
        state.messageIds = newMessageIds;
    }
}

module.exports = { clearPreviousMessages, formatDate, parseAndFormatDate, validateBirthdate };