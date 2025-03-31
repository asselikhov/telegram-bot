const { pool } = require('./db');

async function loadUserReports(userId) {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM reports WHERE userId = $1', [userId]);
        const reports = {};
        res.rows.forEach(row => {
            reports[row.reportid] = {
                objectName: row.objectname,
                date: row.date,
                timestamp: row.timestamp,
                workDone: row.workdone,
                materials: row.materials,
                groupMessageId: row.groupmessageid,
                generalMessageId: row.generalmessageid,
                fullName: row.fullname,
                userId: row.userid,
                photos: row.photos ? JSON.parse(row.photos) : []
            };
        });
        return reports;
    } finally {
        client.release();
    }
}

async function saveReport(userId, report) {
    const { reportId, objectName, date, timestamp, workDone, materials, groupMessageId, generalMessageId, fullName, photos } = report;
    const client = await pool.connect();
    try {
        await client.query(`
            INSERT INTO reports (reportId, userId, objectName, date, timestamp, workDone, materials, groupMessageId, generalMessageId, fullName, photos)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (reportId) DO UPDATE
            SET userId = $2, objectName = $3, date = $4, timestamp = $5, workDone = $6, materials = $7, groupMessageId = $8, generalMessageId = $9, fullName = $10, photos = $11
        `, [reportId, userId, objectName, date, timestamp, workDone, materials, groupMessageId, generalMessageId, fullName, JSON.stringify(photos || [])]);
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
            const timestamp = new Date(row.timestamp).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
            return `${timestamp}\n${row.objectname}\n${row.position || 'Не указана'} ${row.organization || 'Не указана'} ${row.fullname}\n\nВЫПОЛНЕННЫЕ РАБОТЫ:\n${row.workdone}\n\nПОСТАВЛЕННЫЕ МАТЕРИАЛЫ:\n${row.materials}\n--------------------------\n`;
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
                workDone: row.workdone,
                materials: row.materials,
                groupMessageId: row.groupmessageid,
                generalMessageId: row.generalmessageid,
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