const { connectMongo } = require('../config/mongoConfig');

let db;

async function getDb() {
    if (!db) {
        db = await connectMongo();
    }
    return db;
}

/**
 * Логирует изменение пользователя
 * @param {string} userId - ID пользователя
 * @param {string} adminId - ID администратора, внесшего изменение
 * @param {string} action - Тип действия (update, delete, approve, disapprove, create)
 * @param {string} field - Измененное поле (или 'multiple' для множественных изменений)
 * @param {*} oldValue - Старое значение
 * @param {*} newValue - Новое значение
 * @param {object} metadata - Дополнительные данные (JSON)
 */
async function logUserChange(userId, adminId, action, field, oldValue, newValue, metadata = {}) {
    const collection = (await getDb()).collection('audit_logs');
    const logEntry = {
        userId,
        adminId,
        action,
        field,
        oldValue: typeof oldValue === 'object' ? JSON.stringify(oldValue) : (oldValue || null),
        newValue: typeof newValue === 'object' ? JSON.stringify(newValue) : (newValue || null),
        timestamp: new Date(),
        metadata: metadata || {}
    };
    
    await collection.insertOne(logEntry);
}

/**
 * Получает историю изменений для конкретного пользователя
 * @param {string} userId - ID пользователя
 * @param {number} limit - Лимит записей (по умолчанию 20)
 * @returns {Promise<Array>} Массив записей истории изменений
 */
async function getUserChangeHistory(userId, limit = 20) {
    const collection = (await getDb()).collection('audit_logs');
    const logs = await collection
        .find({ userId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();
    
    return logs.map(log => ({
        adminId: log.adminId,
        action: log.action,
        field: log.field,
        oldValue: log.oldValue,
        newValue: log.newValue,
        timestamp: log.timestamp,
        metadata: log.metadata || {}
    }));
}

/**
 * Получает все изменения с фильтрацией
 * @param {object} filters - Фильтры (userId, adminId, action, field)
 * @param {number} limit - Лимит записей (по умолчанию 100)
 * @returns {Promise<Array>} Массив записей истории изменений
 */
async function getAllChanges(filters = {}, limit = 100) {
    const collection = (await getDb()).collection('audit_logs');
    const query = {};
    
    if (filters.userId) query.userId = filters.userId;
    if (filters.adminId) query.adminId = filters.adminId;
    if (filters.action) query.action = filters.action;
    if (filters.field) query.field = filters.field;
    if (filters.startDate) query.timestamp = { ...query.timestamp, $gte: filters.startDate };
    if (filters.endDate) query.timestamp = { ...query.timestamp, $lte: filters.endDate };
    
    const logs = await collection
        .find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();
    
    return logs.map(log => ({
        userId: log.userId,
        adminId: log.adminId,
        action: log.action,
        field: log.field,
        oldValue: log.oldValue,
        newValue: log.newValue,
        timestamp: log.timestamp,
        metadata: log.metadata || {}
    }));
}

/**
 * Логирует множественные изменения одним действием
 * @param {string} userId - ID пользователя
 * @param {string} adminId - ID администратора
 * @param {string} action - Тип действия
 * @param {object} changes - Объект с изменениями { field: { old, new } }
 * @param {object} metadata - Дополнительные данные
 */
async function logMultipleChanges(userId, adminId, action, changes, metadata = {}) {
    for (const [field, values] of Object.entries(changes)) {
        await logUserChange(userId, adminId, action, field, values.old, values.new, metadata);
    }
}

module.exports = {
    logUserChange,
    getUserChangeHistory,
    getAllChanges,
    logMultipleChanges
};

