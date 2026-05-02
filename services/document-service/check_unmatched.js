const { Pool } = require('pg');
const pool = new Pool({ host: 'localhost', port: 5433, database: 'legal_ai', user: 'postgres', password: '123456' });

async function checkUnmatched() {
  const res = await pool.query(`
    SELECT DISTINCT vad.documentid 
    FROM vbpl_articles_data vad
    LEFT JOIN "LegalDocuments" ld ON vad.documentid = ld."documentId"
    WHERE ld."documentId" IS NULL
    LIMIT 10
  `);
  console.log("Unmatched documentids in vbpl_articles_data:", res.rows.map(r => r.documentid));
  await pool.end();
}
checkUnmatched().catch(console.error);
