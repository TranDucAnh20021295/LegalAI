const { createClient } = require('redis');

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.error('[Redis] Lỗi kết nối:', err));
redisClient.on('connect', () => console.log('[Redis] Đã kết nối thành công'));

// Khởi tạo kết nối ngay khi module được load
(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.error('[Redis] Không thể khởi tạo kết nối:', err);
  }
})();

module.exports = redisClient;
