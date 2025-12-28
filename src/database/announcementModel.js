const { connectMongo } = require('../config/mongoConfig');
const { formatDate } = require('../bot/utils');

let db;

async function getDb() {
    if (!db) {
        db = await connectMongo();
    }
    return db;
}

async function ensureIndexes() {
    const collection = (await getDb()).collection('announcements');
    try {
        const indexes = await collection.indexes();
        const hasIndex = indexes.some(idx => idx.name === 'announcementid_1');
        if (!hasIndex) {
            await collection.createIndex({ announcementid: 1 }, { unique: true });
            console.log('Создан уникальный индекс на announcementid');
        }
    } catch (error) {
        if (error.code === 26 || error.codeName === 'NamespaceNotFound') {
            try {
                await collection.createIndex({ announcementid: 1 }, { unique: true });
                console.log('Создан уникальный индекс на announcementid (коллекция создана)');
            } catch (createError) {
                // Игнорируем ошибки - коллекция и индекс создадутся при upsert
            }
        }
    }
}

async function saveAnnouncement(userId, announcement) {
    try {
        await ensureIndexes();
        const announcementsCollection = (await getDb()).collection('announcements');
        const { announcementId, userId: announcementUserId, text, objectNames, date, timestamp, groupMessageIds, photos, fullName } = announcement;
        
        if (!announcementId) {
            throw new Error('announcementId is required and cannot be null or undefined');
        }
        
        // Нормализуем objectNames (массив строк)
        const normalizedObjectNames = Array.isArray(objectNames) 
            ? objectNames.map(name => name ? name.trim() : name).filter(Boolean)
            : [];
        
        // Нормализуем userid до строки
        const normalizedUserId = String(announcementUserId || userId);
        
        // Сохраняем groupMessageIds как JSON строку
        const groupMessageIdsJson = JSON.stringify(groupMessageIds || {});
        
        // Сохраняем photos как JSON строку
        const photosJson = JSON.stringify(photos || []);
        
        const result = await announcementsCollection.replaceOne(
            { announcementid: announcementId },
            {
                announcementid: announcementId,
                userid: normalizedUserId,
                text: text || '',
                objectnames: normalizedObjectNames,
                date: date || formatDate(new Date()),
                timestamp: timestamp || new Date().toISOString(),
                groupmessageids: groupMessageIdsJson,
                photos: photosJson,
                fullname: fullName || ''
            },
            { upsert: true }
        );
        console.log(`Объявление сохранено: announcementId=${announcementId}, userId=${normalizedUserId}, date=${date}, inserted=${result.upsertedCount > 0}, modified=${result.modifiedCount}`);
    } catch (error) {
        console.error(`Ошибка сохранения объявления: announcementId=${announcement?.announcementId}, userId=${userId}`, error);
        throw error;
    }
}

async function loadAllAnnouncements() {
    await ensureIndexes();
    const announcementsCollection = (await getDb()).collection('announcements');
    const announcements = await announcementsCollection.find({}).sort({ timestamp: -1 }).toArray();
    const announcementsMap = {};
    
    announcements.forEach(row => {
        let groupMessageIds = row.groupmessageids;
        let photos = row.photos;
        
        try {
            groupMessageIds = JSON.parse(groupMessageIds || '{}');
        } catch (e) {
            groupMessageIds = {};
        }
        
        try {
            photos = JSON.parse(photos || '[]');
        } catch (e) {
            photos = [];
        }
        
        announcementsMap[row.announcementid] = {
            announcementId: row.announcementid,
            userId: row.userid,
            text: row.text || '',
            objectNames: Array.isArray(row.objectnames) ? row.objectnames : [],
            date: row.date,
            timestamp: row.timestamp,
            groupMessageIds,
            photos,
            fullName: row.fullname || ''
        };
    });
    
    return announcementsMap;
}

async function loadAnnouncement(announcementId) {
    await ensureIndexes();
    const announcementsCollection = (await getDb()).collection('announcements');
    const row = await announcementsCollection.findOne({ announcementid: announcementId });
    
    if (!row) {
        return null;
    }
    
    let groupMessageIds = row.groupmessageids;
    let photos = row.photos;
    
    try {
        groupMessageIds = JSON.parse(groupMessageIds || '{}');
    } catch (e) {
        groupMessageIds = {};
    }
    
    try {
        photos = JSON.parse(photos || '[]');
    } catch (e) {
        photos = [];
    }
    
    return {
        announcementId: row.announcementid,
        userId: row.userid,
        text: row.text || '',
        objectNames: Array.isArray(row.objectnames) ? row.objectnames : [],
        date: row.date,
        timestamp: row.timestamp,
        groupMessageIds,
        photos,
        fullName: row.fullname || ''
    };
}

async function deleteAnnouncement(announcementId) {
    if (!announcementId) {
        throw new Error('announcementId is required');
    }
    await ensureIndexes();
    const announcementsCollection = (await getDb()).collection('announcements');
    const result = await announcementsCollection.deleteOne({ announcementid: announcementId });
    if (result.deletedCount === 0) {
        throw new Error('Объявление не было удалено');
    }
    console.log(`Объявление удалено: announcementId=${announcementId}`);
    return true;
}

async function updateAnnouncement(announcementId, updateData) {
    if (!announcementId) {
        throw new Error('announcementId is required');
    }
    await ensureIndexes();
    const announcementsCollection = (await getDb()).collection('announcements');
    
    const update = {};
    if (updateData.text !== undefined) update.text = updateData.text;
    if (updateData.objectNames !== undefined) {
        update.objectnames = Array.isArray(updateData.objectNames) 
            ? updateData.objectNames.map(name => name ? name.trim() : name).filter(Boolean)
            : [];
    }
    if (updateData.groupMessageIds !== undefined) {
        update.groupmessageids = JSON.stringify(updateData.groupMessageIds || {});
    }
    if (updateData.photos !== undefined) {
        update.photos = JSON.stringify(updateData.photos || []);
    }
    
    const result = await announcementsCollection.updateOne(
        { announcementid: announcementId },
        { $set: update }
    );
    
    if (result.matchedCount === 0) {
        throw new Error('Объявление не найдено');
    }
    
    console.log(`Объявление обновлено: announcementId=${announcementId}`);
    return true;
}

module.exports = { 
    saveAnnouncement, 
    loadAllAnnouncements, 
    loadAnnouncement, 
    deleteAnnouncement, 
    updateAnnouncement 
};
