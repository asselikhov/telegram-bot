const { pool } = require('./db');
const { formatDate } = require('../bot/utils');

async function loadUserReports(userId) {
    const client = await pool.connect();
    try {
        console.log(`[loadUserReports] Запрос отчетов для userId: ${userId}`);
        const res = await client.query('SELECT * FROM reports WHERE userId = $1', [userId]);
        const reports = {};
        console.log(`[loadUserReports] Найдено строк: ${res.rows.length}`);
        res.rows.forEach(row => {
            console.log(`[loadUserReports] Обработка строки: reportId=${row.reportid}, objectName=${row.objectname}`);
            reports[row.reportid] = {
                objectName: row.objectname,
                date: row.date,
                timestamp: row.timestamp,
                workDone: row.workdone, // Используем нижний регистр, как в базе
                materials: row.materials,
                groupMessageIds: row.groupmessageids ? JSON.parse(row.groupmessageids) : {},
                messageLink: row.messagelink,
                fullName: row.fullname,
                userId: row.userid,
                photos: row.photos ? JSON.parse(row.photos) : []
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
    const { reportId, objectName, date, timestamp, workDone, materials, groupMessageIds, messageLink, fullName, photos } = report;
    const client = await pool.connect();
    try {
        await client.query(`
            INSERT INTO reports (reportId, userId, objectName, date, timestamp, workdone, materials, groupMessageIds, messageLink, fullName, photos)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (reportId) DO UPDATE
            SET userId = $2, objectName = $3, date = $4, timestamp = $5, workdone = $6, materials = $7, groupMessageIds = $8, messageLink = $9, fullName = $10, photos = $11
        `, [reportId, userId, objectName, date, timestamp, workDone, materials, JSON.stringify(groupMessageIds || {}), messageLink || null, fullName, JSON.stringify(photos || [])]);
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
            'SELECT r.*, u.fullName, u.position, u.organization FROM reports r JOIN users u ON r.userId = u.userId WHERE r.objectName = $1 ORDER BY r.timestamp',
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
            reports[row.reportid] = {
                reportId: row.reportid,
                userId: row.userid,
                objectName: row.objectname,
                date: row.date,
                timestamp: row.timestamp,
                workDone: row.workdone, // Используем нижний регистр, как в базе
                materials: row.materials,
                groupMessageIds: row.groupmessageids ? JSON.parse(row.groupmessageids) : {},
                messageLink: row.messagelink,
                fullName: row.fullname,
                photos: row.photos ? JSON.parse(row.photos) : []
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