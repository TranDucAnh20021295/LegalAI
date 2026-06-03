const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const pgvector = require('pgvector/pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5433,
  database: process.env.DB_NAME || 'legal_ai',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '123456',
});

const { getEmbeddingBatch } = require('./lib/embedding');
const { buildChunksForArticle } = require('./lib/chunkStrategy');
const { migrateRagSchema } = require('./lib/migrateRagSchema');

function progressLog(prefix, current, total) {
  const pct = total ? Math.round((current / total) * 100) : 0;
  process.stdout.write(`\r[Tiến độ] ${prefix} ${current}/${total} (${pct}%)\x1b[K`);
  if (current >= total) console.log('');
}

async function resolveDocumentIdsInDb(rawIds) {
  const resolved = new Set();
  for (const raw of rawIds) {
    const id = String(raw || '').trim();
    if (!id) continue;

    const exact = await pool.query(
      `
      SELECT DISTINCT TRIM(documentid) AS documentid
      FROM vbpl_articles_data
      WHERE TRIM(documentid) = $1
         OR TRIM(documentnumber) = $1
      `,
      [id]
    );
    for (const row of exact.rows) {
      if (row.documentid) resolved.add(row.documentid);
    }

    if (resolved.size > 0) continue;

    const fuzzy = await pool.query(
      `
      SELECT DISTINCT TRIM(documentid) AS documentid
      FROM vbpl_articles_data
      WHERE TRIM(documentid) ILIKE $1
         OR TRIM(documentnumber) ILIKE $1
      LIMIT 20
      `,
      [`%${id}%`]
    );
    for (const row of fuzzy.rows) {
      if (row.documentid) resolved.add(row.documentid);
    }
  }
  return [...resolved];
}

