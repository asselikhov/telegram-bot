const { pool } = require('./db');
const { OBJECTS_LIST_CYRILLIC } = require('../config/config');

function filterValidObjects(objects) {
    return [...new Set(objects)].filter(obj => OBJECTS_LIST_CYRILLIC.includes(obj));
}

async function loadUsers() {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM users');
        const users = {};
        res.rows.forEach(row => {
            let selectedObjects;
            try {
                selectedObjects = row.selectedobjects ? JSON.parse(row.selectedobjects) : [];
            } catch (e) {
                console.error(`Ошибка при парсинге selectedObjects для userId ${row.userid}:`, e.message);
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
        console.log('Пользователи успешно загружены из базы данных:', Object.keys(users));
        return users;
    } catch (error) {
        console.error('Ошибка при загрузке пользователей:', error.message);
        throw error; // Передаем ошибку дальше
    } finally {
        client.release();
    }
}

async function saveUser(userId, userData) {
    const { fullName, position, organization, selectedObjects, status, isApproved, nextReportId } = userData;
    const filteredObjects = filterValidObjects(selectedObjects);
    const client = await pool.connect();
    try {
        console.log(`Сохраняем данные для userId ${userId}:`, { fullName, position, organization, selectedObjects: filteredObjects, status, isApproved, nextReportId });
        await client.query(`
            INSERT INTO users (userId, fullName, position, organization, selectedObjects, status, isApproved, nextReportId)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (userId) DO UPDATE
            SET fullName = $2, position = $3, organization = $4, selectedObjects = $5, status = $6, isApproved = $7, nextReportId = $8
        `, [userId, fullName, position, organization, JSON.stringify(filteredObjects), status, isApproved ? 1 : 0, nextReportId]);
        console.log(`Данные для userId ${userId} успешно сохранены в базе`);
    } catch (error) {
        console.error(`Ошибка при сохранении пользователя userId ${userId}:`, error.message);
        throw error; // Передаем ошибку вызывающему коду
    } finally {
        client.release();
    }
}

module.exports = { loadUsers, saveUser, filterValidObjects };