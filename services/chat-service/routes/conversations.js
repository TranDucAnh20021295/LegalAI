const express = require('express');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { authMiddleware } = require('../middleware/auth');
const { getContextFromDocuments, generateReply } = require('../lib/rag');

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
    const { content, senderType } = req.body;
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ message: 'Thiếu content' });
    }
    const conv = await Conversation.findById(req.params.conversationId, req.userId);
    if (!conv) return res.status(404).json({ message: 'Không tìm thấy cuộc hội thoại' });
    const type = senderType === 'AI' ? 'AI' : 'USER';
    const msg = await Message.create(req.params.conversationId, content.trim(), type);
    await Conversation.touch(req.params.conversationId);

    if (type === 'AI') {
      return res.status(201).json(msg);
    }

    const context = await getContextFromDocuments(content.trim(), 5);
    const aiContent = await generateReply(content.trim(), context);
    const aiMsg = await Message.create(req.params.conversationId, aiContent, 'AI');
    await Conversation.touch(req.params.conversationId);
    res.status(201).json({ userMessage: msg, aiMessage: aiMsg });
  } catch (error) {
    console.error('[Chat] send message:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

module.exports = router;
