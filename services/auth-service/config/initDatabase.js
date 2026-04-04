const pool = require('./database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const initDatabase = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        "userId" CHAR(36) UNIQUE NOT NULL,
        "fullName" VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        "passwordHash" VARCHAR(255),
        "loginProvider" VARCHAR(20) NOT NULL DEFAULT 'LOCAL',
        role VARCHAR(20) NOT NULL DEFAULT 'USER',
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_userId ON users("userId")`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS authentication_tokens (
        "tokenId" CHAR(36) PRIMARY KEY,
        "tokenValue" TEXT UNIQUE NOT NULL,
        "userId" CHAR(36) NOT NULL REFERENCES users("userId") ON DELETE CASCADE,
        "expiredAt" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_auth_tokens_userId ON authentication_tokens("userId")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_auth_tokens_expiredAt ON authentication_tokens("expiredAt")`);

    const alterQueries = [
      `ALTER TABLE users ADD COLUMN "passwordResetToken" VARCHAR(255)`,
      `ALTER TABLE users ADD COLUMN "passwordResetExpires" TIMESTAMP`,
      `ALTER TABLE users ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true`,
    ];
    for (const q of alterQueries) {
      try {
        await pool.query(q);
      } catch (e) {
        if (e.code !== '42701') throw e;
      }
    }
    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users("passwordResetToken")`);
    } catch (_) {}

    // Seed admin user (optional)
    // Tài khoản mặc định: email=admin123@gmail.com, password=ducanh@2002, role=ADMIN
    const adminEmail = process.env.ADMIN_EMAIL || 'admin123@gmail.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'ducanh@2002';
    const adminFullName = process.env.ADMIN_FULLNAME || 'Admin';
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    try {
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [adminEmail]).then((r) => r.rows[0]);
      if (!existing) {
        const userId = uuidv4();
        await pool.query(
          `INSERT INTO users ("userId","fullName",email,"passwordHash","loginProvider",role,"isActive")
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [userId, adminFullName, adminEmail, passwordHash, 'LOCAL', 'ADMIN', true]
        );
      } else {
        await pool.query(
          `UPDATE users SET role = 'ADMIN', "isActive" = true WHERE email = $1`,
          [adminEmail]
        );
      }
    } catch (e) {
      // ignore seed failures (e.g. column not ready yet)
      console.warn('[Auth] Seed admin:', e.message);
    }
  } catch (error) {
    throw error;
  }
};

module.exports = initDatabase;
