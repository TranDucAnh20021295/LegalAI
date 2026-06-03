/**
 * RAG cleanup schema: attachments table + DocumentChunks metadata.
 */
async function migrateRagSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vbpl_article_attachments (
      id SERIAL PRIMARY KEY,
      article_id INT NOT NULL,
      documentid VARCHAR(255),
      documentnumber VARCHAR(255),
      article_title VARCHAR(500),
      attachment_type VARCHAR(50) NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      marker VARCHAR(255),
      word_count INT DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (article_id, attachment_type, marker)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_vbpl_attachments_article_id
    ON vbpl_article_attachments(article_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_vbpl_attachments_documentid
    ON vbpl_article_attachments(documentid)
  `);

  const chunkCols = [
    { name: 'chunkNo', sql: 'INT NOT NULL DEFAULT 0' },
    { name: 'chunkType', sql: "VARCHAR(32) NOT NULL DEFAULT 'article_full'" },
    { name: 'parentArticleId', sql: 'INT' },
    { name: 'structuralLabel', sql: 'VARCHAR(64)' },
  ];
  for (const col of chunkCols) {
    try {
      await pool.query(`ALTER TABLE "DocumentChunks" ADD COLUMN "${col.name}" ${col.sql}`);
    } catch (e) {
      if (e.code !== '42701') throw e;
    }
  }

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_document_chunks_parent_article
    ON "DocumentChunks"("parentArticleId", "chunkNo")
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_document_chunks_type
    ON "DocumentChunks"("chunkType")
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_document_chunks_chunk_index
    ON "DocumentChunks"("chunkIndex")
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vbpl_rag_processing_stats (
      id SERIAL PRIMARY KEY,
      run_id VARCHAR(64) NOT NULL,
      phase VARCHAR(64) NOT NULL,
      metric_key VARCHAR(128) NOT NULL,
      metric_value BIGINT NOT NULL DEFAULT 0,
      details JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

module.exports = { migrateRagSchema };
