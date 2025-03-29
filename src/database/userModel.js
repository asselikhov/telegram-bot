const { pool } = require('./db');

async function loadUsers() {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM users');
        const users = {};
        res.rows.forEach(row => {
            users[row.userid] = {
                fullName: row.fullname,
                position: row.position,
                organization: row.organization,
                selectedObjects: row.selectedobjects || [],
                status: row.status,
                isApproved: row.isapproved,
                nextReportId: row.nextreportid,
                reports: row.reports || {}
            };
        });
        return users;
    } finally {
        client.release();
    }
}

async function saveUser(userId, userData) {
    const client = await pool.connect();
    try {
        await client.query(`
            INSERT INTO users (userId, fullName, position, organization, selectedObjects, status, isApproved, nextReportId, reports)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (userId)
            DO UPDATE SET
                fullName = EXCLUDED.fullName,
                position = EXCLUDED.position,
                organization = EXCLUDED.organization,
                selectedObjects = EXCLUDED.selectedObjects,
                status = EXCLUDED.status,
                isApproved = EXCLUDED.isApproved,
                nextReportId = EXCLUDED.nextReportId,
                reports = EXCLUDED.reports
        `, [
            userId,
            userData.fullName,
            userData.position,
            userData.organization,
            JSON.stringify(userData.selectedObjects),
            userData.status,
            userData.isApproved,
            userData.nextReportId,
            JSON.stringify(userData.reports || {})
        ]);
    } finally {
        client.release();
    }
}

module.exports = { loadUsers, saveUser };