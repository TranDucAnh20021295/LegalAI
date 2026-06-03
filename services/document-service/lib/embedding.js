const OpenAI = require('openai');

const OPENAI_KEY_RAW = process.env.OPENAI_API_KEY || '';
const OPENAI_KEY = typeof OPENAI_KEY_RAW === 'string' ? OPENAI_KEY_RAW.trim() : '';
const OPENAI = OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;

const OPENAI_MODEL = 'text-embedding-3-small';
const OPENAI_DIM = 1536;
const DIMENSIONS = OPENAI_DIM;

// --- Cache cho Embedding để tránh gọi service quá nhiều ---
const embeddingCache = new Map();
const MAX_CACHE_SIZE = 1000;

async function getEmbeddingOpenAI(text) {
  if (!OPENAI || !text || typeof text !== 'string') return null;
  const input = text.trim().slice(0, 8000);
  if (!input) return null;
  try {
    const { data } = await OPENAI.embeddings.create({
      model: OPENAI_MODEL,
      input,
      dimensions: OPENAI_DIM,
    });
    return data[0]?.embedding || null;
  } catch (err) {
    console.error('[Embedding] OpenAI:', err.message);
    return null;
  }
}

const BATCH_SIZE = 100;

async function getEmbeddingOpenAIBatch(texts) {
  if (!OPENAI || !Array.isArray(texts) || texts.length === 0) return [];
  const inputs = texts.map((t) => (typeof t === 'string' ? t.trim().slice(0, 8000) : '')).filter(Boolean);
  if (inputs.length === 0) return [];
  const maxAttempts = Math.max(1, Number(process.env.OPENAI_EMBEDDING_RETRIES) || 5);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data } = await OPENAI.embeddings.create({
        model: OPENAI_MODEL,
        input: inputs,
        dimensions: OPENAI_DIM,
      });
      return (data || []).map((d) => d.embedding).filter(Boolean);
    } catch (err) {
      const message = err?.message || String(err);
      console.error('[Embedding] OpenAI batch:', message);
      if (attempt >= maxAttempts || !/rate limit|429|TPM|try again/i.test(message)) {
        return [];
      }
      const retryAfter = Number(err?.headers?.['retry-after']);
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : attempt * 5000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return [];
}

async function getEmbedding(text) {
  if (!text || typeof text !== 'string') return null;
  const q = text.trim();
  if (!q) return null;

  if (embeddingCache.has(q)) return embeddingCache.get(q);

  const res = await getEmbeddingOpenAI(q);

  if (res) {
    if (embeddingCache.size >= MAX_CACHE_SIZE) {
       const firstKey = embeddingCache.keys().next().value;
       embeddingCache.delete(firstKey);
    }
    embeddingCache.set(q, res);
  }
  return res;
}

const BATCH_DELAY_MS = Math.max(0, Number(process.env.EMBEDDING_BATCH_DELAY_MS) || 50);

/**
 * @param {string[]} texts
 * @param {{ onProgress?: (info: { current: number, total: number }) => void }} [opts]
 */
async function getEmbeddingBatch(texts, opts = {}) {
  const total = texts.length;
  const onProgress = opts.onProgress;
  if (!Array.isArray(texts) || total === 0) return [];
  const list = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    if (i > 0 && BATCH_DELAY_MS > 0) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    const batch = texts.slice(i, i + BATCH_SIZE);
    const embeddings = await getEmbeddingOpenAIBatch(batch);
    list.push(...embeddings);
    if (onProgress) onProgress({ current: Math.min(i + BATCH_SIZE, total), total });
  }
  return list;
}

function getEmbeddingStatus() {
  return {
    provider: 'openai',
    openaiKeySet: Boolean(OPENAI_KEY),
    dimensions: DIMENSIONS,
  };
}

/** Gợi ý cấu hình khi getEmbedding trả null (hiển thị API / log). */
function getEmbeddingFailureHint() {
  return (
    'Đang dùng OpenAI embedding → cần OPENAI_API_KEY (OpenAI API, không dùng được GEMINI_API_KEY thay thế). ' +
    'Đặt trong services/document-service/.env hoặc services/chat-service/.env rồi restart document-service. ' +
    'Nếu chỉ có Gemini cho chat: thêm key OpenAI riêng cho embed.'
  );
}

module.exports = {
  getEmbedding,
  getEmbeddingBatch,
  DIMENSIONS,
  getEmbeddingStatus,
  getEmbeddingFailureHint,
};
