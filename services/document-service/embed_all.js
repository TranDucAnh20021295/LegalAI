const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const pgvector = require('pgvector/pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5433,
  database: process.env.DB_NAME || 'legal_ai',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '123456',
});

const { getEmbeddingBatch, isLocal } = require('./lib/embedding');
const { splitTextIntoChunks } = require('./lib/splitText');

function progressLog(prefix, current, total) {
  const pct = total ? Math.round((current / total) * 100) : 0;
  process.stdout.write(`\r[Tiến độ] ${prefix} ${current}/${total} (${pct}%)\x1b[K`);
  if (current >= total) console.log('');
}

async function run() {
  const args = process.argv.slice(2);
  const isReset = args.includes('--reset');
  const recentLimitArgIndex = args.indexOf('--recent-limit');
  const recentLimit = recentLimitArgIndex >= 0 ? Math.max(1, Number(args[recentLimitArgIndex + 1]) || 0) : 0;

  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
  } catch (e) { }

  console.log('====================================================');
  if (isReset) {
    console.log('🗑️  MODE: RESET (Đang xóa toàn bộ dữ liệu cũ...)');
    await pool.query('TRUNCATE TABLE "DocumentChunks"');
  } else {
    console.log('🚀 MODE: RESUME (Tiếp tục nhúng các văn bản chưa làm)');
  }
  console.log(`🔌 Provider: ${isLocal ? 'LOCAL (SBERT 768d)' : 'API (OpenAI 1536d)'}`);
  console.log('====================================================\n');

  console.log('\n1. Lấy danh sách 360.000+ Điều Luật từ vbpl_articles_data...');

  const artRes = recentLimit
    ? await pool.query(`
        SELECT id
        FROM vbpl_articles_data
        WHERE content IS NOT NULL
        ORDER BY id DESC
        LIMIT $1
      `, [recentLimit])
    : await pool.query(`
        SELECT id
        FROM vbpl_articles_data
        WHERE content IS NOT NULL
      `);
  const allArticleIds = artRes.rows.map(r => r.id).sort((a, b) => a - b);

  const existingRes = await pool.query('SELECT DISTINCT "chunkIndex" FROM "DocumentChunks"');
  const existingArtIds = new Set(existingRes.rows.map(r => r.chunkIndex));
  const artsToProcess = allArticleIds.filter(id => !existingArtIds.has(id));

  console.log(`=> Phạm vi Điều luật: ${allArticleIds.length}${recentLimit ? ` mới nhất (--recent-limit ${recentLimit})` : ''} | Đã nhúng toàn DB: ${existingArtIds.size} | Cần chạy tiếp trong phạm vi: ${artsToProcess.length}\n`);

  const col = isLocal ? 'embedding_768' : 'embedding';
  const BATCH_SIZE = 100;

  for (let i = 0; i < artsToProcess.length; i += BATCH_SIZE) {
    const batchIds = artsToProcess.slice(i, i + BATCH_SIZE);

    const batchRes = await pool.query(`
      SELECT id, documentid, title, content 
      FROM vbpl_articles_data 
      WHERE id = ANY($1::int[])
    `, [batchIds]);

    const batchArticles = batchRes.rows;
    let validChunks = [];

    for (const art of batchArticles) {
      const contentChunks = art.content.length > 30000
        ? splitTextIntoChunks(art.content, 1500, 200)
        : [art.content];

      for (const [chunkNo, chunkText] of contentChunks.entries()) {
        validChunks.push({
          id: art.id,
          documentId: art.documentid,
          textToEmbed: art.title ? `${art.title}${contentChunks.length > 1 ? ` #${chunkNo + 1}` : ''}: ${chunkText}` : chunkText,
          exactContent: chunkText
        });
      }
    }

    if (validChunks.length === 0) {
      progressLog('Đang nhúng Điều Luật', Math.min(i + BATCH_SIZE, artsToProcess.length), artsToProcess.length);
      continue;
    }

    const textsToEmbed = validChunks.map(c => c.textToEmbed);
    const embeddings = await getEmbeddingBatch(textsToEmbed);

    if (embeddings.length === 0) {
      console.log(`\n[Lỗi] Không lấy được vector cho batch từ ${i}, bỏ qua...`);
      continue;
    }

    for (let c = 0; c < validChunks.length; c++) {
      if (!embeddings[c]) continue;
      const vectorSql = pgvector.toSql(embeddings[c]);
      await pool.query(
        `INSERT INTO "DocumentChunks" ("chunkId", "documentId", "contentChunk", "chunkIndex", "${col}") VALUES ($1, $2, $3, $4, $5)`,
        [uuidv4(), validChunks[c].documentId, validChunks[c].exactContent, validChunks[c].id, vectorSql]
      );
    }
    progressLog('Đang nhúng Điều Luật', Math.min(i + BATCH_SIZE, artsToProcess.length), artsToProcess.length);
  }

  console.log('\n✅ Hoàn thành toàn bộ!');
  await pool.end();
}

run().catch(e => { console.error('Error during execution:', e); pool.end(); });
