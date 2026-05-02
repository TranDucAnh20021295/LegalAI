const express = require('express');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { authMiddleware } = require('../middleware/auth');
const { getContextFromDocuments, generateReply, getContextByDocumentId, generateReplyForDocument } = require('../lib/rag');

const Subscription = require('../models/Subscription');

const router = express.Router();
router.use(authMiddleware);

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
    const activeSub = await Subscription.findActiveByUserId(req.userId);
    if (!activeSub) {
      return res.status(403).json({
        message: 'Bạn cần mua gói LegalAI còn hạn để tạo cuộc trò chuyện.',
        active: false,
      });
    }
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
    const finalDocId = documentId || document_id;
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
        
        // 1. Lấy giới hạn siêu nhanh từ Redis Cache (thông qua getDynamicConfig)
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
          // Hết miễn phí → phải có gói trả phí
          const activeSub = await Subscription.findActiveByUserId(req.userId);
          if (!activeSub) {
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

    const msg = await Message.create(req.params.conversationId, content.trim(), type);
    await Conversation.touch(req.params.conversationId);

    if (type === 'AI') {
      return res.status(201).json(msg);
    }


    let aiContent, sources;

    if (finalDocId) {
      // Luồng RAG tập trung theo văn bản cụ thể (người dùng đang xem trang VBPL)
      console.info('[Chat RAG] Chế độ document-specific, ID:', finalDocId);
      const { contextText, sources: s, docMeta } = await getContextByDocumentId(finalDocId, content.trim());
      sources = s;
      aiContent = await generateReplyForDocument(content.trim(), contextText, docMeta);
    } else {
      // Luồng RAG tổng quát: PHÂN LOẠI CATEGORY -> TÌM KIẾM -> TRẢ LỜI
      const { getDynamicConfig, classifyIntent } = require('../lib/rag');
      const cfg = await getDynamicConfig();
      
      // 1. Phân loại câu hỏi thuộc lĩnh vực nào
      const field = await classifyIntent(content.trim(), cfg);
      
      // 2. Chỉ tìm kiếm các văn bản thuộc lĩnh vực đó
      const { contextText, sources: s } = await getContextFromDocuments(content.trim(), 12, null, field);
      sources = s;
      
      // 3. Trả lời với System Prompt chuyên biệt của lĩnh vực đó
      aiContent = await generateReply(content.trim(), contextText, field);
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

module.exports = router;
