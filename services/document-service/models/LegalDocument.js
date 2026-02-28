const pool = require('../config/database');

const TABLE = process.env.LEGAL_DOCUMENTS_TABLE || 'LegalDocuments';

class LegalDocument {
  static async searchByKeyword(keyword, limit = 50) {
    if (!keyword || typeof keyword !== 'string') return [];
    const q = `%${keyword.trim()}%`;
    const query = `
      SELECT "documentId", title, "documentNumber", "documentType", "issuingAuthority",
             "issueDate", "effectiveDate", status, field, LEFT(content, 200) AS "contentPreview"
      FROM "${TABLE}"
      WHERE title ILIKE $1
         OR "documentType" ILIKE $1
         OR field ILIKE $1
         OR "documentNumber" ILIKE $1
         OR content ILIKE $1
      ORDER BY
        CASE WHEN title ILIKE $1 THEN 0
             WHEN "documentType" ILIKE $1 OR field ILIKE $1 THEN 1
             ELSE 2 END,
        "issueDate" DESC NULLS LAST
      LIMIT $2
    `;
    const result = await pool.query(query, [q, limit]);
    return result.rows;
  }

  static async viewDetail(documentId) {
    const query = `
      SELECT "documentId", title, "documentNumber", "documentType", "issuingAuthority",
             "issueDate", "effectiveDate", status, field, content
      FROM "${TABLE}"
      WHERE "documentId" = $1
    `;
    const result = await pool.query(query, [documentId]);
    return result.rows[0];
  }

  static async findAll(limit = 1000) {
    const query = `
      SELECT "documentId", title, "documentNumber", "documentType", "issuingAuthority",
             "issueDate", "effectiveDate", status, field
      FROM "${TABLE}"
      ORDER BY "issueDate" DESC NULLS LAST
      LIMIT $1
    `;
    const result = await pool.query(query, [limit]);
    return result.rows;
  }

  static async filterByField(field, limit = 50) {
    if (!field || typeof field !== 'string') return [];
    const q = `%${field.trim()}%`;
    const query = `
      SELECT "documentId", title, "documentNumber", "documentType", "issuingAuthority",
             "issueDate", "effectiveDate", status, field, LEFT(content, 200) AS "contentPreview"
      FROM "${TABLE}"
      WHERE field ILIKE $1
      ORDER BY "issueDate" DESC NULLS LAST
      LIMIT $2
    `;
    const result = await pool.query(query, [q, limit]);
    return result.rows;
  }
}

module.exports = LegalDocument;
