const { pool } = require('./db');
const { formatDate } = require('../bot/utils');

async function loadUserReports(userId) {
    const client = await pool.connect();
    try {
        console.log(`[loadUserReports] Запрос отчетов для userId: ${userId} (тип: ${typeof userId})`);
        const res = await client.query('SELECT * FROM reports WHERE userid = $1', [userId]);
        console.log(`[loadUserReports] Найдено строк: ${res.rowCount}`);
        console.log(`[loadUserReports] Сырые данные строк: ${JSON.stringify(res.rows, null, 2)}`);
        const reports = {};
        res.rows.forEach((row, index) => {
            console.log(`[loadUserReports] Обработка строки ${index}: reportid=${row.reportid}, objectname=${row.objectname}, userid=${row.userid}`);
            let groupMessageIds = row.groupmessageids;
            let photos = row.photos;

            // Обработка groupmessageids
            if (groupMessageIds && typeof groupMessageIds === 'string') {
                try {
                    groupMessageIds = JSON.parse(groupMessageIds);
                } catch (e) {
                    console.error(`[loadUserReports] Ошибка парсинга groupmessageids для reportid=${row.reportid}: ${e.message}`);
                    groupMessageIds = {};
                }
            } else if (!groupMessageIds) {
                groupMessageIds = {};
            }

            // Обработка photos
            if (photos && typeof photos === 'string') {
                try {
                    photos = JSON.parse(photos);
                } catch (e) {
                    console.error(`[loadUserReports] Ошибка парсинга photos для reportid=${row.reportid}: ${e.message}`);
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
        console.log(`[loadUserReports] Загружено ${Object.keys(reports).length} отчетов для userId ${userId}`);
        return reports;
    } catch (err) {
        console.error(`[loadUserReports] Ошибка загрузки отчетов для userId ${userId}: ${err.message}`);
        return {};
    } finally {
        client.release();
    }
}

async function saveReport(userId, report) {
    const { reportId, userId: reportUserId, objectName, date, timestamp, workDone, materials, groupMessageIds, messageLink, fullName, photos } = report;
    const client = await pool.connect();
    try {
        await client.query(`
            INSERT INTO reports (reportid, userid, objectname, date, timestamp, workdone, materials, groupmessageids, messagelink, fullname, photos)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (reportid) DO UPDATE
            SET userid = $2, objectname = $3, date = $4, timestamp = $5, workdone = $6, materials = $7, groupmessageids = $8, messagelink = $9, fullname = $10, photos = $11
        `, [reportId, reportUserId || userId, objectName, date, timestamp, workDone, materials, JSON.stringify(groupMessageIds || {}), messageLink || null, fullName, JSON.stringify(photos || [])]);
        console.log(`[saveReport] Отчет ${reportId} успешно сохранён для userId ${userId}`);
    } catch (err) {
        console.error(`[saveReport] Ошибка сохранения отчета ${reportId} для userId ${userId}: ${err.message}`);
        throw err;
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
                    console.error(`[loadAllReports] Ошибка парсинга groupmessageids для reportid=${row.reportid}: ${e.message}`);
                    groupMessageIds = {};
                }
            } else if (!groupMessageIds) {
                groupMessageIds = {};
            }

            if (photos && typeof photos === 'string') {
                try {
                    photos = JSON.parse(photos);
                } catch (e) {
                    console.error(`[loadAllReports] Ошибка парсинга photos для reportid=${row.reportid}: ${e.message}`);
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
        console.log(`[loadAllReports] Загружено ${Object.keys(reports).length} отчетов`);
        return reports;
    } catch (err) {
        console.error(`[loadAllReports] Ошибка загрузки отчетов: ${err.message}`);
        return {};
    } finally {
        client.release();
    }
}

module.exports = { loadUserReports, saveReport, getReportText, loadAllReports };