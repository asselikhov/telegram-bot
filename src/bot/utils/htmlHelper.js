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

    // Создаем массив событий (открытие/закрытие тегов)
    const events = [];

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
            events.push({ pos: start, tag: openTag, isOpen: true, type });
            events.push({ pos: end, tag: closeTag, isOpen: false, type });
        }
    });

    // Сортируем события по позиции
    // При одинаковой позиции: сначала закрывающие (в обратном порядке открытия LIFO), потом открывающие
    const openOrder = new Map();
    let openCounter = 0;
    
    // Заполняем порядок открытия
    events.forEach(event => {
        if (event.isOpen) {
            openOrder.set(`${event.type}_${event.pos}`, openCounter++);
        }
    });
    
    events.sort((a, b) => {
        if (a.pos !== b.pos) {
            return a.pos - b.pos;
        }
        // На одной позиции: сначала закрывающие (в обратном порядке LIFO), потом открывающие
        if (!a.isOpen && b.isOpen) {
            const orderA = openOrder.get(`${a.type}_${a.pos}`) || 0;
            const orderB = openOrder.get(`${b.type}_${b.pos}`) || 0;
            return orderB - orderA; // Более поздние открытия закрываются первыми
        }
        if (a.isOpen && !b.isOpen) {
            return 1; // Открывающие идут после закрывающих
        }
        return 0;
    });

    // Строим HTML, отслеживая открытые теги
    const openStack = [];
    let result = '';
    let currentPos = 0;

    events.forEach(event => {
        const { pos, tag, isOpen, type } = event;
        
        // Добавляем текст до текущей позиции
        if (pos > currentPos) {
            const textPart = text.substring(currentPos, pos);
            result += escapeHtml(textPart);
            currentPos = pos;
        }

        if (isOpen) {
            // Открывающий тег - добавляем в стек и в результат
            openStack.push(type);
            result += tag;
        } else {
            // Закрывающий тег - находим соответствующий открывающий в стеке (с конца)
            const index = openStack.lastIndexOf(type);
            if (index !== -1) {
                // Закрываем все теги после найденного (в обратном порядке LIFO)
                while (openStack.length > index + 1) {
                    const closedType = openStack.pop();
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
                openStack.pop();
            }
        }
    });

    // Закрываем все оставшиеся открытые теги
    while (openStack.length > 0) {
        const closedType = openStack.pop();
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
