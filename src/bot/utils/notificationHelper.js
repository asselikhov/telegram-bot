/**
 * Форматирует шаблон сообщения уведомления, заменяя переменные на значения
 * @param {string} template - Шаблон сообщения с переменными в формате {variableName}
 * @param {object} variables - Объект с переменными для подстановки
 * @returns {string} - Отформатированное сообщение
 */
function formatNotificationMessage(template, variables) {
    let message = template;
    
    // Заменяем все переменные в формате {variableName}
    Object.keys(variables).forEach(key => {
        const regex = new RegExp(`\\{${key}\\}`, 'g');
        message = message.replace(regex, variables[key] || '');
    });
    
    return message;
}

/**
 * Преобразует время в формате "HH:mm" в cron формат для указанного времени
 * @param {string} timeString - Время в формате "HH:mm" (например, "19:00")
 * @param {string} timezone - Часовой пояс (например, "Europe/Moscow")
 * @returns {string} - Cron выражение в формате "mm HH * * *"
 */
function parseTimeToCron(timeString, timezone = 'Europe/Moscow') {
    const [hours, minutes] = timeString.split(':').map(Number);
    
    // Валидация
    if (isNaN(hours) || isNaN(minutes)) {
        throw new Error(`Неверный формат времени: ${timeString}. Ожидается формат "HH:mm"`);
    }
    
    if (hours < 0 || hours > 23) {
        throw new Error(`Часы должны быть в диапазоне 0-23: ${hours}`);
    }
    
    if (minutes < 0 || minutes > 59) {
        throw new Error(`Минуты должны быть в диапазоне 0-59: ${minutes}`);
    }
    
    // Возвращаем cron формат: минуты часы день месяц день_недели
    // "0 19 * * *" означает каждый день в 19:00
    return `${minutes} ${hours} * * *`;
}

/**
 * Валидирует формат времени
 * @param {string} timeString - Время в формате "HH:mm"
 * @returns {boolean} - true если формат корректен
 */
function validateTimeFormat(timeString) {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(timeString);
}

module.exports = {
    formatNotificationMessage,
    parseTimeToCron,
    validateTimeFormat
};

