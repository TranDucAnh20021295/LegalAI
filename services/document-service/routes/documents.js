const express = require('express');
const LegalDocument = require('../models/LegalDocument');
const DocumentChunk = require('../models/DocumentChunk');
const { getEmbedding, isLocal } = require('../lib/embedding');
const { splitTextIntoChunks } = require('../lib/splitText');

const router = express.Router();

router.post('/:documentId/split-and-index', async (req, res) => {
  try {
    const { documentId } = req.params;
    const doc = await LegalDocument.viewDetail(documentId);
    if (!doc || !doc.content) {
      return res.status(404).json({ message: 'Không tìm thấy văn bản hoặc văn bản không có nội dung' });
    }
    await DocumentChunk.deleteByDocumentId(documentId);
    const chunks = splitTextIntoChunks(doc.content, 600, 100);
    if (chunks.length === 0) {
      return res.json({ message: 'Không có nội dung để tạo chunk', chunksCreated: 0, indexed: 0 });
    }
    let indexed = 0;
    for (let i = 0; i < chunks.length; i++) {
      const { chunkId } = await DocumentChunk.create(documentId, chunks[i], i);
      const embedding = await getEmbedding(chunks[i]);
      if (embedding) {
        await DocumentChunk.updateEmbedding(chunkId, embedding, isLocal);
        indexed++;
      }
    }
    res.json({ message: 'Đã tạo chunks và index embedding', chunksCreated: chunks.length, indexed });
  } catch (error) {
    console.error('[Documents] split-and-index error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

router.post('/index-all', async (req, res) => {
  try {
    const docs = await LegalDocument.findAll();
    let totalChunks = 0;
    let totalIndexed = 0;
    const results = [];
    for (const doc of docs) {
      try {
        const fullDoc = await LegalDocument.viewDetail(doc.documentId);
        if (!fullDoc || !fullDoc.content) continue;
        await DocumentChunk.deleteByDocumentId(doc.documentId);
        const chunks = splitTextIntoChunks(fullDoc.content, 600, 100);
        let indexed = 0;
        for (let i = 0; i < chunks.length; i++) {
          const { chunkId } = await DocumentChunk.create(doc.documentId, chunks[i], i);
          const embedding = await getEmbedding(chunks[i]);
          if (embedding) {
            await DocumentChunk.updateEmbedding(chunkId, embedding, isLocal);
            indexed++;
          }
        }
        totalChunks += chunks.length;
        totalIndexed += indexed;
        results.push({ documentId: doc.documentId, title: doc.title, chunks: chunks.length, indexed });
      } catch (e) {
        results.push({ documentId: doc.documentId, title: doc.title, error: e.message });
      }
    }
    res.json({ message: 'Đã index toàn bộ văn bản', totalDocuments: docs.length, totalChunks, totalIndexed, details: results });
  } catch (error) {
    console.error('[Documents] index-all error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

router.get('/search/semantic', async (req, res) => {
  try {
    const { q, limit } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ message: 'Thiếu tham số q' });
    }
    const embedding = await getEmbedding(q);
    if (!embedding) {
      return res.status(503).json({
        message: 'Không thể tạo embedding. Kiểm tra OPENAI_API_KEY hoặc embedding-service.',
        queryEmbedded: false,
      });
    }
    const chunks = await DocumentChunk.searchSimilar(embedding, parseInt(limit, 10) || 10, isLocal);
    res.json({
      chunks,
      meta: { queryEmbedded: true, count: chunks.length },
    });
  } catch (error) {
    console.error('[Documents] semantic search error:', error);
    res.status(500).json({ message: 'Lỗi server', queryEmbedded: false });
  }
});

router.post('/chunks/index', async (req, res) => {
  try {
    const { documentId } = req.body;
    if (!documentId) {
      return res.status(400).json({ message: 'Thiếu documentId' });
    }
    const chunks = await DocumentChunk.findByDocumentId(documentId);
    if (chunks.length === 0) {
      return res.json({ message: 'Không có chunk nào để index', indexed: 0 });
    }
    let indexed = 0;
    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk.contentChunk);
      if (embedding) {
        await DocumentChunk.updateEmbedding(chunk.chunkId, embedding, isLocal);
        indexed++;
      }
    }
    res.json({ message: 'Đã index embedding', indexed, total: chunks.length });
  } catch (error) {
    console.error('[Documents] index chunks error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

router.get('/search', async (req, res) => {
  try {
    const { keyword, limit } = req.query;
    const results = await LegalDocument.searchByKeyword(keyword || '', parseInt(limit, 10) || 50);
    res.json(results);
  } catch (error) {
    console.error('[Documents] searchByKeyword error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

router.get('/filter', async (req, res) => {
  try {
    const { field, limit } = req.query;
    const results = await LegalDocument.filterByField(field || '', parseInt(limit, 10) || 50);
    res.json(results);
  } catch (error) {
    console.error('[Documents] filterByField error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

router.get('/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const doc = await LegalDocument.viewDetail(documentId);
    if (!doc) {
      return res.status(404).json({ message: 'Không tìm thấy văn bản' });
    }
    res.json(doc);
  } catch (error) {
    console.error('[Documents] viewDetail error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

module.exports = router;
