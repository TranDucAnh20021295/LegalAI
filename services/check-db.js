const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5433,
  database: process.env.DB_NAME || 'legal_ai',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '123456',
});

async function checkDB() {
  try {
    console.log('🔍 Kiểm tra kết nối DB...');
    await pool.query('SELECT 1');
    console.log('✅ Kết nối DB thành công\n');

    console.log('📋 Kiểm tra các bảng:');
    const tables = ['users', 'authentication_tokens', 'conversations', 'messages', 'LegalDocuments', 'DocumentChunks'];
    for (const table of tables) {
      try {
        const result = await pool.query(`SELECT COUNT(*) FROM "${table}"`);
        console.log(`  ✅ ${table}: ${result.rows[0].count} rows`);
      } catch (e) {
        console.log(`  ❌ ${table}: chưa tồn tại`);
      }
    }

    console.log('\n🔍 Kiểm tra cột embedding trong DocumentChunks:');
    try {
      const result = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'DocumentChunks' AND column_name = 'embedding'
      `);
      if (result.rows.length > 0) {
        console.log('  ✅ Cột embedding đã có:', result.rows[0].data_type);
      } else {
        console.log('  ⚠️  Cột embedding chưa có - document-service sẽ tự thêm khi khởi động');
      }
    } catch (e) {
      console.log('  ❌ Lỗi kiểm tra:', e.message);
    }

    console.log('\n🔍 Kiểm tra extension vector:');
    try {
      const result = await pool.query(`SELECT * FROM pg_extension WHERE extname = 'vector'`);
      if (result.rows.length > 0) {
        console.log('  ✅ Extension vector đã cài');
      } else {
        console.log('  ⚠️  Extension vector chưa cài - chạy: CREATE EXTENSION vector;');
      }
    } catch (e) {
      console.log('  ❌ Lỗi kiểm tra:', e.message);
    }

    await pool.end();
    console.log('\n✅ Hoàn tất kiểm tra');
  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkDB();
