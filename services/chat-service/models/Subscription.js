const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Subscription {
  /** Chuẩn hóa userId (tránh lệch với CHAR(36) / khoảng trắng từ JSON). */
  static normalizeUserId(id) {
    if (id == null || id === '') return '';
    return String(id).trim();
  }

  static async findActiveByUserId(userId) {
    const uid = Subscription.normalizeUserId(userId);
    if (!uid) return null;
    const result = await pool.query(
      `SELECT "subscriptionId", "userId", plan, "startsAt", "endsAt", "createdAt"
       FROM chat_subscriptions
       WHERE TRIM(BOTH FROM "userId"::text) = $1
         AND "endsAt" > CURRENT_TIMESTAMP
       ORDER BY "endsAt" DESC
       LIMIT 1`,
      [uid]
    );
    return result.rows[0] || null;
  }

  static async createOrReplace(userId, plan) {
    const uid = Subscription.normalizeUserId(userId);
    if (!uid) throw new Error('Invalid userId');

    if (plan !== 'month') throw new Error('Invalid plan');
    const planMonths = 1;
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime());
    endsAt.setMonth(endsAt.getMonth() + planMonths);

    const subscriptionId = uuidv4();

    await pool.query(
      `INSERT INTO chat_subscriptions ("subscriptionId", "userId", plan, "startsAt", "endsAt")
       VALUES ($1, $2, $3, $4, $5)`,
      [subscriptionId, uid, plan, startsAt, endsAt]
    );

    return {
      subscriptionId,
      userId: uid,
      plan,
      startsAt,
      endsAt,
    };
  }
}

module.exports = Subscription;
