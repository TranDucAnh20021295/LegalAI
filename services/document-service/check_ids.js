const { Pool } = require('pg');
const pool = new Pool({ host: 'localhost', port: 5433, database: 'legal_ai', user: 'postgres', password: '123456' });

async function checkIds() {
  // Try joining vbpl_articles_data with LegalDocuments
  const res = await pool.query(`
    SELECT COUNT(*) as total_articles,
           SUM(CASE WHEN ld."documentId" IS NOT NULL THEN 1 ELSE 0 END) as matched_articles
    FROM vbpl_articles_data vad
    LEFT JOIN "LegalDocuments" ld ON vad.documentid = ld."documentId"
  `);
  
  console.log("Article matching based on exact documentId:");
  console.log(`Total articles in vbpl_articles_data: ${res.rows[0].total_articles}`);
  console.log(`Articles matching a LegalDocument: ${res.rows[0].matched_articles}`);
  
  await pool.end();
}
checkIds().catch(console.error);
