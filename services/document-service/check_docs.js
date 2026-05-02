const { Pool } = require('pg');
const pool = new Pool({ host: 'localhost', port: 5433, database: 'legal_ai', user: 'postgres', password: '123456' });

async function checkDocs() {
  const res = await pool.query(`
    SELECT "documentId", "documentNumber", "link_file_goc" 
    FROM "LegalDocuments" 
    LIMIT 5
  `);
  console.log(res.rows);
  await pool.end();
}
checkDocs().catch(console.error);
