const express = require('express');
const LegalDocument = require('../models/LegalDocument');
const DocumentChunk = require('../models/DocumentChunk');
const { getEmbedding, getEmbeddingStatus, getEmbeddingFailureHint } = require('../lib/embedding');

const router = express.Router();

function parseDocumentIdParam(raw) {
  if (!raw) return '';
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return String(raw).trim();
  }
}

router.get('/search/semantic', async (req, res) => {
  try {
    const { q, limit, documentId, field } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ message: 'Thiếu tham số q' });
    }
    const embedding = await getEmbedding(q);
    if (!embedding) {
      return res.status(503).json({
        message: 'Không thể tạo embedding. Kiểm tra OPENAI_API_KEY.',
        hint: getEmbeddingFailureHint(),
        ...getEmbeddingStatus(),
        queryEmbedded: false,
      });
    }
    const lim = parseInt(limit, 10) || 20;
    const chunks = await DocumentChunk.searchSimilarWithDocuments(embedding, lim, documentId, field, q);
    res.json({
      chunks,
      meta: { queryEmbedded: true, count: chunks.length, mode: 'semantic', documentId, field },
    });

  } catch (error) {
    console.error('[Documents] semantic search error:', error);
    res.status(500).json({ message: 'Lỗi server', queryEmbedded: false });
  }
});

router.get('/search/semantic/docs', async (req, res) => {
  try {
    const { q, limit } = req.query;
    if (!q || typeof q !== 'string') return res.status(400).json({ message: 'Thiếu q' });
    const embedding = await getEmbedding(q);
    if (!embedding) return res.status(503).json({ message: 'Lỗi embedding', ...getEmbeddingStatus() });
    const docs = await LegalDocument.searchSemantic(embedding, parseInt(limit, 10) || 24);
    res.json(docs);
  } catch (error) {
    console.error('[Documents] semantic docs search error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

router.get('/chunks', async (req, res) => {
  try {
    const { documentId, limit } = req.query;
    if (!documentId) return res.status(400).json({ message: 'Thiếu documentId' });
    const lim = parseInt(limit, 10) || 60;
    const chunks = await DocumentChunk.findByDocumentId(documentId, lim);
    res.json(chunks);
  } catch (error) {
    console.error('[Documents] get chunks by documentId error:', error);
    res.status(500).json({ message: 'Lỗi server' });
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
        await DocumentChunk.updateEmbedding(chunk.chunkId, embedding);
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
    const { keyword, limit, searchIn, exact } = req.query;
    const isExact = exact === 'true';
    const results = await LegalDocument.searchByKeyword(
      keyword || '', 
      parseInt(limit, 10) || 50,
      searchIn || 'all',
      isExact
    );
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
    const documentId = parseDocumentIdParam(req.params.documentId);
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

router.put('/:documentId', async (req, res) => {
  try {
    const documentId = parseDocumentIdParam(req.params.documentId);
    const updated = await LegalDocument.update(documentId, req.body);
    if (!updated) {
      return res.status(404).json({ message: 'Không tìm thấy văn bản' });
    }
    res.json({ message: 'Cập nhật thành công', document: updated });
  } catch (error) {
    console.error('[Documents] update error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

router.delete('/:documentId', async (req, res) => {
  try {
    const documentId = parseDocumentIdParam(req.params.documentId);
    const deleted = await LegalDocument.delete(documentId);
    if (!deleted) {
      return res.status(404).json({ message: 'Không tìm thấy văn bản' });
    }
    res.json({ message: 'Đã xóa văn bản' });
  } catch (error) {
    console.error('[Documents] delete error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

module.exports = router;
