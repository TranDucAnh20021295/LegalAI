const express = require('express');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { authMiddleware } = require('../middleware/auth');
const { getContextFromDocuments, generateReply, getContextByDocumentId, generateReplyForDocument } = require('../lib/rag');

const Subscription = require('../models/Subscription');

const router = express.Router();
router.use(authMiddleware);

const HISTORY_CONTEXT_LIMIT = 8;
const WIDGET_HISTORY_LIMIT = 4;
const HISTORY_MESSAGE_CHAR_LIMIT = 1200;

function normalizeMetadata(metadata) {
  if (!metadata) return null;
  if (typeof metadata === 'object') return metadata;
  try {
    return JSON.parse(metadata);
  } catch (e) {
    return null;
  }
}

function buildConversationContext(history) {
  const recent = (history || [])
    .filter((m) => m && m.content && (m.senderType || m.sendertype))
    .slice(-HISTORY_CONTEXT_LIMIT);

  if (recent.length === 0) return '';

  return recent
    .map((m) => {
      const sender = String(m.senderType || m.sendertype).toUpperCase() === 'AI' ? 'AI' : 'User';
      const content = String(m.content || '').replace(/\s+/g, ' ').trim().slice(0, HISTORY_MESSAGE_CHAR_LIMIT);
      return `${sender}: ${content}`;
    })
    .join('\n');
}

function buildRetrievalQuery(history, currentContent) {
  const current = String(currentContent || '').trim();
  const historyText = buildConversationContext(history);
  if (!historyText) return current;
  return [
    'Ngữ cảnh hội thoại gần đây (chỉ dùng để hiểu câu hỏi tiếp nối, không phải yêu cầu mới):',
    historyText,
    '',
    `Câu hỏi hiện tại: ${current}`,
  ].join('\n');
}

function inferDocumentIdFromHistory(history) {
  const reversed = [...(history || [])].reverse();
  for (const msg of reversed) {
    const metadata = normalizeMetadata(msg.metadata);
    const sources = Array.isArray(metadata?.ragSources) ? metadata.ragSources : [];
    const documentIds = [...new Set(sources.map((s) => s?.documentId).filter(Boolean))];
    if (documentIds.length === 1) return documentIds[0];
  }
  return null;
}

function mergeRagContexts(primary, related) {
  const parts = [];
  const sources = [];
  const seenSourceKeys = new Set();

  const add = (ctx, label) => {
    if (!ctx) return;
    if (ctx.contextText) {
      parts.push(`### ${label}\n${ctx.contextText}`);
    }
    for (const source of ctx.sources || []) {
      const key = source.chunkId || `${source.documentId || ''}:${source.title || ''}:${String(source.excerpt || '').slice(0, 80)}`;
      if (seenSourceKeys.has(key)) continue;
      seenSourceKeys.add(key);
      sources.push(source);
    }
  };

  add(primary, 'Văn bản đang đọc');
  add(related, 'Văn bản liên quan');

  return {
    contextText: parts.join('\n\n---\n\n'),
    sources,
    docMeta: primary?.docMeta || null,
  };
}

function normalizeClientHistory(history, limit = HISTORY_CONTEXT_LIMIT) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .slice(-limit)
    .map((m) => ({
      content: m.content,
      senderType: String(m.senderType || m.sendertype || '').toUpperCase() === 'AI' ? 'AI' : 'USER',
      metadata: normalizeMetadata(m.metadata),
    }));
}

