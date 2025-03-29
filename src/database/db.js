const { Pool } = require('pg');
const { DATABASE_URL } = require('../config/config');

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function initializeDatabase() {
    try {
        const client = await pool.connect();
        console.log('Инициализация базы данных выполнена');
        client.release();
    } catch (err) {
        console.error('Ошибка инициализации базы данных:', err);
        process.exit(1);
    }
}

module.exports = { pool, initializeDatabase };