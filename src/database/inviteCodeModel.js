const { pool } = require('./db');
const { v4: uuidv4 } = require('uuid');
const NodeCache = require('node-cache');

const inviteCache = new NodeCache({ stdTTL: 300 }); // Кэш на 5 минут

async function generateInviteCode(userId, organization) {
    const code = uuidv4().slice(0, 8);
    await pool.query(`
        INSERT INTO invite_codes (code, organization, createdBy)
        VALUES ($1, $2, $3)
    `, [code, organization, userId]);
    inviteCache.del('all_codes'); // Сброс кэша
    return code;
}

async function validateInviteCode(code) {
    const cachedCode = inviteCache.get(code);
    if (cachedCode) return cachedCode;

    const res = await pool.query(`
        SELECT organization, isUsed, createdBy 
        FROM invite_codes 
        WHERE code = $1
    `, [code]);
    if (res.rows.length === 0) return null;
    const { organization, isused, createdby } = res.rows[0];
    const result = isused ? null : { organization, createdBy: createdby };
    if (result) inviteCache.set(code, result);
    return result;
}

async function markInviteCodeAsUsed(code, userId) {
    const res = await pool.query(`
        UPDATE invite_codes 
        SET isUsed = TRUE, usedBy = $1, usedAt = NOW()
        WHERE code = $2
        RETURNING organization, createdBy, usedAt
    `, [userId, code]);
    inviteCache.del(code); // Удаляем из кэша
    inviteCache.del('all_codes');
    return res.rows[0];
}

async function getAllInviteCodes() {
    const cachedCodes = inviteCache.get('all_codes');
    if (cachedCodes) return cachedCodes;

    const res = await pool.query(`
        SELECT code, organization, isUsed, createdBy, createdAt, usedAt 
        FROM invite_codes 
        ORDER BY createdAt DESC
    `);
    const codes = res.rows.map(row => ({
        code: row.code,
        organization: row.organization,
        isUsed: row.isused,
        createdBy: row.createdby,
        createdAt: row.createdat,
        usedAt: row.usedat
    }));
    inviteCache.set('all_codes', codes);
    return codes;
}

async function loadInviteCode(userId) {
    const cachedCode = inviteCache.get(`user_${userId}`);
    if (cachedCode) return cachedCode;

    const res = await pool.query(`
        SELECT code, organization, createdby AS "createdBy", usedby AS "usedBy", usedat AS "usedAt"
        FROM invite_codes 
        WHERE usedBy = $1 
        ORDER BY createdAt DESC 
        LIMIT 1
    `, [userId]);
    const result = res.rows.length > 0 ? res.rows[0] : null;
    if (result) inviteCache.set(`user_${userId}`, result);
    return result;
}

module.exports = { generateInviteCode, validateInviteCode, markInviteCodeAsUsed, getAllInviteCodes, loadInviteCode };