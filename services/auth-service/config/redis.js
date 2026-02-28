const Redis = require('ioredis');
require('dotenv').config();

const REDIS_URL = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;

let client = null;
let redisAvailable = false;

function getRedis() {
  return client;
}

function isRedisAvailable() {
  return redisAvailable;
}

async function connectRedis() {
  if (client) return client;
  client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
  });
  client.on('error', (err) => console.error('[Redis]', err.message));
  try {
    await client.connect();
    redisAvailable = true;
    return client;
  } catch (err) {
    console.warn('[Redis] Không kết nối được, dùng JWT thuần (không revoke khi logout):', err.message);
    redisAvailable = false;
    return null;
  }
}

module.exports = { getRedis, connectRedis, isRedisAvailable };
