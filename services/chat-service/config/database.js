const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'legalai_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '10092002',
});

pool.on('error', (err) => {
  console.error('[Chat DB]', err.message);
});

module.exports = pool;
