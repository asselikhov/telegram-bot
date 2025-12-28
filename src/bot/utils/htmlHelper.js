/**
 * Вспомогательные функции для работы с HTML в Telegram сообщениях
 */

/**
 * Экранирует HTML символы для безопасного использования в Telegram HTML parse_mode
 * @param {string} text - Текст для экранирования
 * @returns {string} Экранированный текст
 */
function escapeHtml(text) {
    if (!text || typeof text !== 'string') {
        return text || '';
    }
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Конвертирует Telegram message entities в HTML форматирование
 * @param {string} text - Исходный текст сообщения
 * @param {Array} entities - Массив entities из ctx.message.entities или ctx.message.caption_entities
 * @returns {string} Текст с HTML форматированием
 */
function entitiesToHtml(text, entities) {
    if (!text || !entities || !Array.isArray(entities) || entities.length === 0) {
        return text || '';
    }

    // Создаем массив для хранения всех тегов с их позициями
    const tags = [];

    // Обрабатываем каждую entity
    entities.forEach(entity => {
        const { type, offset, length } = entity;
        const start = offset;
        const end = offset + length;

        if (start < 0 || end > text.length) {
            return; // Пропускаем некорректные entities
        }

        let openTag = '';
        let closeTag = '';

        switch (type) {
            case 'bold':
                openTag = '<b>';
                closeTag = '</b>';
                break;
            case 'italic':
                openTag = '<i>';
                closeTag = '</i>';
                break;
            case 'underline':
                openTag = '<u>';
                closeTag = '</u>';
                break;
            case 'strikethrough':
                openTag = '<s>';
                closeTag = '</s>';
                break;
            case 'code':
                openTag = '<code>';
                closeTag = '</code>';
                break;
            case 'pre':
                openTag = '<pre>';
                closeTag = '</pre>';
                break;
            case 'blockquote':
                openTag = '<blockquote>';
                closeTag = '</blockquote>';
                break;
            case 'text_link':
                if (entity.url) {
                    openTag = `<a href="${escapeHtml(entity.url)}">`;
                    closeTag = '</a>';
                }
                break;
            case 'text_mention':
                if (entity.user) {
                    openTag = `<a href="tg://user?id=${entity.user.id}">`;
                    closeTag = '</a>';
                }
                break;
            default:
                return; // Пропускаем неизвестные типы
        }

        if (openTag && closeTag) {
            tags.push({ pos: start, tag: openTag, isOpen: true });
            tags.push({ pos: end, tag: closeTag, isOpen: false });
        }
    });

    // Сортируем теги по позиции (открывающие теги с одинаковой позицией идут перед закрывающими)
    tags.sort((a, b) => {
        if (a.pos !== b.pos) {
            return a.pos - b.pos;
        }
        return a.isOpen ? -1 : 1;
    });

    // Строим результирующую строку, вставляя теги в правильном порядке
    let result = '';
    let currentPos = 0;

    tags.forEach(({ pos, tag }) => {
        // Добавляем текст до текущей позиции
        if (pos > currentPos) {
            const textPart = text.substring(currentPos, pos);
            result += escapeHtml(textPart);
            currentPos = pos;
        }
        // Добавляем тег
        result += tag;
    });

    // Добавляем оставшийся текст
    if (currentPos < text.length) {
        result += escapeHtml(text.substring(currentPos));
    }

    return result;
}

module.exports = {
    escapeHtml,
    entitiesToHtml
};
