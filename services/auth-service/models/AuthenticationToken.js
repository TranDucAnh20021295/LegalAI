const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');
const { getRedis } = require('../config/redis');

const SESSION_PREFIX = 'session:';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function parseExpiresIn(str) {
  const match = str.match(/^(\d+)(d|h|m|s)$/);
  if (!match) return 7 * 24 * 60 * 60;
  const n = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 'd') return n * 24 * 60 * 60;
  if (unit === 'h') return n * 60 * 60;
  if (unit === 'm') return n * 60;
  return n;
}

class AuthenticationToken {
  static async generateToken(userId) {
    const tokenId = uuidv4();
    const expiresInSeconds = parseExpiresIn(JWT_EXPIRES_IN);
    const expiredAt = new Date(Date.now() + expiresInSeconds * 1000);

    const tokenValue = jwt.sign(
      { userId, tokenId },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    await pool.query(
      `INSERT INTO authentication_tokens ("tokenId", "tokenValue", "userId", "expiredAt")
       VALUES ($1, $2, $3, $4)`,
      [tokenId, tokenValue, userId, expiredAt]
    );

    const redis = getRedis();
    const sessionKey = SESSION_PREFIX + tokenValue;
    const sessionData = JSON.stringify({
      tokenId,
      userId,
      expiredAt: expiredAt.toISOString(),
    });
    await redis.setex(sessionKey, expiresInSeconds, sessionData);

    return {
      tokenId,
      tokenValue,
      expiredAt,
    };
  }

  static async validateToken(tokenValue) {
    if (!tokenValue) return null;
    const redis = getRedis();
    const sessionKey = SESSION_PREFIX + tokenValue;
    let data = await redis.get(sessionKey);
    if (!data) {
      const row = await pool.query(
        `SELECT "tokenId", "userId", "expiredAt" FROM authentication_tokens
         WHERE "tokenValue" = $1 AND "expiredAt" > CURRENT_TIMESTAMP`,
        [tokenValue]
      ).then((r) => r.rows[0]);
      if (!row) return null;
      const expiresInSeconds = Math.max(1, Math.floor((new Date(row.expiredAt) - Date.now()) / 1000));
      data = JSON.stringify({
        tokenId: row.tokenId,
        userId: row.userId,
        expiredAt: row.expiredAt,
      });
      await redis.setex(sessionKey, expiresInSeconds, data);
    }
    let session;
    try {
      session = JSON.parse(data);
    } catch {
      await redis.del(sessionKey);
      return null;
    }
    if (new Date(session.expiredAt) <= new Date()) {
      await redis.del(sessionKey);
      return null;
    }
    try {
      jwt.verify(tokenValue, JWT_SECRET);
    } catch {
      await redis.del(sessionKey);
      return null;
    }
    return { userId: session.userId, tokenId: session.tokenId };
  }

  static async revokeToken(tokenValue) {
    if (!tokenValue) return;
    const redis = getRedis();
    await redis.del(SESSION_PREFIX + tokenValue);
    await pool.query(`DELETE FROM authentication_tokens WHERE "tokenValue" = $1`, [tokenValue]);
  }
}

module.exports = AuthenticationToken;
