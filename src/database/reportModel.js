const { pool } = require('./db');
const { formatDate } = require('../bot/utils');
const NodeCache = require('node-cache');

const reportCache = new NodeCache({ stdTTL: 300 });

function normalizeMessageLink(messageLink) {
    if (!messageLink || typeof messageLink !== 'string') return messageLink;
    const match = messageLink.match(/https:\/\/t\.me\/c\/(\d+)\/(\d+)/);
    if (!match) return messageLink;
    const chatId = match[1].startsWith('100') ? match[1].slice(3) : match[1];
    return `https://t.me/c/${chatId}/${match[2]}`;
}

async function saveReport(userId, report) {
    const { reportId, userId: reportUserId, objectName, date, timestamp, workDone, materials, groupMessageIds, messageLink, fullName, photos } = report;
    const normalizedMessageLink = normalizeMessageLink(messageLink);
    await pool.query(`
        INSERT INTO reports (reportid, userid, objectname, date, timestamp, workdone, materials, groupmessageids, messagelink, fullname, photos)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (reportid) DO UPDATE
        SET userid = $2, objectname = $3, date = $4, timestamp = $5, workdone = $6, materials = $7, groupmessageids = $8, messagelink = $9, fullname = $10, photos = $11
    `, [
        reportId,
        reportUserId || userId,
        objectName,
        date,
        timestamp,
        workDone,
        materials,
        JSON.stringify(groupMessageIds || {}),
        normalizedMessageLink || null,
        fullName,
        JSON.stringify(photos || [])
    ]);
    reportCache.del(`user_${userId}`); // Сброс кэша для пользователя
}

async function loadUserReports(userId) {
    const cachedReports = reportCache.get(`user_${userId}`);
    if (cachedReports) return cachedReports;

    const res = await pool.query('SELECT reportid, userid, objectname, date, timestamp, workdone, materials, groupmessageids, messagelink, fullname, photos FROM reports WHERE userid = $1', [userId]);
    const reports = {};
    res.rows.forEach(row => {
        let groupMessageIds = row.groupmessageids ? JSON.parse(row.groupmessageids) : {};
        let photos = row.photos ? JSON.parse(row.photos) : [];
        reports[row.reportid] = {
            reportId: row.reportid,
            userId: row.userid,
            objectName: row.objectname,
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
    reportCache.set(`user_${userId}`, reports);
    return reports;
}

async function getReportText(objectName) {
    const cachedText = reportCache.get(`text_${objectName}`);
    if (cachedText) return cachedText;

    const res = await pool.query(
        'SELECT r.*, u.fullname, u.position, u.organization FROM reports r JOIN users u ON r.userid = u.userid WHERE r.objectname = $1 ORDER BY r.timestamp',
        [objectName]
    );
    if (res.rows.length === 0) return '';
    const text = res.rows.map(row => {
        const date = row.date;
        const time = new Date(row.timestamp).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' });
        return `${date} ${time}\n${row.objectname}\n${row.position || 'Не указана'} ${row.organization || 'Не указана'} ${row.fullname}\n\nВЫПОЛНЕННЫЕ РАБОТЫ:\n${row.workdone}\n\nПОСТАВЛЕННЫЕ МАТЕРИАЛЫ:\n${row.materials}\n--------------------------\n`;
    }).join('');
    reportCache.set(`text_${objectName}`, text);
    return text;
}

async function loadAllReports() {
    const cachedAllReports = reportCache.get('all_reports');
    if (cachedAllReports) return cachedAllReports;

    const res = await pool.query('SELECT reportid, userid, objectname, date, timestamp, workdone, materials, groupmessageids, messagelink, fullname, photos FROM reports');
    const reports = {};
    res.rows.forEach(row => {
        let groupMessageIds = row.groupmessageids ? JSON.parse(row.groupmessageids) : {};
        let photos = row.photos ? JSON.parse(row.photos) : [];
        reports[row.reportid] = {
            reportId: row.reportid,
            userId: row.userid,
            objectName: row.objectname,
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
    reportCache.set('all_reports', reports);
    return reports;
}

module.exports = { loadUserReports, saveReport, getReportText, loadAllReports };