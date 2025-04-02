const { pool } = require('./db');
const NodeCache = require('node-cache');

const userCache = new NodeCache({ stdTTL: 300 });

async function loadUsers() {
    const cachedUsers = userCache.get('users');
    if (cachedUsers) return cachedUsers;

    const res = await pool.query('SELECT userid, fullname, position, organization, selectedobjects, status, isapproved, nextreportid FROM users');
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
        INSERT INTO users (userid, fullname, position, organization, selectedobjects, status, isapproved, nextreportid)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (userid) 
        DO UPDATE SET 
            fullname = EXCLUDED.fullname,
            position = EXCLUDED.position,
            organization = EXCLUDED.organization,
            selectedobjects = EXCLUDED.selectedobjects,
            status = EXCLUDED.status,
            isapproved = EXCLUDED.isapproved,
            nextreportid = EXCLUDED.nextreportid
    `, [
        userId,
        userData.fullName,
        userData.position,
        userData.organization,
        JSON.stringify(userData.selectedObjects),
        userData.status,
        userData.isApproved,
        userData.nextReportId
    ]);

    userCache.del('users'); // Сбрасываем кэш после каждого сохранения
    await loadUsers(); // Принудительно обновляем кэш
}

async function deleteUser(userId) {
    await pool.query('DELETE FROM users WHERE userid = $1', [userId]);
    userCache.del('users');
    await loadUsers();
}

module.exports = { loadUsers, saveUser, deleteUser };