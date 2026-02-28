const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Conversation {
  static async create(userId, title) {
    const conversationId = uuidv4();
    await pool.query(
      'INSERT INTO conversations ("conversationId", "userId", title) VALUES ($1, $2, $3)',
      [conversationId, userId, title || 'Cuộc hội thoại mới']
    );
    return { conversationId, userId, title: title || 'Cuộc hội thoại mới' };
  }

  static async findByUserId(userId) {
    const result = await pool.query(
      'SELECT "conversationId", "userId", title, "createdAt", "updatedAt" FROM conversations WHERE "userId" = $1 ORDER BY "updatedAt" DESC',
      [userId]
    );
    return result.rows;
  }

  static async findById(conversationId, userId) {
    const result = await pool.query(
      'SELECT "conversationId", "userId", title, "createdAt", "updatedAt" FROM conversations WHERE "conversationId" = $1 AND "userId" = $2',
      [conversationId, userId]
    );
    return result.rows[0];
  }

  static async rename(conversationId, userId, title) {
    const result = await pool.query(
      'UPDATE conversations SET title = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "conversationId" = $2 AND "userId" = $3 RETURNING "conversationId", title, "updatedAt"',
      [title, conversationId, userId]
    );
    return result.rows[0];
  }

  static async delete(conversationId, userId) {
    await pool.query('DELETE FROM conversations WHERE "conversationId" = $1 AND "userId" = $2', [conversationId, userId]);
  }

  static async touch(conversationId) {
    await pool.query('UPDATE conversations SET "updatedAt" = CURRENT_TIMESTAMP WHERE "conversationId" = $1', [conversationId]);
  }
}

module.exports = Conversation;
