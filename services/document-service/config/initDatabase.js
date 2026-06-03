const pool = require('./database');
const { migrateRagSchema } = require('../lib/migrateRagSchema');

const initDatabase = async () => {
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
  } catch (e) {
    console.warn('[Document] pgvector extension:', e.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "DocumentChunks" (
        "chunkId" CHAR(36) PRIMARY KEY,
        "documentId" VARCHAR(255) NOT NULL,
        "contentChunk" TEXT NOT NULL,
        "chunkIndex" INT NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON "DocumentChunks"("documentId")`);
  } catch (error) {
    console.error('[Document] Create table DocumentChunks failed:', error?.message || error);
    throw error;
  }

  try {
    await pool.query(`ALTER TABLE "DocumentChunks" ADD COLUMN embedding vector(1536)`);
  } catch (e) {
    if (e.code !== '42701') console.warn('[Document] embedding column:', e.message);
  }

  // --- HNSW Indexes for Vector Search Performance ---
  try {
    // Index cho OpenAI (1536 dimensions)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_hnsw_embedding ON "DocumentChunks" USING hnsw (embedding vector_cosine_ops)`);
  } catch (e) {
    console.warn('[Document] HNSW index (1536) failed:', e.message);
  }

  await migrateRagSchema(pool);
};

module.exports = initDatabase;
