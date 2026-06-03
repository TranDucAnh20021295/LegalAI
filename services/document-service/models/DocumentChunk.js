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

  static async findByDocumentId(documentId, limit = 1000) {
    const cleanId = String(documentId).trim();
    const result = await pool.query(
      `SELECT "chunkId", "documentId", "contentChunk", "chunkIndex" FROM "${TABLE}" WHERE TRIM("documentId") = $1 ORDER BY "chunkIndex" ASC LIMIT $2`,
      [cleanId, limit]
    );
    return result.rows;
  }


  static async updateEmbedding(chunkId, embedding) {
    if (!embedding || !Array.isArray(embedding)) return;
    const vectorSql = pgvector.toSql(embedding);
    await pool.query(
      `UPDATE "${TABLE}" SET embedding = $1 WHERE "chunkId" = $2`,
      [vectorSql, chunkId]
    );
  }

  static async searchSimilar(queryEmbedding, limit = 10) {
    if (!queryEmbedding || !Array.isArray(queryEmbedding)) return [];
    const vectorSql = pgvector.toSql(queryEmbedding);
    const result = await pool.query(
      `SELECT "chunkId", "documentId", "contentChunk", "chunkIndex", 1 - (embedding <=> $1::vector) AS similarity
       FROM "${TABLE}" WHERE embedding IS NOT NULL ORDER BY embedding <=> $1::vector LIMIT $2`,
      [vectorSql, limit]
    );
    return result.rows;
  }

  /** Semantic search + metadata văn bản (cho UI tra cứu AI). */
  static async searchSimilarWithDocuments(queryEmbedding, limit = 20, documentId = null, field = null, queryText = null) {
    if (!queryEmbedding || !Array.isArray(queryEmbedding)) return [];
    const vectorSql = pgvector.toSql(queryEmbedding);
    const { queryWantsAttachments } = require('../lib/chunkStrategy');
    const includeAttachments = queryWantsAttachments(queryText);

    let query = `SELECT dc."chunkId", dc."documentId", dc."contentChunk", dc."chunkIndex",
              dc."chunkNo", dc."chunkType", dc."parentArticleId", dc."structuralLabel",
              1 - (dc.embedding <=> $1::vector) AS similarity,
              ld.title, ld."documentNumber", ld."documentType", ld.field,
              ld.status, ld."effectiveDate"
       FROM "${TABLE}" dc
       INNER JOIN "${LEGAL_TABLE}" ld ON TRIM(ld."documentId") = TRIM(dc."documentId")
       WHERE dc.embedding IS NOT NULL`;

    if (!includeAttachments) {
      query += ` AND (dc."chunkType" IS NULL OR dc."chunkType" IN ('article_full', 'article_child'))`;
    }
    
    const params = [vectorSql];
    let paramIndex = 2;

    if (documentId) {
      const cleanDocId = String(documentId).trim();
      query += ` AND TRIM(dc."documentId") = $${paramIndex}`;
      params.push(cleanDocId);
      paramIndex++;
    }
    
    if (field && field !== 'ALL' && field.trim() !== '') {
      query += ` AND ld.field ILIKE $${paramIndex}`;
      params.push(`%${field.trim()}%`);
      paramIndex++;
    }

    query += ` ORDER BY dc.embedding <=> $1::vector LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return result.rows;
  }


  static async deleteByDocumentId(documentId) {
    const cleanId = String(documentId).trim();
    await pool.query(`DELETE FROM "${TABLE}" WHERE TRIM("documentId") = $1`, [cleanId]);
  }
}

module.exports = DocumentChunk;
