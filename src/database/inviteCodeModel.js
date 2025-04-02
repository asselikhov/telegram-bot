const { pool } = require('./db');
const { v4: uuidv4 } = require('uuid');

async function generateInviteCode(userId, organization) {
    const client = await pool.connect();
    try {
        const code = uuidv4().slice(0, 8);
        await client.query(`
            INSERT INTO invite_codes (code, organization, createdBy)
            VALUES ($1, $2, $3)
        `, [code, organization, userId]);
        return code;
    } finally {
        client.release();
    }
}

async function validateInviteCode(code) {
    const client = await pool.connect();
    try {
        const res = await client.query(`
            SELECT organization, isUsed, createdBy 
            FROM invite_codes 
            WHERE code = $1
        `, [code]);
        if (res.rows.length === 0) return null;
        const { organization, isused, createdby } = res.rows[0];
        return isused ? null : { organization, createdBy: createdby };
    } finally {
        client.release();
    }
}

async function markInviteCodeAsUsed(code, userId) {
    const client = await pool.connect();
    try {
        const res = await client.query(`
            UPDATE invite_codes 
            SET isUsed = TRUE, usedBy = $1, usedAt = NOW()
            WHERE code = $2
            RETURNING organization, createdBy, usedAt
        `, [userId, code]);
        return res.rows[0];
    } finally {
        client.release();
    }
}

async function getAllInviteCodes() {
    const client = await pool.connect();
    try {
        const res = await client.query(`
            SELECT code, organization, isUsed, createdBy, createdAt, usedAt 
            FROM invite_codes 
            ORDER BY createdAt DESC
        `);
        return res.rows.map(row => ({
            code: row.code,
            organization: row.organization,
            isUsed: row.isused,
            createdBy: row.createdby,
            createdAt: row.createdat,
            usedAt: row.usedat
        }));
    } finally {
        client.release();
    }
}

async function loadInviteCode(userId) {
    const client = await pool.connect();
    try {
        const res = await client.query(`
            SELECT code, organization, createdby AS "createdBy", usedby AS "usedBy", usedat AS "usedAt"
            FROM invite_codes 
            WHERE usedBy = $1 
            ORDER BY createdAt DESC 
            LIMIT 1
        `, [userId]);
        return res.rows.length > 0 ? res.rows[0] : null;
    } finally {
        client.release();
    }
}

module.exports = { generateInviteCode, validateInviteCode, markInviteCodeAsUsed, getAllInviteCodes, loadInviteCode };