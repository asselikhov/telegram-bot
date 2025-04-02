const { Pool } = require('pg');
const { DATABASE_URL } = require('../config/config');

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 20 // Увеличен пул для параллельных запросов
});

async function initializeDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            userId TEXT PRIMARY KEY,
            fullName TEXT,
            position TEXT,
            organization TEXT,
            selectedObjects TEXT,
            status TEXT DEFAULT 'В работе',
            isApproved INTEGER DEFAULT 0,
            nextReportId INTEGER DEFAULT 1
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reports (
            reportId TEXT PRIMARY KEY,
            userId TEXT,
            objectName TEXT,
            date TEXT,
            timestamp TEXT,
            workDone TEXT,
            materials TEXT,
            groupMessageId TEXT,
            generalMessageId TEXT,
            fullName TEXT,
            photos TEXT DEFAULT '[]',
            FOREIGN KEY (userId) REFERENCES users(userId)
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS invite_codes (
            code TEXT PRIMARY KEY,
            organization TEXT NOT NULL,
            isUsed BOOLEAN DEFAULT FALSE,
            createdBy TEXT,
            usedBy TEXT,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (createdBy) REFERENCES users(userId)
        )
    `);

    await Promise.all([
        pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 
                    FROM information_schema.columns 
                    WHERE table_name = 'invite_codes' 
                    AND column_name = 'usedby'
                ) THEN
                    ALTER TABLE invite_codes ADD COLUMN usedBy TEXT;
                END IF;
            END;
            $$;
        `),
        pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 
                    FROM information_schema.columns 
                    WHERE table_name = 'reports' 
                    AND column_name = 'photos'
                ) THEN
                    ALTER TABLE reports ADD COLUMN photos TEXT DEFAULT '[]';
                END IF;
            END;
            $$;
        `),
        pool.query('CREATE INDEX IF NOT EXISTS idx_users_userid ON users(userid)'),
        pool.query('CREATE INDEX IF NOT EXISTS idx_reports_userid ON reports(userid)'),
        pool.query('CREATE INDEX IF NOT EXISTS idx_reports_objectname ON reports(objectname)')
    ]);
}

module.exports = { pool, initializeDatabase };