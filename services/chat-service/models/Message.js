const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Message {
  static async create(conversationId, content, senderType) {
    const messageId = uuidv4();
    await pool.query(
      'INSERT INTO messages ("messageId", "conversationId", content, "senderType") VALUES ($1, $2, $3, $4)',
      [messageId, conversationId, content, senderType]
    );
    return { messageId, conversationId, content, senderType };
  }

  static async getByConversationId(conversationId) {
    const result = await pool.query(
      'SELECT "messageId", "conversationId", content, "senderType", "createdAt" FROM messages WHERE "conversationId" = $1 ORDER BY "createdAt" ASC',
      [conversationId]
    );
    return result.rows;
  }
}

module.exports = Message;
