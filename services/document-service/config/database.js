const { Pool } = require('pg');
const pgvector = require('pgvector/pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'legal_ai',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '10092002',
});

pool.on('connect', (client) => {
  try {
    pgvector.registerTypes(client);
  } catch (e) {}
});

pool.on('error', (err) => {
  console.error('[Document DB]', err.message);
});

module.exports = pool;
