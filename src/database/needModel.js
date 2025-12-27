const { connectMongo } = require('../config/mongoConfig');
const { formatDate } = require('../bot/utils');

let db;

async function getDb() {
    if (!db) {
        db = await connectMongo();
    }
    return db;
}

// Инициализация индекса при первом обращении
async function ensureIndex() {
    try {
        const needsCollection = (await getDb()).collection('needs');
        const indexes = await needsCollection.indexes();
        const hasIndex = indexes.some(idx => idx.name === 'needid_1');
        if (!hasIndex) {
            await needsCollection.createIndex({ needid: 1 }, { unique: true });
            console.log('Создан уникальный индекс на needid');
        }
    } catch (error) {
        console.error('Ошибка при создании индекса на needid:', error);
    }
}

async function saveNeed(userId, need) {
    try {
        await ensureIndex();
        const needsCollection = (await getDb()).collection('needs');
        const { needId, userId: needUserId, objectName, date, timestamp, type, name, quantity, urgency, status, fullName } = need;
        
        // Проверяем, что needId не пустой
        if (!needId) {
            throw new Error('needId is required and cannot be null or undefined');
        }
        
        // Нормализуем название объекта (убираем пробелы в начале и конце)
        const normalizedObjectName = objectName ? objectName.trim() : objectName;
        // Нормализуем userid до строки для консистентности
        const normalizedUserId = String(needUserId || userId);
        
        // Используем replaceOne для полной замены документа
        const result = await needsCollection.replaceOne(
            { needid: needId },
            {
                needid: needId,
                userid: normalizedUserId,
                objectname: normalizedObjectName,
                date,
                timestamp,
                type,
                name,
                quantity: quantity || null,
                urgency,
                status: status || 'new',
                fullname: fullName || ''
            },
            { upsert: true }
        );
        console.log(`Заявка сохранена: needId=${needId}, userId=${normalizedUserId}, objectName=${normalizedObjectName}, date=${date}, inserted=${result.upsertedCount > 0}, modified=${result.modifiedCount}`);
    } catch (error) {
        console.error(`Ошибка сохранения заявки: needId=${need?.needId}, userId=${userId}`, error);
        throw error;
    }
}

async function loadUserNeeds(userId) {
    const needsCollection = (await getDb()).collection('needs');
    // Нормализуем userid до строки для консистентности поиска
    const normalizedUserId = String(userId);
    // Ищем заявки как по строке, так и по числу (на случай если в базе есть разные типы)
    const query = [{ userid: normalizedUserId }];
    if (!isNaN(userId) && userId !== '') {
        query.push({ userid: Number(userId) });
    }
    const needs = await needsCollection.find({ $or: query }).sort({ timestamp: -1 }).toArray();
    const needsMap = {};
    needs.forEach(row => {
        needsMap[row.needid] = {
            needId: row.needid,
            userId: row.userid,
            objectName: row.objectname ? row.objectname.trim() : row.objectname,
            date: row.date,
            timestamp: row.timestamp,
            type: row.type,
            name: row.name,
            quantity: row.quantity || null,
            urgency: row.urgency,
            status: row.status || 'new',
            fullName: row.fullname || ''
        };
    });
    return needsMap;
}

async function deleteNeed(userId, needId) {
    if (!needId) {
        throw new Error('needId is required');
    }
    const needsCollection = (await getDb()).collection('needs');
    const normalizedUserId = String(userId);
    
    // Проверяем, что заявка принадлежит пользователю
    const need = await needsCollection.findOne({ needid: needId });
    if (!need) {
        throw new Error('Заявка не найдена');
    }
    if (String(need.userid) !== normalizedUserId) {
        throw new Error('У вас нет прав для удаления этой заявки');
    }
    
    const result = await needsCollection.deleteOne({ needid: needId });
    if (result.deletedCount === 0) {
        throw new Error('Заявка не была удалена');
    }
    console.log(`Заявка удалена: needId=${needId}, userId=${normalizedUserId}`);
    return true;
}

module.exports = { saveNeed, loadUserNeeds, deleteNeed };
