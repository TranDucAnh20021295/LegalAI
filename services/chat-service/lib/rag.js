/**
 * RAG: lấy ngữ cảnh từ document-service (semantic search bằng embedding transformer)
 * rồi sinh câu trả lời bằng Gemini (ưu tiên) hoặc OpenAI.
 */
const DOCUMENT_SERVICE_URL = (process.env.DOCUMENT_SERVICE_URL || 'http://localhost:5002').replace(/\/$/, '');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY; // bạn đang dùng key Gemini, tái sử dụng biến cũ
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-pro';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY && !GEMINI_API_KEY ? process.env.OPENAI_API_KEY : null;

async function getContextFromDocuments(query, limit = 5) {
  if (!query || typeof query !== 'string') return '';
  try {
    const url = `${DOCUMENT_SERVICE_URL}/documents/search/semantic?q=${encodeURIComponent(query.trim())}&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const data = await res.json();
    const chunks = Array.isArray(data) ? data : (data.chunks || []);
    const meta = data.meta || {};
    if (!res.ok) {
      if (meta.queryEmbedded === false) console.warn('[Chat RAG] Câu hỏi chưa được embed:', data.message || res.status);
      return '';
    }
    if (chunks.length === 0) return '';
    return chunks.map((c) => c.contentChunk || c.content || '').filter(Boolean).join('\n\n');
  } catch (e) {
    console.warn('[Chat RAG] getContext:', e.message);
    return '';
  }
}

async function generateReply(userMessage, context) {
  // Ưu tiên Gemini
  if (GEMINI_API_KEY) {
    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
      const promptParts = [];
      if (context) {
        promptParts.push(
          'Bạn là trợ lý pháp lý. Trả lời ngắn gọn, rõ ràng dựa trên các đoạn văn bản sau.',
          'Nếu ngữ cảnh không đủ hoặc không liên quan, hãy nói rõ và gợi ý người dùng tra cứu thêm.',
          '',
          'Ngữ cảnh:',
          context.slice(0, 6000),
          '',
          'Câu hỏi:',
          userMessage.slice(0, 4000)
        );
      } else {
        promptParts.push(
          'Bạn là trợ lý pháp lý. Hiện không có văn bản tham chiếu.',
          'Trả lời chung và gợi ý người dùng tra cứu trong mục Tra cứu văn bản.',
          '',
          'Câu hỏi:',
          userMessage.slice(0, 4000)
        );
      }
      const result = await model.generateContent(promptParts.join('\n'));
      const text = result?.response?.text?.() || '';
      if (text.trim()) return text.trim();
    } catch (e) {
      console.error('[Chat RAG] generateReply (Gemini):', e.message);
    }
  }

  // Fallback OpenAI nếu có key riêng
  if (OPENAI_API_KEY) {
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
      const systemContent = context
        ? `Bạn là trợ lý pháp lý. Trả lời ngắn gọn dựa trên ngữ cảnh văn bản dưới đây. Nếu ngữ cảnh không liên quan, hãy nói rõ và gợi ý người dùng tra cứu thêm.\n\nNgữ cảnh:\n${context.slice(0, 6000)}`
        : 'Bạn là trợ lý pháp lý. Hiện không có văn bản liên quan. Gợi ý người dùng tra cứu trong mục Tra cứu văn bản hoặc nêu rõ câu hỏi.';
      const { choices } = await openai.chat.completions.create({
        model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: userMessage.slice(0, 4000) },
        ],
        max_tokens: 1024,
      });
      const text = choices?.[0]?.message?.content?.trim();
      if (text) return text;
    } catch (e) {
      console.error('[Chat RAG] generateReply (OpenAI):', e.message);
    }
  }

  // Fallback cuối cùng: trả về context để user tự đọc
  return context
    ? `Dựa trên các đoạn văn bản liên quan sau, bạn có thể tham khảo:\n\n${context.slice(0, 2000)}${context.length > 2000 ? '...' : ''}`
    : 'Chưa cấu hình mô hình trả lời (Gemini/OpenAI). Bạn có thể tra cứu văn bản pháp luật trong mục Tra cứu văn bản.';
}

module.exports = { getContextFromDocuments, generateReply };
