const { connectMongo } = require('../config/mongoConfig');
const { formatDate } = require('../bot/utils');

let db;

async function getDb() {
    if (!db) {
        db = await connectMongo();
    }
    return db;
}

function normalizeMessageLink(messageLink) {
    if (!messageLink || typeof messageLink !== 'string') return messageLink;
    const match = messageLink.match(/https:\/\/t\.me\/c\/(\d+)\/(\d+)/);
    if (!match) return messageLink;
    const chatId = match[1];
    const messageId = match[2];
    const normalizedChatId = chatId.startsWith('100') ? chatId.slice(3) : chatId;
    return `https://t.me/c/${normalizedChatId}/${messageId}`;
}

async function saveReport(userId, report) {
    try {
        const reportsCollection = (await getDb()).collection('reports');
        const { reportId, userId: reportUserId, objectName, date, timestamp, workDone, materials, groupMessageIds, messageLink, fullName, photos } = report;
        const normalizedMessageLink = normalizeMessageLink(messageLink);
        // Нормализуем название объекта (убираем пробелы в начале и конце)
        const normalizedObjectName = objectName ? objectName.trim() : objectName;
        // Нормализуем userid до строки для консистентности
        const normalizedUserId = String(reportUserId || userId);
        const result = await reportsCollection.updateOne(
            { reportid: reportId },
            {
                $set: {
                    reportid: reportId,
                    userid: normalizedUserId,
                    objectname: normalizedObjectName,
                    date,
                    timestamp,
                    workdone: workDone,
                    materials,
                    groupmessageids: JSON.stringify(groupMessageIds || {}),
                    messagelink: normalizedMessageLink || null,
                    fullname: fullName,
                    photos: JSON.stringify(photos || [])
                }
            },
            { upsert: true }
        );
        console.log(`Отчет сохранен: reportId=${reportId}, userId=${normalizedUserId}, objectName=${normalizedObjectName}, date=${date}, inserted=${result.upsertedCount > 0}, modified=${result.modifiedCount}`);
    } catch (error) {
        console.error(`Ошибка сохранения отчета: reportId=${report?.reportId}, userId=${userId}`, error);
        throw error;
    }
}

async function loadUserReports(userId) {
    const reportsCollection = (await getDb()).collection('reports');
    // Нормализуем userid до строки для консистентности поиска
    const normalizedUserId = String(userId);
    // Ищем отчеты как по строке, так и по числу (на случай если в базе есть разные типы)
    const reports = await reportsCollection.find({ 
        $or: [
            { userid: normalizedUserId },
            { userid: Number(userId) }
        ]
    }).toArray();
    const reportsMap = {};
    reports.forEach(row => {
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

        reportsMap[row.reportid] = {
            reportId: row.reportid,
            userId: row.userid,
            objectName: row.objectname ? row.objectname.trim() : row.objectname,
            date: row.date,
            timestamp: row.timestamp,
            workDone: row.workdone,
            materials: row.materials,
            groupMessageIds,
            messageLink: row.messagelink,
            fullName: row.fullname,
            photos
        };
    });
    return reportsMap;
}

async function getReportText(objectName) {
    const reportsCollection = (await getDb()).collection('reports');
    const usersCollection = (await getDb()).collection('users');
    const reports = await reportsCollection.find({ objectname: objectName }).sort({ timestamp: 1 }).toArray();
    if (reports.length === 0) return '';
    const userIds = [...new Set(reports.map(r => r.userid))];
    const users = await usersCollection.find({ userid: { $in: userIds } }).toArray();
    const usersMap = Object.fromEntries(users.map(u => [u.userid, u]));
    return reports.map(row => {
        const user = usersMap[row.userid] || {};
        const date = row.date;
        const time = new Date(row.timestamp).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' });
        return `${date} ${time}\n${row.objectname}\n${user.position || 'Не указана'} ${user.organization || 'Не указана'} ${row.fullname}\n\nВЫПОЛНЕННЫЕ РАБОТЫ:\n${row.workdone}\n\nПОСТАВЛЕННЫЕ МАТЕРИАЛЫ:\n${row.materials}\n--------------------------\n`;
    }).join('');
}

async function loadAllReports() {
    const reportsCollection = (await getDb()).collection('reports');
    const reports = await reportsCollection.find({}).toArray();
    const reportsMap = {};
    reports.forEach(row => {
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

        reportsMap[row.reportid] = {
            reportId: row.reportid,
            userId: row.userid,
            objectName: row.objectname ? row.objectname.trim() : row.objectname,
            date: row.date,
            timestamp: row.timestamp,
            workDone: row.workdone,
            materials: row.materials,
            groupMessageIds,
            messageLink: row.messagelink,
            fullName: row.fullname,
            photos
        };
    });
    return reportsMap;
}

module.exports = { loadUserReports, saveReport, getReportText, loadAllReports };