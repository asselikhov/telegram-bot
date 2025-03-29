const { pool } = require('./db');
const { OBJECTS_LIST_CYRILLIC } = require('../config/config');

function filterValidObjects(objects) {
    return [...new Set(objects)].filter(obj => OBJECTS_LIST_CYRILLIC.includes(obj));
}

let cachedUsers = null;
let lastCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 минут

async function loadUsers() {
    if (cachedUsers && Date.now() - lastCacheTime < CACHE_DURATION) {
        return cachedUsers;
    }
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM users');
        const users = {};
        res.rows.forEach(row => {
            let selectedObjects;
            try {
                selectedObjects = row.selectedobjects ? JSON.parse(row.selectedobjects) : [];
            } catch (e) {
                console.error(`Ошибка парсинга selectedObjects для userId ${row.userid}:`, e.message);
                selectedObjects = [];
            }
            users[row.userid] = {
                fullName: row.fullname || '',
                position: row.position || '',
                organization: row.organization || '',
                selectedObjects: filterValidObjects(selectedObjects),
                status: row.status || 'В работе',
                isApproved: Boolean(row.isapproved),
                nextReportId: row.nextreportid || 1,
                reports: {}
            };
        });
        cachedUsers = users;
        lastCacheTime = Date.now();
        console.log('Пользователи загружены:', Object.keys(users));
        return users;
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

async function saveUser(userId, userData) {
    const { fullName, position, organization, selectedObjects, status, isApproved, nextReportId } = userData;
    const filteredObjects = filterValidObjects(selectedObjects);
    const client = await pool.connect();
    try {
        await client.query(`
            INSERT INTO users (userId, fullName, position, organization, selectedObjects, status, isApproved, nextReportId)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (userId) DO UPDATE
            SET fullName = $2, position = $3, organization = $4, selectedObjects = $5, status = $6, isApproved = $7, nextReportId = $8
        `, [userId, fullName, position, organization, JSON.stringify(filteredObjects), status, isApproved ? 1 : 0, nextReportId]);
        cachedUsers = null; // Инвалидируем кэш
        console.log(`Данные для userId ${userId} сохранены`);
    } catch (error) {
        console.error(`Ошибка сохранения пользователя ${userId}:`, error.message);
        throw error;
    } finally {
        client.release();
    }
}

module.exports = { loadUsers, saveUser, filterValidObjects };