const pool = require('./database');

const initDatabase = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        "conversationId" CHAR(36) PRIMARY KEY,
        "userId" CHAR(36) NOT NULL,
        title VARCHAR(500) NOT NULL DEFAULT 'Cuộc hội thoại mới',
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations("userId")`);

    try {
      await pool.query(`
        ALTER TABLE conversations 
        ADD CONSTRAINT fk_conversations_user 
        FOREIGN KEY ("userId") REFERENCES users("userId") ON DELETE CASCADE
      `);
    } catch (e) {
      if (e.code !== '42710') console.warn('[Chat] FK conversations->users:', e.message);
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        "messageId" CHAR(36) PRIMARY KEY,
        "conversationId" CHAR(36) NOT NULL,
        content TEXT NOT NULL,
        "senderType" VARCHAR(20) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages("conversationId")`);

    try {
      await pool.query(`
        ALTER TABLE messages 
        ADD CONSTRAINT fk_messages_conversation 
        FOREIGN KEY ("conversationId") REFERENCES conversations("conversationId") ON DELETE CASCADE
      `);
    } catch (e) {
      if (e.code !== '42710') console.warn('[Chat] FK messages->conversations:', e.message);
    }
  } catch (error) {
    throw error;
  }
};

module.exports = initDatabase;
