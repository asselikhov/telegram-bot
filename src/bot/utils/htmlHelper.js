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

    // Создаем массив для хранения всех тегов с их позициями и типами
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
            tags.push({ pos: start, tag: openTag, isOpen: true, type });
            tags.push({ pos: end, tag: closeTag, isOpen: false, type });
        }
    });

    // Сортируем теги по позиции
    // При одинаковой позиции: сначала закрывающие теги (в обратном порядке открытия), потом открывающие
    tags.sort((a, b) => {
        if (a.pos !== b.pos) {
            return a.pos - b.pos;
        }
        if (a.isOpen && !b.isOpen) {
            return -1; // Открывающие идут первыми
        }
        if (!a.isOpen && b.isOpen) {
            return 1; // Закрывающие идут после открывающих
        }
        // Если оба открывающие или оба закрывающие на одной позиции - порядок не важен
        return 0;
    });

    // Используем стек для отслеживания открытых тегов и правильной вложенности
    const openTagsStack = [];
    let result = '';
    let currentPos = 0;

    tags.forEach(({ pos, tag, isOpen, type }) => {
        // Добавляем текст до текущей позиции
        if (pos > currentPos) {
            const textPart = text.substring(currentPos, pos);
            result += escapeHtml(textPart);
            currentPos = pos;
        }

        if (isOpen) {
            // Открывающий тег - добавляем в стек и в результат
            openTagsStack.push({ type, tag });
            result += tag;
        } else {
            // Закрывающий тег - находим соответствующий открывающий в стеке (с конца)
            const matchingIndex = openTagsStack.map(t => t.type).lastIndexOf(type);
            if (matchingIndex !== -1) {
                // Закрываем все теги после найденного (в обратном порядке LIFO)
                while (openTagsStack.length > matchingIndex + 1) {
                    const { type: closedType } = openTagsStack.pop();
                    const closeTagMap = {
                        'bold': '</b>',
                        'italic': '</i>',
                        'underline': '</u>',
                        'strikethrough': '</s>',
                        'code': '</code>',
                        'pre': '</pre>',
                        'blockquote': '</blockquote>',
                        'text_link': '</a>',
                        'text_mention': '</a>'
                    };
                    result += closeTagMap[closedType] || '';
                }
                // Закрываем нужный тег
                result += tag;
                openTagsStack.pop();
            } else {
                // Если не нашли соответствующий открывающий тег, просто добавляем закрывающий
                result += tag;
            }
        }
    });

    // Закрываем все оставшиеся открытые теги
    while (openTagsStack.length > 0) {
        const { type: closedType } = openTagsStack.pop();
        const closeTagMap = {
            'bold': '</b>',
            'italic': '</i>',
            'underline': '</u>',
            'strikethrough': '</s>',
            'code': '</code>',
            'pre': '</pre>',
            'blockquote': '</blockquote>',
            'text_link': '</a>',
            'text_mention': '</a>'
        };
        result += closeTagMap[closedType] || '';
    }

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
