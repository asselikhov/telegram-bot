/**
 * Вспомогательные функции для безопасной работы с состоянием пользователя
 */

/**
 * Инициализирует userState для пользователя, если его еще нет
 * @param {Object} ctx - контекст Telegraf
 * @returns {Object} userState объект состояния пользователя
 */
function ensureUserState(ctx) {
    const userId = ctx.from?.id?.toString();
    if (!userId) {
        return null;
    }
    
    if (!ctx.state.userStates) {
        ctx.state.userStates = {};
    }
    
    if (!ctx.state.userStates[userId]) {
        ctx.state.userStates[userId] = {
            step: null,
            selectedObjects: [],
            report: {},
            messageIds: []
        };
    }
    
    return ctx.state.userStates[userId];
}

/**
 * Безопасно добавляет messageId в список сообщений пользователя
 * @param {Object} ctx - контекст Telegraf
 * @param {number} messageId - ID сообщения
 */
function addMessageId(ctx, messageId) {
    const state = ensureUserState(ctx);
    if (state && state.messageIds && !state.messageIds.includes(messageId)) {
        state.messageIds.push(messageId);
    }
}

/**
 * Безопасно получает массив messageIds пользователя
 * @param {Object} ctx - контекст Telegraf
 * @returns {Array} массив messageIds или пустой массив
 */
function getMessageIds(ctx) {
    const state = ensureUserState(ctx);
    return state?.messageIds || [];
}

module.exports = {
    ensureUserState,
    addMessageId,
    getMessageIds
};
