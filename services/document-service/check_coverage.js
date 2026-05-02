const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'legal_ai',
  user: 'postgres',
  password: '123456',
});
async function check() {
  const docs = await pool.query('SELECT COUNT(*) FROM "LegalDocuments"');
  const distinctArts = await pool.query('SELECT COUNT(DISTINCT documentid) FROM vbpl_articles_data');
  const totalArts = await pool.query('SELECT COUNT(*) FROM vbpl_articles_data');
  console.log(`Total LegalDocuments: ${docs.rows[0].count}`);
  console.log(`Documents with parsed articles: ${distinctArts.rows[0].count}`);
  console.log(`Total articles: ${totalArts.rows[0].count}`);
  await pool.end();
}
check();
