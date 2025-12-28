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

    // Отслеживаем порядок открытия тегов для правильного порядка закрытия
    const openOrder = new Map(); // Хранит порядок открытия для каждого типа тега на каждой позиции
    let openCounter = 0;
    
    // Сначала заполняем порядок открытия
    tags.forEach(tag => {
        if (tag.isOpen) {
            openOrder.set(`${tag.type}_${tag.pos}`, openCounter++);
        }
    });
    
    // Сортируем теги по позиции
    // При одинаковой позиции: сначала открывающие, потом закрывающие (в обратном порядке открытия LIFO)
    tags.sort((a, b) => {
        if (a.pos !== b.pos) {
            return a.pos - b.pos;
        }
        // На одной позиции: сначала открывающие, потом закрывающие
        if (a.isOpen && !b.isOpen) {
            return -1; // Открывающие идут первыми
        }
        if (!a.isOpen && b.isOpen) {
            return 1; // Закрывающие идут после открывающих
        }
        // Если оба открывающие на одной позиции - порядок не важен
        if (a.isOpen && b.isOpen) {
            return 0;
        }
        // Если оба закрывающие на одной позиции - закрываем в обратном порядке открытия (LIFO)
        if (!a.isOpen && !b.isOpen) {
            const orderA = openOrder.get(`${a.type}_${a.pos}`) || 0;
            const orderB = openOrder.get(`${b.type}_${b.pos}`) || 0;
            return orderB - orderA; // Более поздние открытия закрываются первыми
        }
        return 0;
    });

    // Используем стек для отслеживания открытых тегов и правильной вложенности
    const openTagsStack = [];
    let result = '';
    let currentPos = 0;

    tags.forEach((currentTag, tagIndex) => {
        const { pos, tag, isOpen, type } = currentTag;
        
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
            let matchingIndex = -1;
            for (let i = openTagsStack.length - 1; i >= 0; i--) {
                if (openTagsStack[i].type === type) {
                    matchingIndex = i;
                    break;
                }
            }
            
            if (matchingIndex !== -1) {
                // Проверяем, есть ли еще закрывающие теги на этой позиции (после текущего)
                const otherCloseTagsAtSamePos = tags.filter((t, idx) => 
                    idx > tagIndex && !t.isOpen && t.pos === pos
                );
                
                // Сохраняем теги, которые нужно будет открыть обратно
                const tagsToReopen = [];
                
                // Закрываем все теги после найденного (в обратном порядке LIFO)
                while (openTagsStack.length > matchingIndex + 1) {
                    const { type: closedType, tag: closedTag } = openTagsStack.pop();
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
                    
                    // Сохраняем для повторного открытия только если этот тег не закрывается на той же позиции
                    const closesAtSamePos = otherCloseTagsAtSamePos.some(t => t.type === closedType);
                    if (!closesAtSamePos) {
                        tagsToReopen.push({ type: closedType, tag: closedTag });
                    }
                }
                
                // Закрываем нужный тег
                result += tag;
                openTagsStack.pop();
                
                // Открываем обратно теги, которые были закрыты (в обратном порядке, чтобы сохранить исходный порядок)
                // Только если нет других закрывающих тегов на той же позиции
                if (otherCloseTagsAtSamePos.length === 0) {
                    for (let i = tagsToReopen.length - 1; i >= 0; i--) {
                        const tagInfo = tagsToReopen[i];
                        result += tagInfo.tag;
                        openTagsStack.push(tagInfo);
                    }
                }
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

    // Валидация: проверяем, что все открывающие теги закрыты
    const openTagCount = (result.match(/<b>/g) || []).length;
    const closeTagCount = (result.match(/<\/b>/g) || []).length;
    if (openTagCount !== closeTagCount) {
        console.warn(`[HTML HELPER] Mismatch in bold tags: ${openTagCount} open, ${closeTagCount} close`);
    }
    
    const openUTagCount = (result.match(/<u>/g) || []).length;
    const closeUTagCount = (result.match(/<\/u>/g) || []).length;
    if (openUTagCount !== closeUTagCount) {
        console.warn(`[HTML HELPER] Mismatch in underline tags: ${openUTagCount} open, ${closeUTagCount} close`);
        console.warn(`[HTML HELPER] Result text: ${result.substring(0, 200)}...`);
    }

    return result;
}

module.exports = {
    escapeHtml,
    entitiesToHtml
};
