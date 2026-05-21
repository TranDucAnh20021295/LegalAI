const pool = require('../config/database');

const TABLE = process.env.LEGAL_DOCUMENTS_TABLE || 'LegalDocuments';

class LegalDocument {

  static _mapRow(row) {
    if (!row) return null;
    const rawId = row.documentId || row.id || '';
    return {
      documentId:       String(rawId).trim(),
      title:            row.title || '',
      documentNumber:   row.documentNumber || '',
      documentType:     row.documentType || '',
      status:           row.status || '—',
      issueDate:        row.issueDate || '—',
      effectiveDate:    row.effectiveDate || '—',
      field:            row.field || '',
      content:          row.content || '',
      issuingAuthority: row.issuingAuthority || '',
      link:             '',  // không có trong LegalDocuments
    };
  }

  // Thử chuyển đổi chuỗi ngày DD/MM/YYYY sang Date để sort đúng
  static _getSortSql(col) {
    if (col === '1') return '1';
    // Thử cast sang text để check format. Nếu là DATE thật sự sẽ có dạng YYYY-MM-DD
    return `CASE 
      WHEN ${col}::text ~ '^\\d{4}-\\d{2}-\\d{2}' THEN ${col}::date 
      WHEN ${col}::text ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' THEN to_date(${col}::text, 'DD/MM/YYYY') 
      ELSE NULL END`;
  }

  static async searchByKeyword(keyword, limit = 50, searchIn = 'all', exact = false) {
    try {
      if (!keyword || typeof keyword !== 'string' || !keyword.trim()) {
        return this.findAll(limit);
      }
      
      const kw = keyword.trim();
      const pattern = exact ? kw : `%${kw}%`;

      let whereClause = '';
      if (searchIn === 'title') {
        whereClause = 'title ILIKE $1';
      } else if (searchIn === 'documentNumber' || searchIn === 'number') {
        whereClause = '"documentNumber" ILIKE $1';
      } else {
        // 'all' - tìm cả title lẫn documentNumber
        whereClause = 'title ILIKE $1 OR "documentNumber" ILIKE $1';
      }

      try {
        const query = `
          SELECT 
            "documentId", title, "documentNumber", "documentType",
            "issueDate", "effectiveDate", field, status, "issuingAuthority",
            LEFT(content, 300) AS content
          FROM "${TABLE}"
          WHERE ${whereClause}
          ORDER BY 
            CASE 
              WHEN "documentNumber" ILIKE $1 THEN 0
              WHEN title ILIKE $1 THEN 1
              ELSE 2
            END,
            "issueDate" DESC NULLS LAST
          LIMIT $2
        `;
        const result = await pool.query(query, [pattern, limit]);
        return result.rows.map(row => this._mapRow(row));
      } catch (e) {
        console.error('[Document Model] searchByKeyword query error:', e.message);
        return [];
      }
    } catch (err) {
      console.error('[Document Model] searchByKeyword error:', err.message);
      return [];
    }
  }

  static async viewDetail(documentId) {
    try {
      const id = String(documentId || '').trim();
      const query = `SELECT * FROM "${TABLE}" WHERE TRIM("documentId") = $1 OR id::text = $1 LIMIT 1`;
      const result = await pool.query(query, [id]);
      return this._mapRow(result.rows[0]);
    } catch (e) {
      console.error('[Document Model] viewDetail error:', e.message);
      return null;
    }
  }

  static async existsByNumber(documentNumber) {
    try {
      const query = `SELECT 1 FROM "${TABLE}" WHERE "documentNumber" = $1 LIMIT 1`;
      const result = await pool.query(query, [documentNumber]);
      return result.rows.length > 0;
    } catch (e) {
      return false;
    }
  }

  static async findAll(limit = 50) {
    try {
      const result = await pool.query(
        `SELECT "documentId", title, "documentNumber", "documentType",
                "issueDate", "effectiveDate", field, status, "issuingAuthority",
                LEFT(content, 300) AS content
         FROM "${TABLE}"
         ORDER BY "issueDate" DESC NULLS LAST
         LIMIT $1`,
        [limit]
      );
      return result.rows.map(row => this._mapRow(row));
    } catch (err) {
      console.error('[Document Model] findAll error:', err.message);
      return [];
    }
  }

  static async filterByField(field, limit = 50) {
    if (!field || field === 'all') return this.findAll(limit);
    try {
      const result = await pool.query(
        `SELECT "documentId", title, "documentNumber", "documentType",
                "issueDate", "effectiveDate", field, status, "issuingAuthority",
                LEFT(content, 300) AS content
         FROM "${TABLE}"
         WHERE field ILIKE $1
         ORDER BY "issueDate" DESC NULLS LAST
         LIMIT $2`,
        [`%${field}%`, limit]
      );
      if (result.rows.length > 0) {
        return result.rows.map(row => this._mapRow(row));
      }
    } catch (err) {
      console.error('[Document Model] filterByField error:', err.message);
    }
    return this.findAll(limit);
  }

  static async searchSemantic(queryEmbedding, limit = 24, useLocal = false) {
    if (!queryEmbedding || !Array.isArray(queryEmbedding)) return [];
    const pgvector = require('pgvector/pg');
    const col = useLocal ? 'embedding_768' : 'embedding';
    const chunkTable = 'DocumentChunks';

    const query = `
      WITH best_chunks AS (
        SELECT 
          "documentId", 
          MAX(1 - ("${col}" <=> $1::vector)) as max_similarity
        FROM "${chunkTable}"
        WHERE "${col}" IS NOT NULL
        GROUP BY "documentId"
        HAVING MAX(1 - ("${col}" <=> $1::vector)) > 0.4
        ORDER BY max_similarity DESC
        LIMIT $2
      )
      SELECT 
        ld.*,
        bc.max_similarity as similarity
      FROM "${TABLE}" ld
      JOIN best_chunks bc ON ld."documentId" = bc."documentId"
      ORDER BY bc.max_similarity DESC
    `;
    try {
      const result = await pool.query(query, [pgvector.toSql(queryEmbedding), limit]);
      return result.rows.map(row => this._mapRow(row));
    } catch (err) {
      console.error('[Document Model] searchSemantic error:', err.message);
      return [];
    }
  }
}

module.exports = LegalDocument;
