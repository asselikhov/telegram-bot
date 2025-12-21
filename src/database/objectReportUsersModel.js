const { connectMongo } = require('../config/mongoConfig');

let db;

async function getDb() {
    if (!db) {
        db = await connectMongo();
    }
    return db;
}

async function ensureIndexes() {
    const collection = (await getDb()).collection('object_report_users');
    // Составной уникальный индекс для пары организация+объект
    await collection.createIndex({ organizationName: 1, objectName: 1 }, { unique: true });
    // Индексы для быстрого поиска
    await collection.createIndex({ organizationName: 1 });
    await collection.createIndex({ objectName: 1 });
}

/**
 * Получить список пользователей, которые должны подавать отчеты для пары организация+объект
 * @param {string} organizationName - Название организации
 * @param {string} objectName - Название объекта
 * @returns {Promise<string[]>} - Массив telegramId пользователей
 */
async function getReportUsers(organizationName, objectName) {
    await ensureIndexes();
    const collection = (await getDb()).collection('object_report_users');
    const doc = await collection.findOne({ organizationName, objectName });
    if (!doc || !doc.userIds) {
        return [];
    }
    return doc.userIds;
}

/**
 * Получить все настройки пользователей для отчетов
 * @returns {Promise<Array>} - Массив всех документов с настройками
 */
async function getAllReportUsers() {
    await ensureIndexes();
    const collection = (await getDb()).collection('object_report_users');
    const docs = await collection.find({}).toArray();
    return docs.map(doc => ({
        organizationName: doc.organizationName,
        objectName: doc.objectName,
        userIds: doc.userIds || [],
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
    }));
}

/**
 * Установить список пользователей, которые должны подавать отчеты
 * @param {string} organizationName - Название организации
 * @param {string} objectName - Название объекта
 * @param {string[]} userIds - Массив telegramId пользователей
 */
async function setReportUsers(organizationName, objectName, userIds) {
    await ensureIndexes();
    const collection = (await getDb()).collection('object_report_users');
    const now = new Date();
    
    await collection.updateOne(
        { organizationName, objectName },
        {
            $set: {
                organizationName,
                objectName,
                userIds: userIds || [],
                updatedAt: now
            },
            $setOnInsert: {
                createdAt: now
            }
        },
        { upsert: true }
    );
}

/**
 * Удалить настройки пользователей для пары организация+объект
 * @param {string} organizationName - Название организации
 * @param {string} objectName - Название объекта
 */
async function removeReportUsers(organizationName, objectName) {
    const collection = (await getDb()).collection('object_report_users');
    await collection.deleteOne({ organizationName, objectName });
}

/**
 * Удалить все настройки для организации
 * @param {string} organizationName - Название организации
 */
async function removeAllForOrganization(organizationName) {
    const collection = (await getDb()).collection('object_report_users');
    await collection.deleteMany({ organizationName });
}

/**
 * Удалить все настройки для объекта
 * @param {string} objectName - Название объекта
 */
async function removeAllForObject(objectName) {
    const collection = (await getDb()).collection('object_report_users');
    await collection.deleteMany({ objectName });
}

module.exports = {
    getReportUsers,
    getAllReportUsers,
    setReportUsers,
    removeReportUsers,
    removeAllForOrganization,
    removeAllForObject
};

