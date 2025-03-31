const { pool } = require('./db'); // Корректный путь

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
                nextReportId: row.nextreportid || 1,
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
            INSERT INTO users (userid, fullname, position, organization, selectedobjects, status, isapproved, nextreportid, reports)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (userid) 
            DO UPDATE SET 
                fullname = EXCLUDED.fullname,
                position = EXCLUDED.position,
                organization = EXCLUDED.organization,
                selectedobjects = EXCLUDED.selectedobjects,
                status = EXCLUDED.status,
                isapproved = EXCLUDED.isapproved,
                nextreportid = EXCLUDED.nextreportid,
                reports = EXCLUDED.reports
        `, [
            userId,
            userData.fullName,
            userData.position,
            userData.organization,
            userData.selectedObjects,
            userData.status,
            userData.isApproved,
            userData.nextReportId,
            userData.reports
        ]);
    } finally {
        client.release();
    }
}

async function deleteUser(userId) {
    const client = await pool.connect();
    try {
        await client.query('DELETE FROM users WHERE userid = $1', [userId]);
    } finally {
        client.release();
    }
}

module.exports = { loadUsers, saveUser, deleteUser };