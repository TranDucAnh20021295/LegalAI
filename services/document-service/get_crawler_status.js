const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const DB_CONFIG = {
  host: 'localhost',
  port: 5433,
  database: 'legal_ai',
  user: 'postgres',
  password: '123456'
};

const JWT_SECRET = 'your-secret-key-change-this-in-production-please-use-strong-random-string';

async function getStatus() {
  const pool = new Pool(DB_CONFIG);
  let tokenId = uuidv4();
  let tokenValue = '';
  let adminUserId = '';

  try {
    // 1. Tìm user ADMIN
    const adminUserRes = await pool.query("SELECT \"userId\" FROM users WHERE role = 'ADMIN' LIMIT 1");
    if (adminUserRes.rows.length === 0) {
      console.log('Không tìm thấy user ADMIN nào trong DB.');
      await pool.end();
      return;
    }
    adminUserId = adminUserRes.rows[0].userId;
    console.log(`Tìm thấy admin userId: ${adminUserId}`);

    // 2. Tạo JWT token
    tokenValue = jwt.sign(
      { userId: adminUserId, tokenId },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // 3. Chèn vào bảng authentication_tokens
    const expiredAt = new Date(Date.now() + 3600 * 1000);
    await pool.query(
      `INSERT INTO authentication_tokens ("tokenId", "tokenValue", "userId", "expiredAt")
       VALUES ($1, $2, $3, $4)`,
      [tokenId, tokenValue, adminUserId, expiredAt]
    );
    console.log('Đã tạo và chèn admin token tạm thời.');

    // 4. Gửi request lấy trạng thái crawler
    console.log('Đang gửi request lấy trạng thái crawler...');
    const response = await axios.get('http://localhost:5003/admin/crawler/status', {
      headers: { Authorization: `Bearer ${tokenValue}` }
    });

    console.log('\n=== KẾT QUẢ TRẠNG THÁI CRAWLER ===');
    console.log(`Đang chạy (isRunning): ${response.data.isRunning}`);
    console.log(`Task hiện tại (currentTask): ${response.data.currentTask}`);
    console.log('\n--- CRAWLER LOGS ---');
    if (response.data.logs && response.data.logs.length > 0) {
      response.data.logs.forEach(log => console.log(log));
    } else {
      console.log('(Không có log nào)');
    }
    console.log('===================================\n');

  } catch (error) {
    console.error('Đã xảy ra lỗi:', error.message);
    if (error.response) {
      console.error('Chi tiết lỗi API:', error.response.data);
    }
  } finally {
    // 5. Cleanup token
    if (tokenValue) {
      try {
        await pool.query('DELETE FROM authentication_tokens WHERE "tokenId" = $1', [tokenId]);
        console.log('Đã dọn dẹp admin token tạm thời.');
      } catch (err) {
        console.error('Lỗi khi dọn dẹp token:', err.message);
      }
    }
    await pool.end();
  }
}

getStatus().catch(console.error);