router.get('/', async (req, res) => {
  try {
    const list = await Conversation.findByUserId(req.userId);
    res.json(list);
  } catch (error) {
    console.error('[Chat] list conversations:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

router.post('/', async (req, res) => {
  try {
    const title = req.body.title || 'Cuộc hội thoại mới';
    const conv = await Conversation.create(req.userId, title);
    res.status(201).json(conv);
  } catch (error) {
    console.error('[Chat] create conversation:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

router.get('/:conversationId', async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.conversationId, req.userId);
    if (!conv) return res.status(404).json({ message: 'Không tìm thấy cuộc hội thoại' });
    res.json(conv);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
});

router.patch('/:conversationId', async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ message: 'Thiếu title' });
    }
    const updated = await Conversation.rename(req.params.conversationId, req.userId, title.trim());
    if (!updated) return res.status(404).json({ message: 'Không tìm thấy cuộc hội thoại' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
});

router.delete('/:conversationId', async (req, res) => {
  try {
    await Conversation.delete(req.params.conversationId, req.userId);
    res.json({ message: 'Đã xóa' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
});

router.get('/:conversationId/messages', async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.conversationId, req.userId);
    if (!conv) return res.status(404).json({ message: 'Không tìm thấy cuộc hội thoại' });
    const messages = await Message.getByConversationId(req.params.conversationId);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
});

router.post('/:conversationId/messages', async (req, res) => {
  try {
    const { content, senderType, documentId, document_id } = req.body;
    let finalDocId = documentId || document_id;
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ message: 'Thiếu content' });
    }
    const conv = await Conversation.findById(req.params.conversationId, req.userId);
    if (!conv) return res.status(404).json({ message: 'Không tìm thấy cuộc hội thoại' });
    const type = senderType === 'AI' ? 'AI' : 'USER';

    // ── Kiểm tra quyền chat ──
    if (type === 'USER') {
      const userRole = String(req.userRole || '').toUpperCase();
      
      // ADMIN được miễn phí hoàn toàn, không cần check giới hạn
      if (userRole !== 'ADMIN') {
        const pool = require('../config/database');
        const redisClient = require('../lib/redis');
        const { getDynamicConfig } = require('../lib/rag');

        // 1. Kiểm tra subscription trước — nếu đã có gói thì bỏ qua toàn bộ giới hạn
        const activeSub = await Subscription.findActiveByUserId(req.userId);

        if (!activeSub) {
          // Chưa có gói → kiểm tra giới hạn free
          const cfg = await getDynamicConfig();
          const FREE_LIMIT = parseInt(cfg.FREE_DAILY_LIMIT, 10) || 10;

          // 2. Lấy số lượng câu hỏi hôm nay từ Redis (Cache)
          const dateStr = new Date().toISOString().split('T')[0];
          const redisUsageKey = `daily_usage:${dateStr}:${req.userId}`;
          let todayCount = 0;

          if (redisClient.isReady) {
            const cachedCount = await redisClient.get(redisUsageKey);
            if (cachedCount) {
              todayCount = parseInt(cachedCount, 10);
            } else {
              // Nếu Redis mất, truy vấn DB để đồng bộ lại
              const usageRes = await pool.query(
                `SELECT count FROM daily_chat_usage WHERE "userId" = $1 AND date = CURRENT_DATE`,
                [req.userId]
              );
              todayCount = usageRes.rows[0]?.count || 0;
              await redisClient.setEx(redisUsageKey, 86400, todayCount.toString()); // Lưu cache 1 ngày
            }
          }

          if (todayCount >= FREE_LIMIT) {
            return res.status(403).json({
              message: `Bạn đã dùng hết ${FREE_LIMIT} câu hỏi miễn phí hôm nay. Vui lòng mua gói để tiếp tục.`,
              active: false,
              requireSubscription: true,
              todayCount,
              freeLimit: FREE_LIMIT,
            });
          }
        }

        // 3. Tăng bộ đếm (Tăng cực nhanh trên RAM, sau đó ghi đồng bộ xuống ổ cứng cho Admin xem)
        if (redisClient.isReady) {
          const dateStr = new Date().toISOString().split('T')[0];
          const redisUsageKey = `daily_usage:${dateStr}:${req.userId}`;
          await redisClient.incr(redisUsageKey);
        }
        await pool.query(
          `INSERT INTO daily_chat_usage ("userId", date, count)
           VALUES ($1, CURRENT_DATE, 1)
           ON CONFLICT ("userId", date) DO UPDATE SET count = daily_chat_usage.count + 1`,
          [req.userId]
        );
      }
    }

    const previousMessages = type === 'USER'
      ? await Message.getByConversationId(req.params.conversationId)
      : [];
    if (!finalDocId) {
      finalDocId = inferDocumentIdFromHistory(previousMessages);
      if (finalDocId) {
        console.info('[Chat RAG] Suy luận documentId từ lịch sử hội thoại:', finalDocId);
      }
    }
    const conversationContext = type === 'USER'
      ? buildConversationContext(previousMessages)
      : '';
    const retrievalQuery = type === 'USER'
      ? buildRetrievalQuery(previousMessages, content.trim())
      : content.trim();
    const currentQuery = content.trim();

    const msg = await Message.create(req.params.conversationId, content.trim(), type);
    await Conversation.touch(req.params.conversationId);

    if (type === 'AI') {
      return res.status(201).json(msg);
    }


    let aiContent, sources;

    if (finalDocId) {
      // Luồng RAG tập trung theo văn bản cụ thể (người dùng đang xem trang VBPL)
      console.info('[Chat RAG] Chế độ document-specific, ID:', finalDocId);
      const primaryContext = await getContextByDocumentId(finalDocId, retrievalQuery);
      let relatedContext = null;
      try {
        relatedContext = await getContextFromDocuments(retrievalQuery, 6, null, null);
      } catch (e) {
        console.warn('[Chat RAG] Không lấy được văn bản liên quan:', e.message);
      }
      const merged = mergeRagContexts(primaryContext, relatedContext);
      sources = merged.sources;
      aiContent = await generateReplyForDocument(content.trim(), merged.contextText, merged.docMeta, conversationContext);
    } else {
      // Luồng RAG tổng quát: PHÂN LOẠI CATEGORY -> TÌM KIẾM -> TRẢ LỜI
      const { getDynamicConfig, classifyIntent } = require('../lib/rag');
      const cfg = await getDynamicConfig();
      
      // 1. Phân loại câu hỏi hiện tại, tránh lịch sử cũ kéo lệch sang lĩnh vực khác
      const field = await classifyIntent(currentQuery, cfg);
      
      // 2. Tìm kiếm theo câu hỏi hiện tại; lịch sử chỉ đưa vào prompt trả lời ở conversationContext
      const { contextText, sources: s } = await getContextFromDocuments(currentQuery, 12, null, field);
      sources = s;
      
      // 3. Trả lời với System Prompt chuyên biệt của lĩnh vực đó
      aiContent = await generateReply(content.trim(), contextText, field, conversationContext);
    }

    const metadata = sources && sources.length > 0 ? { ragSources: sources } : null;
    const aiMsg = await Message.create(req.params.conversationId, aiContent, 'AI', metadata);
    await Conversation.touch(req.params.conversationId);
    res.status(201).json({ userMessage: msg, aiMessage: aiMsg });

  } catch (error) {
    console.error('[Chat] send message:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

/**
 * Endpoint hỏi đáp nhanh (Anonymous/Widget): Không lưu vào Database.
 * Giúp widget không làm rác danh sách hội thoại của người dùng.
 */
router.post('/ask-anonymous', async (req, res) => {
  try {
    const { content, documentId, document_id, history, messages } = req.body;
    let finalDocId = documentId || document_id;
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ message: 'Thiếu content' });
    }

    // Vẫn check giới hạn tin nhắn để tránh spam (nếu cần)
    // Ở đây ta cho phép nếu là Admin, hoặc chưa vượt quá giới hạn free.
    // (Có thể bỏ qua check này nếu muốn widget luôn free)

    const previousMessages = normalizeClientHistory(history || messages, WIDGET_HISTORY_LIMIT);
    if (!finalDocId) {
      finalDocId = inferDocumentIdFromHistory(previousMessages);
      if (finalDocId) {
        console.info('[Chat RAG] Widget suy luận documentId từ lịch sử hội thoại:', finalDocId);
      }
    }
    const conversationContext = buildConversationContext(previousMessages);
    const retrievalQuery = buildRetrievalQuery(previousMessages, content.trim());
    const currentQuery = content.trim();

    let aiContent, sources;
    if (finalDocId) {
      const primaryContext = await getContextByDocumentId(finalDocId, retrievalQuery);
      let relatedContext = null;
      try {
        relatedContext = await getContextFromDocuments(retrievalQuery, 6, null, null);
      } catch (e) {
        console.warn('[Chat RAG] Widget không lấy được văn bản liên quan:', e.message);
      }
      const merged = mergeRagContexts(primaryContext, relatedContext);
      sources = merged.sources;
      aiContent = await generateReplyForDocument(content.trim(), merged.contextText, merged.docMeta, conversationContext);
    } else {
      const { getDynamicConfig, classifyIntent } = require('../lib/rag');
      const cfg = await getDynamicConfig();
      const field = await classifyIntent(currentQuery, cfg);
      const { contextText, sources: s } = await getContextFromDocuments(currentQuery, 12, null, field);
      sources = s;
      aiContent = await generateReply(content.trim(), contextText, field, conversationContext);
    }

    const metadata = sources && sources.length > 0 ? { ragSources: sources } : null;
    
    // Trả về dữ liệu giả lập giống như sendMessage nhưng không có ID thật trong DB
    res.json({
      userMessage: { content: content.trim(), senderType: 'USER', createdAt: new Date() },
      aiMessage: { content: aiContent, senderType: 'AI', metadata, createdAt: new Date() }
    });
  } catch (error) {
    console.error('[Chat] ask-anonymous error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

module.exports = router;
