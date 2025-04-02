const { pool } = require('./db');
const { formatDate } = require('../bot/utils');

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
    const { reportId, userId: reportUserId, objectName, date, timestamp, workDone, materials, groupMessageIds, messageLink, fullName, photos } = report;
    const client = await pool.connect();
    try {
        const normalizedMessageLink = normalizeMessageLink(messageLink);
        await client.query(`
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
    } catch (err) {
        throw err;
    } finally {
        client.release();
    }
}

async function loadUserReports(userId) {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM reports WHERE userid = $1', [userId]);
        const reports = {};
        res.rows.forEach(row => {
            let groupMessageIds = row.groupmessageids;
            let photos = row.photos;

            if (groupMessageIds && typeof groupMessageIds === 'string') {
                try {
                    groupMessageIds = JSON.parse(groupMessageIds);
                } catch (e) {
                    groupMessageIds = {};
                }
            } else if (!groupMessageIds) {
                groupMessageIds = {};
            }

            if (photos && typeof photos === 'string') {
                try {
                    photos = JSON.parse(photos);
                } catch (e) {
                    photos = [];
                }
            } else if (!photos) {
                photos = [];
            }

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
        return reports;
    } catch (err) {
        return {};
    } finally {
        client.release();
    }
}

async function getReportText(objectName) {
    const client = await pool.connect();
    try {
        const res = await client.query(
            'SELECT r.*, u.fullname, u.position, u.organization FROM reports r JOIN users u ON r.userid = u.userid WHERE r.objectname = $1 ORDER BY r.timestamp',
            [objectName]
        );
        if (res.rows.length === 0) return '';
        return res.rows.map(row => {
            const date = row.date;
            const time = new Date(row.timestamp).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' });
            return `${date} ${time}\n${row.objectname}\n${row.position || 'Не указана'} ${row.organization || 'Не указана'} ${row.fullname}\n\nВЫПОЛНЕННЫЕ РАБОТЫ:\n${row.workdone}\n\nПОСТАВЛЕННЫЕ МАТЕРИАЛЫ:\n${row.materials}\n--------------------------\n`;
        }).join('');
    } finally {
        client.release();
    }
}

async function loadAllReports() {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM reports');
        const reports = {};
        res.rows.forEach(row => {
            let groupMessageIds = row.groupmessageids;
            let photos = row.photos;

            if (groupMessageIds && typeof groupMessageIds === 'string') {
                try {
                    groupMessageIds = JSON.parse(groupMessageIds);
                } catch (e) {
                    groupMessageIds = {};
                }
            } else if (!groupMessageIds) {
                groupMessageIds = {};
            }

            if (photos && typeof photos === 'string') {
                try {
                    photos = JSON.parse(photos);
                } catch (e) {
                    photos = [];
                }
            } else if (!photos) {
                photos = [];
            }

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
        return reports;
    } catch (err) {
        return {};
    } finally {
        client.release();
    }
}

module.exports = { loadUserReports, saveReport, getReportText, loadAllReports };