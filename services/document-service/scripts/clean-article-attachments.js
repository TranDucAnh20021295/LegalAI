/**
 * Detect appendix/catalog/table blocks, save to vbpl_article_attachments, clean article content.
 * Usage:
 *   node scripts/clean-article-attachments.js --dry-run [--limit N]
 *   node scripts/clean-article-attachments.js --apply [--limit N] [--from-id N]
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { getPoolConfig } = require('../lib/dbConfig');
const { splitAttachments, hasAttachmentSignals, wordCount } = require('../lib/attachmentDetect');
const { migrateRagSchema } = require('../lib/migrateRagSchema');

const pool = new Pool(getPoolConfig());
const REPORT_DIR = path.join(__dirname, '..', 'reports');
const AFFECTED_IDS_FILE = path.join(__dirname, '..', '.rag-cleaned-article-ids.json');

const BATCH = Number(process.env.CLEAN_BATCH_SIZE || 500);
const FULL_SCAN = process.env.CLEAN_FULL_SCAN === '1';

/** SQL prefilter — giảm quét; bật CLEAN_FULL_SCAN=1 để quét 100% */
const CANDIDATE_WHERE = `(
  content ILIKE '%PHỤ LỤC%' OR content ILIKE '%DANH MỤC%'
  OR content ILIKE '%BIỂU THUẾ%' OR content ILIKE '%<table%'
  OR content ILIKE '%Mã hàng%' OR content ILIKE '%Mã HS%'
  OR content ILIKE '%Mô tả hàng%'
  OR content ILIKE '%Thuế suất%'
  OR content ~* 'Nơi\\s*nhận\\s*:'
)`;

async function processBatch(rows, apply, typeCounts, wordsRemoved) {
  let cleaned = 0;
  let skipped = 0;
  const affectedIds = [];

  for (const row of rows) {
    if (!hasAttachmentSignals(row.content)) {
      skipped += 1;
      continue;
    }
    const { cleaned: newContent, attachment } = splitAttachments(row.content);
    if (!attachment) {
      skipped += 1;
      continue;
    }

    const beforeWords = wordCount(row.content);
    const afterWords = wordCount(newContent);
    if (afterWords >= beforeWords) {
      skipped += 1;
      continue;
    }

    cleaned += 1;
    affectedIds.push(row.id);
    wordsRemoved.total += beforeWords - afterWords;
    typeCounts[attachment.attachment_type] = (typeCounts[attachment.attachment_type] || 0) + 1;

    if (!apply) continue;

    await pool.query(
      `INSERT INTO vbpl_article_attachments
        (article_id, documentid, documentnumber, article_title, attachment_type, title, content, marker, word_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (article_id, attachment_type, marker)
       DO UPDATE SET
         content = EXCLUDED.content,
         title = EXCLUDED.title,
         word_count = EXCLUDED.word_count,
         documentid = EXCLUDED.documentid,
         documentnumber = EXCLUDED.documentnumber,
         article_title = EXCLUDED.article_title`,
      [
        row.id,
        row.documentid,
        row.documentnumber,
        row.title,
        attachment.attachment_type,
        attachment.title,
        attachment.content,
        attachment.marker,
        attachment.word_count,
      ]
    );

    await pool.query(`UPDATE vbpl_articles_data SET content = $1 WHERE id = $2`, [newContent, row.id]);
  }

  return { cleaned, skipped, affectedIds };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const dryRun = args.includes('--dry-run') || !apply;
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 0;
  const fromIdIdx = args.indexOf('--from-id');
  const fromId = fromIdIdx >= 0 ? Number(args[fromIdIdx + 1]) : 0;

  await migrateRagSchema(pool);
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  console.log(dryRun ? 'DRY RUN' : 'APPLY — overwriting vbpl_articles_data.content');

  let lastId = fromId;
  let totalCleaned = 0;
  let totalSkipped = 0;
  let totalScanned = 0;
  const allAffected = [];
  const typeCounts = {};
  const wordsRemoved = { total: 0 };

  const candidateClause = FULL_SCAN ? 'TRUE' : CANDIDATE_WHERE;
  console.log(FULL_SCAN ? 'Scan mode: FULL (all articles)' : 'Scan mode: CANDIDATES (SQL prefilter)');

  while (true) {
    const batchSize = limit > 0 ? Math.min(BATCH, limit - totalScanned) : BATCH;
    if (limit > 0 && batchSize <= 0) break;

    const res = await pool.query(
      `SELECT id, documentid, documentnumber, title, content
       FROM vbpl_articles_data
       WHERE content IS NOT NULL AND TRIM(content) <> ''
         AND id > $1
         AND (${candidateClause})
       ORDER BY id ASC
       LIMIT $2`,
      [lastId, batchSize]
    );
    if (!res.rows.length) break;

    const stats = await processBatch(res.rows, !dryRun, typeCounts, wordsRemoved);
    totalCleaned += stats.cleaned;
    totalSkipped += stats.skipped;
    totalScanned += res.rows.length;
    allAffected.push(...stats.affectedIds);
    lastId = res.rows[res.rows.length - 1].id;

    process.stdout.write(
      `\rScanned=${totalScanned} up to id=${lastId} | cleaned=${totalCleaned} skipped=${totalSkipped}`
    );

    if (res.rows.length < batchSize) break;
    if (limit > 0 && totalScanned >= limit) break;
  }

  console.log('\nDone.');
  const summary = {
    mode: dryRun ? 'dry-run' : 'apply',
    fullScan: FULL_SCAN,
    totalScanned,
    totalCleaned,
    totalSkipped,
    wordsRemovedFromArticles: wordsRemoved.total,
    lastId,
    attachmentTypes: typeCounts,
    affectedCount: allAffected.length,
  };

  if (!dryRun && allAffected.length) {
    fs.writeFileSync(AFFECTED_IDS_FILE, JSON.stringify(allAffected, null, 2), 'utf8');
    console.log('Affected article IDs:', AFFECTED_IDS_FILE);
  }

  const outPath = path.join(REPORT_DIR, dryRun ? 'clean-dry-run.json' : 'clean-apply.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log('Summary:', JSON.stringify(summary, null, 2));

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
