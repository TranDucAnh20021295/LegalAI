const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const pgvector = require('pgvector/pg');

const TABLE = 'DocumentChunks';
const LEGAL_TABLE = process.env.LEGAL_DOCUMENTS_TABLE || 'LegalDocuments';

class DocumentChunk {
  static async create(documentId, contentChunk, chunkIndex) {
    const chunkId = uuidv4();
    await pool.query(
      `INSERT INTO "${TABLE}" ("chunkId", "documentId", "contentChunk", "chunkIndex") VALUES ($1, $2, $3, $4)`,
      [chunkId, documentId, contentChunk, chunkIndex]
    );
    return { chunkId, documentId, contentChunk, chunkIndex };
  }

  static async findByDocumentId(documentId) {
    const result = await pool.query(
      `SELECT "chunkId", "documentId", "contentChunk", "chunkIndex" FROM "${TABLE}" WHERE "documentId" = $1 ORDER BY "chunkIndex" ASC`,
      [documentId]
    );
    return result.rows;
  }

  static async updateEmbedding(chunkId, embedding, useLocal = false) {
    if (!embedding || !Array.isArray(embedding)) return;
    const vectorSql = pgvector.toSql(embedding);
    const col = useLocal ? 'embedding_768' : 'embedding';
    await pool.query(
      `UPDATE "${TABLE}" SET "${col}" = $1 WHERE "chunkId" = $2`,
      [vectorSql, chunkId]
    );
  }

  static async searchSimilar(queryEmbedding, limit = 10, useLocal = false) {
    if (!queryEmbedding || !Array.isArray(queryEmbedding)) return [];
    const vectorSql = pgvector.toSql(queryEmbedding);
    const col = useLocal ? 'embedding_768' : 'embedding';
    const result = await pool.query(
      `SELECT "chunkId", "documentId", "contentChunk", "chunkIndex", 1 - ("${col}" <=> $1::vector) AS similarity
       FROM "${TABLE}" WHERE "${col}" IS NOT NULL ORDER BY "${col}" <=> $1::vector LIMIT $2`,
      [vectorSql, limit]
    );
    return result.rows;
  }

  /** Semantic search + metadata văn bản (cho UI tra cứu AI). */
  static async searchSimilarWithDocuments(queryEmbedding, limit = 20, useLocal = false) {
    if (!queryEmbedding || !Array.isArray(queryEmbedding)) return [];
    const vectorSql = pgvector.toSql(queryEmbedding);
    const col = useLocal ? 'embedding_768' : 'embedding';
    const result = await pool.query(
      `SELECT dc."chunkId", dc."documentId", dc."contentChunk", dc."chunkIndex",
              1 - (dc."${col}" <=> $1::vector) AS similarity,
              ld.title, ld."documentNumber", ld."documentType", ld.field
       FROM "${TABLE}" dc
       INNER JOIN "${LEGAL_TABLE}" ld ON ld."documentId" = dc."documentId"
       WHERE dc."${col}" IS NOT NULL
       ORDER BY dc."${col}" <=> $1::vector
       LIMIT $2`,
      [vectorSql, limit]
    );
    return result.rows;
  }

  static async deleteByDocumentId(documentId) {
    await pool.query(`DELETE FROM "${TABLE}" WHERE "documentId" = $1`, [documentId]);
  }
}

module.exports = DocumentChunk;
