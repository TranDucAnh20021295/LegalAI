const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Cùng key OpenAI thường chỉ khai báo ở chat-service → merge để tra cứu AI/embed dùng được.
// Thứ tự: .env gốc repo → chat-service/.env → document-service/.env (ưu tiên cuối).
const rootEnv = path.join(__dirname, '../../.env');
const chatEnvPath = path.join(__dirname, '../chat-service/.env');
const docEnvPath = path.join(__dirname, '.env');
if (fs.existsSync(rootEnv)) dotenv.config({ path: rootEnv });
if (fs.existsSync(chatEnvPath)) dotenv.config({ path: chatEnvPath });
dotenv.config({ path: docEnvPath, override: true });

console.log('[Document Service] Environment loaded');

const express = require('express');
const { mountListen } = require('../graceful-listen');
const cors = require('cors');

const initDatabase = require('./config/initDatabase');
const documentRoutes = require('./routes/documents');
const { runSync } = require('./lib/syncChunks');
const { getEmbeddingStatus } = require('./lib/embedding');

const app = express();

app.use(cors({
  origin: '*',
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/documents', documentRoutes);

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'document-service',
    message: 'Document service is running',
  });
});

const PORT = Number(process.env.PORT) || 5002;
// Chỉ tự embed toàn bộ DB khi set AUTO_SYNC_CHUNKS_ON_STARTUP=true (mặc định tắt)
const AUTO_SYNC = process.env.AUTO_SYNC_CHUNKS_ON_STARTUP === 'true';

initDatabase()
  .then(() => {
    mountListen(app, PORT, 'document-service', () => {
      console.log(`Documents: http://localhost:${PORT}`);
      console.log('[Embedding]', getEmbeddingStatus());
      if (AUTO_SYNC) {
        setImmediate(() => {
          console.log('[Document] Đang đồng bộ chunks + embedding (chạy nền)...');
          runSync()
            .then((r) => console.log(`[Document] Xong: ${r.totalIndexed}/${r.totalChunks} chunks đã embed từ ${r.totalDocuments} văn bản.`))
            .catch((e) => console.error('[Document] Sync lỗi:', e.message));
        });
      }
    });
  })
  .catch((err) => {
    console.error('Document service start failed:', err?.message || err);
    if (err?.stack) console.error(err.stack);
    process.exit(1);
  });
