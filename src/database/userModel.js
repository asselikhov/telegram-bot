const { pool } = require('./db');
const NodeCache = require('node-cache');

const userCache = new NodeCache({ stdTTL: 300 }); // Кэш на 5 минут

async function loadUsers() {
    const cachedUsers = userCache.get('users');
    if (cachedUsers) return cachedUsers;

    const res = await pool.query('SELECT userid, fullname, position, organization, selectedobjects, status, isapproved, nextreportid, reports FROM users');
    const users = {};
    res.rows.forEach(row => {
        let selectedObjects = [];
        if (row.selectedobjects) {
            try {
                selectedObjects = Array.isArray(row.selectedobjects) ? row.selectedobjects : JSON.parse(row.selectedobjects);
            } catch {
                selectedObjects = [row.selectedobjects];
            }
        }
        users[row.userid] = {
            fullName: row.fullname,
            position: row.position,
            organization: row.organization,
            selectedObjects,
            status: row.status,
            isApproved: row.isapproved,
            nextReportId: row.nextreportid || 1,
            reports: row.reports || {}
        };
    });
    userCache.set('users', users);
    return users;
}

async function saveUser(userId, userData) {
    await pool.query(`
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
        JSON.stringify(userData.selectedObjects),
        userData.status,
        userData.isApproved,
        userData.nextReportId,
        userData.reports
    ]);

    const users = await loadUsers(); // Обновляем кэш
    userCache.set('users', users);
}

async function deleteUser(userId) {
    await pool.query('DELETE FROM users WHERE userid = $1', [userId]);
    const users = await loadUsers();
    userCache.set('users', users);
}

module.exports = { loadUsers, saveUser, deleteUser };