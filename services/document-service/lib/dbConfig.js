require('dotenv').config();

function getPoolConfig() {
  return {
    host: process.env.DB_HOST || process.env.PG_HOST || 'localhost',
    port: Number(process.env.DB_PORT || process.env.PG_PORT || 5433),
    database: process.env.DB_NAME || process.env.PG_DATABASE || 'legal_ai',
    user: process.env.DB_USER || process.env.PG_USER || 'postgres',
    password: process.env.DB_PASSWORD || process.env.PG_PASSWORD || '123456',
  };
}

module.exports = { getPoolConfig };
