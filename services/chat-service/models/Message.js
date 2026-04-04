const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Message {
  static async create(conversationId, content, senderType, metadata = null) {
    const messageId = uuidv4();
    await pool.query(
      'INSERT INTO messages ("messageId", "conversationId", content, "senderType", metadata) VALUES ($1, $2, $3, $4, $5)',
      [messageId, conversationId, content, senderType, metadata && typeof metadata === 'object' ? metadata : null]
    );
    return { messageId, conversationId, content, senderType, metadata: metadata || null };
  }

  static async getByConversationId(conversationId) {
    const result = await pool.query(
      'SELECT "messageId", "conversationId", content, "senderType", "createdAt", metadata FROM messages WHERE "conversationId" = $1 ORDER BY "createdAt" ASC',
      [conversationId]
    );
    return result.rows;
  }
}

module.exports = Message;
