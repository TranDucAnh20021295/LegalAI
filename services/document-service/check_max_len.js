const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'legal_ai',
  user: 'postgres',
  password: '123456',
});
async function checkLength() {
  const res = await pool.query('SELECT MAX(LENGTH(content)) as max_len FROM vbpl_articles_data');
  console.log(`Max article length: ${res.rows[0].max_len}`);
  await pool.end();
}
checkLength();
