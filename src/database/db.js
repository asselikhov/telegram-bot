const { Pool } = require('pg');
const { DATABASE_URL } = require('../config/config');

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect((err) => {
    if (err) console.error('Ошибка подключения к базе данных:', err.message);
    else console.log('Подключено к базе данных PostgreSQL');
});

async function initializeDatabase() {
    const client = await pool.connect();
    try {
        // Создание таблиц
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                userId TEXT PRIMARY KEY,
                fullName TEXT,
                position TEXT,
                organization TEXT,
                selectedObjects TEXT,
                status TEXT DEFAULT 'В работе',
                isApproved INTEGER DEFAULT 0,
                nextReportId INTEGER DEFAULT 1
            );
        `);
        await client.query(`
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
                photos TEXT DEFAULT '[]', -- Добавляем новое поле для хранения JSON массива photoIds
                FOREIGN KEY (userId) REFERENCES users(userId)
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS invite_codes (
                code TEXT PRIMARY KEY,
                organization TEXT NOT NULL,
                isUsed BOOLEAN DEFAULT FALSE,
                createdBy TEXT,
                usedBy TEXT,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (createdBy) REFERENCES users(userId)
            );
        `);

        // Принудительная миграция: добавление столбца usedBy, если его нет
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 
                    FROM information_schema.columns 
                    WHERE table_name = 'invite_codes' 
                    AND column_name = 'usedby'
                ) THEN
                    ALTER TABLE invite_codes
                    ADD COLUMN usedBy TEXT;
                END IF;
            END;
            $$;
        `);

        // Принудительная миграция: добавление столбца photos, если его нет
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 
                    FROM information_schema.columns 
                    WHERE table_name = 'reports' 
                    AND column_name = 'photos'
                ) THEN
                    ALTER TABLE reports
                    ADD COLUMN photos TEXT DEFAULT '[]';
                END IF;
            END;
            $$;
        `);

        console.log('Таблицы созданы или обновлены');
    } catch (err) {
        console.error('Ошибка при создании или обновлении таблиц:', err.message);
    } finally {
        client.release();
    }
}

module.exports = { pool, initializeDatabase };