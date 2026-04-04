const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const AuthenticationToken = require('./AuthenticationToken');

class User {
  static async register(userData) {
    return this.create(userData);
  }

  static async login(email, password) {
    const user = await this.findByEmail(email);
    if (!user) return null;
    const valid = await this.verifyPassword(password, user.passwordHash);
    return valid ? user : null;
  }

  static async logout(tokenValue) {
    await AuthenticationToken.revokeToken(tokenValue);
  }

  static async updateProfile(userId, updateData) {
    return this.update(userId, updateData);
  }

  static async create(userData) {
    const { fullName, email, password, loginProvider = 'LOCAL', role = 'USER', isActive = true } = userData;
    const userId = uuidv4();
    let passwordHash = null;

    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    const query = `
      INSERT INTO users ("userId", "fullName", email, "passwordHash", "loginProvider", role, "isActive")
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, "userId", "fullName", email, "loginProvider", role, "isActive", "createdAt", "updatedAt"
    `;

    const values = [userId, fullName, email, passwordHash, loginProvider, role, isActive];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async findByEmail(email) {
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await pool.query(query, [email]);
    return result.rows[0];
  }

  static async findById(userId) {
    const query = 'SELECT * FROM users WHERE "userId" = $1';
    const result = await pool.query(query, [userId]);
    return result.rows[0];
  }

  static async update(userId, updateData) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (updateData.fullName !== undefined) {
      fields.push(`"fullName" = $${paramCount++}`);
      values.push(updateData.fullName);
    }
    if (updateData.email !== undefined) {
      fields.push(`email = $${paramCount++}`);
      values.push(updateData.email);
    }
    if (updateData.password) {
      const passwordHash = await bcrypt.hash(updateData.password, 10);
      fields.push(`"passwordHash" = $${paramCount++}`);
      values.push(passwordHash);
    }

    fields.push(`"updatedAt" = CURRENT_TIMESTAMP`);
    values.push(userId);

    const query = `
      UPDATE users 
      SET ${fields.join(', ')}
      WHERE "userId" = $${paramCount}
      RETURNING id, "userId", "fullName", email, "loginProvider", role, "isActive", "createdAt", "updatedAt"
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async findAll() {
    const query =
      'SELECT "userId", "fullName", email, "loginProvider", role, "isActive", "createdAt", "updatedAt" FROM users ORDER BY "createdAt" DESC';
    const result = await pool.query(query);
    return result.rows;
  }

  static async setActive(userId, active) {
    const query = `
      UPDATE users
      SET "isActive" = $1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = $2
      RETURNING "userId", "fullName", email, "loginProvider", role, "isActive", "createdAt", "updatedAt"
    `;
    const result = await pool.query(query, [!!active, userId]);
    return result.rows[0] || null;
  }

  static async verifyPassword(password, passwordHash) {
    if (!passwordHash) return false;
    return await bcrypt.compare(password, passwordHash);
  }

  static async findByResetToken(token) {
    const query = `
      SELECT * FROM users 
      WHERE "passwordResetToken" = $1 AND "passwordResetExpires" > CURRENT_TIMESTAMP
    `;
    const result = await pool.query(query, [token]);
    return result.rows[0];
  }

  static async setResetToken(email, token, expiresAt) {
    const query = `
      UPDATE users 
      SET "passwordResetToken" = $1, "passwordResetExpires" = $2, "updatedAt" = CURRENT_TIMESTAMP
      WHERE email = $3
    `;
    await pool.query(query, [token, expiresAt, email]);
  }

  static async resetPassword(userId, newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const query = `
      UPDATE users 
      SET "passwordHash" = $1, "passwordResetToken" = NULL, "passwordResetExpires" = NULL, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = $2
    `;
    await pool.query(query, [passwordHash, userId]);
  }
}

module.exports = User;
