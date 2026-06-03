/**
 * Re-chunk + re-embed: cleaned articles + long pure-text PR-CH targets.
 * Usage:
 *   node scripts/refresh-pr-ch-embeddings.js --stats-only
 *   node scripts/refresh-pr-ch-embeddings.js --apply [--limit N]
 */
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const pgvector = require('pgvector/pg');
const fs = require('fs');
const path = require('path');
const { getPoolConfig } = require('../lib/dbConfig');
const { buildChunksForArticle, PRCH_MIN_WORDS } = require('../lib/chunkStrategy');
const { hasAttachmentSignals } = require('../lib/attachmentDetect');
const { wordCount } = require('../lib/structuralSplit');
const { migrateRagSchema } = require('../lib/migrateRagSchema');
const { getEmbeddingBatch } = require('../lib/embedding');

const pool = new Pool(getPoolConfig());
const REPORT_DIR = path.join(__dirname, '..', 'reports');
const CLEANED_FILE = path.join(__dirname, '..', '.rag-cleaned-article-ids.json');
const EMBED_BATCH = Number(process.env.EMBED_TEXT_BATCH || 80);

async function collectTargetIds(limit = 0) {
  const ids = new Set();

  if (fs.existsSync(CLEANED_FILE)) {
    for (const id of JSON.parse(fs.readFileSync(CLEANED_FILE, 'utf8'))) {
      ids.add(Number(id));
    }
  }

  let lastId = 0;
  while (true) {
    const res = await pool.query(
      `SELECT id, content FROM vbpl_articles_data
       WHERE content IS NOT NULL AND TRIM(content) <> ''
         AND array_length(regexp_split_to_array(content, '\\s+'), 1) >= $1
         AND id > $2
       ORDER BY id ASC
       LIMIT 500`,
      [PRCH_MIN_WORDS, lastId]
    );
    if (!res.rows.length) break;
    for (const row of res.rows) {
      if (!hasAttachmentSignals(row.content)) ids.add(row.id);
    }
    lastId = res.rows[res.rows.length - 1].id;
    if (limit > 0 && ids.size >= limit) break;
  }

  const list = [...ids].sort((a, b) => a - b);
  return limit > 0 ? list.slice(0, limit) : list;
}

async function applyForArticleIds(articleIds, stats) {
  const col = 'embedding';

  for (let i = 0; i < articleIds.length; i += 50) {
    const batchIds = articleIds.slice(i, i + 50);
    const rows = (
      await pool.query(
        `SELECT id, documentid, title, content FROM vbpl_articles_data WHERE id = ANY($1::int[])`,
        [batchIds]
      )
    ).rows;

    const planned = [];
    for (const art of rows) {
      const chunks = buildChunksForArticle(art);
      for (const c of chunks) {
        planned.push(c);
        stats.byType[c.chunkType] = (stats.byType[c.chunkType] || 0) + 1;
      }
      if (chunks[0]?.chunkType === 'article_child') stats.prchArticles += 1;
      stats.articlesProcessed += 1;
      stats.chunksCreated += chunks.length;
    }

    await pool.query(`DELETE FROM "DocumentChunks" WHERE "chunkIndex" = ANY($1::int[])`, [batchIds]);

    for (let j = 0; j < planned.length; j += EMBED_BATCH) {
      const slice = planned.slice(j, j + EMBED_BATCH);
      const texts = slice.map((c) => c.textToEmbed);
      const embeddings = await getEmbeddingBatch(texts);
      for (let k = 0; k < slice.length; k++) {
        if (!embeddings[k]) continue;
        const c = slice[k];
        const vectorSql = pgvector.toSql(embeddings[k]);
        await pool.query(
          `INSERT INTO "DocumentChunks"
            ("chunkId", "documentId", "contentChunk", "chunkIndex", "chunkNo", "chunkType", "parentArticleId", "structuralLabel", "${col}")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            uuidv4(),
            c.documentId,
            c.exactContent,
            c.chunkIndex,
            c.chunkNo,
            c.chunkType,
            c.parentArticleId,
            c.structuralLabel || null,
            vectorSql,
          ]
        );
        stats.chunksEmbedded += 1;
      }
    }

    process.stdout.write(
      `\rArticles ${Math.min(i + 50, articleIds.length)}/${articleIds.length} | chunks embedded=${stats.chunksEmbedded}`
    );
  }
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  const statsOnly = args.includes('--stats-only');
  const apply = args.includes('--apply');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 0;

  await migrateRagSchema(pool);
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  console.log('Collecting target article IDs (cleaned + long pure text)...');
  const targetIds = await collectTargetIds(limit);
  console.log(`Targets: ${targetIds.length} articles`);

  const stats = {
    targetArticleCount: targetIds.length,
    articlesProcessed: 0,
    prchArticles: 0,
    chunksCreated: 0,
    chunksEmbedded: 0,
    byType: {},
  };

  if (!statsOnly && apply) {
    console.log('Applying re-chunk + re-embed...');
    await applyForArticleIds(targetIds, stats);
  } else {
    for (let i = 0; i < targetIds.length; i += 100) {
      const batch = targetIds.slice(i, i + 100);
      const rows = (
        await pool.query(`SELECT id, documentid, title, content FROM vbpl_articles_data WHERE id = ANY($1::int[])`, [
          batch,
        ])
      ).rows;
      for (const art of rows) {
        const chunks = buildChunksForArticle(art);
        stats.articlesProcessed += 1;
        stats.chunksCreated += chunks.length;
        if (chunks[0]?.chunkType === 'article_child') stats.prchArticles += 1;
        for (const c of chunks) {
          stats.byType[c.chunkType] = (stats.byType[c.chunkType] || 0) + 1;
        }
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: statsOnly ? 'stats-only' : apply ? 'apply' : 'plan',
    ...stats,
  };
  const outPath = path.join(REPORT_DIR, apply ? 'pr-ch-refresh-apply.json' : 'pr-ch-refresh-plan.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  console.log('Saved:', outPath);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