async function run() {
  const args = process.argv.slice(2);
  const isReset = args.includes('--reset');
  const recentLimitArgIndex = args.indexOf('--recent-limit');
  const recentLimit = recentLimitArgIndex >= 0 ? Math.max(1, Number(args[recentLimitArgIndex + 1]) || 0) : 0;
  const documentIdsFileArgIndex = args.indexOf('--document-ids-file');
  const documentIdsFile = documentIdsFileArgIndex >= 0 ? args[documentIdsFileArgIndex + 1] : '';
  const articleIdsFileArgIndex = args.indexOf('--article-ids-file');
  const articleIdsFile = articleIdsFileArgIndex >= 0 ? args[articleIdsFileArgIndex + 1] : '';
  const refreshAffected = args.includes('--refresh-affected');
  let targetDocumentIds = [];
  let targetArticleIds = [];

  let rawTargetDocumentIds = [];
  if (documentIdsFile) {
    const raw = fs.readFileSync(documentIdsFile, 'utf8');
    const parsed = JSON.parse(raw);
    rawTargetDocumentIds = [...new Set(
      (Array.isArray(parsed) ? parsed : [])
        .map(id => String(id || '').trim())
        .filter(Boolean)
    )];
    targetDocumentIds = await resolveDocumentIdsInDb(rawTargetDocumentIds);
    if (rawTargetDocumentIds.length > 0 && targetDocumentIds.length === 0) {
      console.warn(`⚠️ Không khớp documentId nào trong DB cho ${rawTargetDocumentIds.length} mã từ manifest.`);
      console.warn(`   Mẫu: ${rawTargetDocumentIds.slice(0, 5).join(' | ')}`);
    } else if (targetDocumentIds.length !== rawTargetDocumentIds.length) {
      console.log(`🔗 Đã map ${rawTargetDocumentIds.length} mã manifest → ${targetDocumentIds.length} documentId trong DB.`);
    }
  }

  if (refreshAffected) {
    const affectedPath = path.join(__dirname, '.rag-cleaned-article-ids.json');
    if (!fs.existsSync(affectedPath)) {
      console.error('Không tìm thấy .rag-cleaned-article-ids.json — chạy clean-article-attachments.js --apply trước.');
      process.exit(1);
    }
    targetArticleIds = JSON.parse(fs.readFileSync(affectedPath, 'utf8')).map(Number).filter(Boolean);
    console.log(`📋 --refresh-affected: ${targetArticleIds.length} article ids`);
  }

  if (articleIdsFile) {
    const raw = fs.readFileSync(path.isAbsolute(articleIdsFile) ? articleIdsFile : path.join(__dirname, articleIdsFile), 'utf8');
    const parsed = JSON.parse(raw);
    targetArticleIds = [...new Set((Array.isArray(parsed) ? parsed : []).map(Number).filter(Boolean))];
    console.log(`📋 --article-ids-file: ${targetArticleIds.length} article ids`);
  }

  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    await migrateRagSchema(pool);
  } catch (e) { }

  console.log('====================================================');
  if (isReset) {
    console.log('🗑️  MODE: RESET (Đang xóa toàn bộ dữ liệu cũ...)');
    await pool.query('TRUNCATE TABLE "DocumentChunks"');
  } else if (targetArticleIds.length > 0) {
    console.log(`🎯 MODE: ARTICLE REFRESH (${targetArticleIds.length} điều — PR-CH / clean re-embed)`);
    const deleteRes = await pool.query(
      'DELETE FROM "DocumentChunks" WHERE "chunkIndex" = ANY($1::int[])',
      [targetArticleIds]
    );
    console.log(`🧹 Đã xóa ${deleteRes.rowCount} chunks cũ theo chunkIndex (article id).`);
  } else if (targetDocumentIds.length > 0) {
    console.log(`🎯 MODE: TARGETED REFRESH (${targetDocumentIds.length} văn bản vừa crawl)`);
    const deleteRes = await pool.query(
      'DELETE FROM "DocumentChunks" WHERE TRIM("documentId") = ANY($1::text[])',
      [targetDocumentIds]
    );
    console.log(`🧹 Đã xóa ${deleteRes.rowCount} chunks cũ của các văn bản vừa crawl.`);
  } else {
    console.log('🚀 MODE: RESUME (Tiếp tục nhúng các văn bản chưa làm)');
  }
  console.log('🔌 Provider: API (OpenAI 1536d)');
  console.log('====================================================\n');
  console.log('\n1. Lấy danh sách Điều Luật chưa được tạo Vector Embedding từ DB...');

  let query;
  let queryParams = [];

  if (targetArticleIds.length > 0) {
    query = `
      SELECT a.id
      FROM vbpl_articles_data a
      WHERE a.content IS NOT NULL AND a.id = ANY($1::int[])
      ORDER BY a.id ASC
    `;
    queryParams = [targetArticleIds];
  } else if (targetDocumentIds.length > 0) {
    query = `
      SELECT a.id
      FROM vbpl_articles_data a
      WHERE a.content IS NOT NULL
        AND TRIM(a.documentid) = ANY($1::text[])
      ORDER BY a.id ASC
    `;
    queryParams = [targetDocumentIds];
  } else {
    query = `
      SELECT a.id
      FROM vbpl_articles_data a
      WHERE a.content IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "DocumentChunks" c WHERE c."chunkIndex" = a.id
        )
      ORDER BY a.id DESC
      ${recentLimit ? 'LIMIT $1' : ''}
    `;
    queryParams = recentLimit ? [recentLimit] : [];
  }

  const artRes = await pool.query(query, queryParams);
  const artsToProcess = artRes.rows.map(r => r.id).sort((a, b) => a - b);

  const totalCountRes = await pool.query('SELECT COUNT(*) FROM vbpl_articles_data WHERE content IS NOT NULL');
  const totalArticles = Number(totalCountRes.rows[0].count);
  const existingRes = await pool.query('SELECT COUNT(DISTINCT "chunkIndex") FROM "DocumentChunks"');
  const embeddedCount = Number(existingRes.rows[0].count);

  console.log(`=> Tổng số Điều luật trong DB: ${totalArticles} | Đã nhúng: ${embeddedCount} | Cần nhúng: ${artsToProcess.length}`);
  if (targetDocumentIds.length > 0) {
    console.log(`=> Phạm vi: ${targetDocumentIds.length} văn bản targeted (không giới hạn 1000 điều)\n`);
  } else if (recentLimit) {
    console.log(`=> ⚠️ RESUME giới hạn ${recentLimit} điều/lần — không dùng cho crawler\n`);
  } else {
    console.log('');
  }

  if (documentIdsFile && targetDocumentIds.length > 0 && artsToProcess.length === 0) {
    console.log('✅ Tất cả điều của các văn bản targeted đã có embedding.');
    await pool.end();
    return;
  }

  const col = 'embedding';
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
      const built = buildChunksForArticle(art);
      for (const c of built) {
        validChunks.push({
          chunkIndex: c.chunkIndex,
          chunkNo: c.chunkNo,
          chunkType: c.chunkType,
          parentArticleId: c.parentArticleId,
          structuralLabel: c.structuralLabel,
          documentId: c.documentId,
          textToEmbed: c.textToEmbed,
          exactContent: c.exactContent,
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
        `INSERT INTO "DocumentChunks"
          ("chunkId", "documentId", "contentChunk", "chunkIndex", "chunkNo", "chunkType", "parentArticleId", "structuralLabel", "${col}")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          uuidv4(),
          validChunks[c].documentId,
          validChunks[c].exactContent,
          validChunks[c].chunkIndex,
          validChunks[c].chunkNo,
          validChunks[c].chunkType,
          validChunks[c].parentArticleId,
          validChunks[c].structuralLabel || null,
          vectorSql,
        ]
      );
    }
    progressLog('Đang nhúng Điều Luật', Math.min(i + BATCH_SIZE, artsToProcess.length), artsToProcess.length);
  }

  console.log('\n✅ Hoàn thành toàn bộ!');
  await pool.end();
}

run().catch(async (e) => {
  console.error('Error during execution:', e);
  try {
    await pool.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
