const { pool } = require('./db');

async function loadUserReports(userId) {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM reports WHERE userId = $1', [userId]);
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
                fullName: row.fullname
            };
        });
        return reports;
    } finally {
        client.release();
    }
}

async function saveReport(userId, report) {
    const client = await pool.connect();
    try {
        await client.query(`
            INSERT INTO reports (reportId, userId, objectName, date, timestamp, workDone, materials, groupMessageId, generalMessageId, fullName)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
            report.reportId,
            userId,
            report.objectName,
            report.date,
            report.timestamp,
            report.workDone,
            report.materials,
            report.groupMessageId,
            report.generalMessageId,
            report.fullName
        ]);
    } finally {
        client.release();
    }
}

async function getReportText(objectName) {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM reports WHERE objectName = $1 ORDER BY timestamp DESC', [objectName]);
        if (res.rows.length === 0) return null;

        const report = res.rows[0];
        return `
📅 ОТЧЕТ ЗА ${report.date}  
🏢 ${report.objectname}  
➖➖➖➖➖➖➖➖➖➖➖ 
👷 ${report.fullname}  

ВЫПОЛНЕННЫЕ РАБОТЫ:  
${report.workdone}  

ПОСТАВЛЕННЫЕ МАТЕРИАЛЫ:  
${report.materials}  
➖➖➖➖➖➖➖➖➖➖➖
        `.trim();
    } finally {
        client.release();
    }
}

module.exports = { loadUserReports, saveReport, getReportText };