const express = require('express');
const cors = require('cors');
require('dotenv').config();

const initDatabase = require('./config/initDatabase');
const documentRoutes = require('./routes/documents');
const { runSync } = require('./lib/syncChunks');

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

const PORT = process.env.PORT || 5002;
// Chỉ tự embed toàn bộ DB khi set AUTO_SYNC_CHUNKS_ON_STARTUP=true (mặc định tắt)
const AUTO_SYNC = process.env.AUTO_SYNC_CHUNKS_ON_STARTUP === 'true';

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Documents: http://localhost:${PORT}`);
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
