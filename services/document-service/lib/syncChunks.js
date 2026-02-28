const LegalDocument = require('../models/LegalDocument');
const DocumentChunk = require('../models/DocumentChunk');
const { getEmbeddingBatch, isLocal } = require('./embedding');
const { splitTextIntoChunks } = require('./splitText');

function progressLog(prefix, current, total) {
  const pct = total ? Math.round((current / total) * 100) : 0;
  process.stdout.write(`\r[Document] ${prefix} ${current}/${total} (${pct}%)\x1b[K`);
  if (current >= total) console.log('');
}

async function indexDocument(documentId, opts = {}) {
  const log = opts.logProgress !== false;
  const doc = await LegalDocument.viewDetail(documentId);
  if (!doc || !doc.content) return { chunks: 0, indexed: 0 };
  if (log) console.log('[Document] Đang xử lý:', doc.title || documentId);
  await DocumentChunk.deleteByDocumentId(documentId);
  const chunks = splitTextIntoChunks(doc.content, 600, 100);
  if (log) console.log('[Document] Đã tách', chunks.length, 'chunks, đang tạo bản ghi...');
  const chunkIds = [];
  for (let i = 0; i < chunks.length; i++) {
    const { chunkId } = await DocumentChunk.create(documentId, chunks[i], i);
    chunkIds.push(chunkId);
  }
  if (log) console.log('[Document] Đang embed (có thể mất vài phút)...');
  const embeddings = await getEmbeddingBatch(chunks, {
    onProgress: log ? ({ current, total }) => progressLog('Embed', current, total) : undefined,
  });
  if (log) console.log('[Document] Đang lưu embedding vào DB...');
  let indexed = 0;
  for (let i = 0; i < Math.min(chunkIds.length, embeddings.length); i++) {
    await DocumentChunk.updateEmbedding(chunkIds[i], embeddings[i], isLocal);
    indexed++;
  }
  return { chunks: chunks.length, indexed };
}

async function runSync() {
  const docs = await LegalDocument.findAll();
  const totalDocs = docs.length;
  let totalChunks = 0;
  let totalIndexed = 0;
  console.log('[Document] Tổng', totalDocs, 'văn bản cần đồng bộ.');
  for (let d = 0; d < docs.length; d++) {
    const doc = docs[d];
    try {
      console.log('[Document] ---', `(${d + 1}/${totalDocs})`, '---');
      const result = await indexDocument(doc.documentId, { logProgress: true });
      totalChunks += result.chunks;
      totalIndexed += result.indexed;
      if (result.chunks > 0) {
        console.log('[Document] Xong:', doc.title || doc.documentId, '→', result.indexed + '/' + result.chunks, 'chunks đã embed.');
      }
    } catch (e) {
      console.error('[Document] Lỗi', doc.documentId, ':', e.message);
    }
  }
  return { totalDocuments: totalDocs, totalChunks, totalIndexed };
}

module.exports = { runSync, indexDocument };
