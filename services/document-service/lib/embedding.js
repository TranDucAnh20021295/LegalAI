const OpenAI = require('openai');

const OPENAI_KEY_RAW = process.env.OPENAI_API_KEY || '';
const OPENAI_KEY = typeof OPENAI_KEY_RAW === 'string' ? OPENAI_KEY_RAW.trim() : '';
const OPENAI = OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;
const LOCAL_URL = process.env.EMBEDDING_LOCAL_URL || 'http://localhost:5004';
const LOCAL_TIMEOUT_MS = Number(process.env.EMBEDDING_LOCAL_TIMEOUT_MS) || 600000; // 10 phút (batch 32 chunk có thể lâu)
/** Mặc định: có key → openai; không có key → local (embedding-service). */
const PROVIDER = (process.env.EMBEDDING_PROVIDER || '').toLowerCase() === 'openai'
  ? 'openai'
  : (process.env.EMBEDDING_PROVIDER || '').toLowerCase() === 'local'
    ? 'local'
    : OPENAI
      ? 'openai'
      : 'local';

const OPENAI_MODEL = 'text-embedding-3-small';
const OPENAI_DIM = 1536;
const LOCAL_DIM = 768;

const DIMENSIONS = PROVIDER === 'local' ? LOCAL_DIM : OPENAI_DIM;

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
// Local: gửi toàn bộ từng đợt (tối đa 32/request theo giới hạn embedding-service)
const LOCAL_BATCH_SIZE = PROVIDER === 'local' ? 32 : Math.max(1, Number(process.env.EMBEDDING_LOCAL_BATCH_SIZE) || 16);
const LOCAL_RETRIES = Math.max(0, Number(process.env.EMBEDDING_LOCAL_RETRIES) || 3);

function isRetryable(err) {
  const msg = err?.cause?.message || err?.message || '';
  return /ECONNRESET|ECONNREFUSED|fetch failed|ETIMEDOUT|socket hang up|aborted due to timeout/i.test(msg);
}

async function fetchWithRetry(url, options) {
  let lastErr;
  for (let attempt = 0; attempt <= LOCAL_RETRIES; attempt++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < LOCAL_RETRIES && isRetryable(err)) {
        const delay = (attempt + 1) * 2000;
        console.warn('[Embedding] Local retry', attempt + 1 + '/' + LOCAL_RETRIES, 'sau', delay, 'ms:', err?.cause?.message || err?.message);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  throw lastErr;
}

async function getEmbeddingLocal(text) {
  if (!text || typeof text !== 'string') return null;
  const input = text.trim().slice(0, 8000);
  if (!input) return null;
  try {
    const res = await fetchWithRetry(`${LOCAL_URL.replace(/\/$/, '')}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: input }),
      signal: AbortSignal.timeout(LOCAL_TIMEOUT_MS),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[Embedding] Local:', err);
      return null;
    }
    const data = await res.json();
    return data.embedding || (data.embeddings && data.embeddings[0]) || null;
  } catch (err) {
    const msg = err?.cause?.message || err?.message || String(err);
    console.error('[Embedding] Local:', msg, `(${LOCAL_URL})`);
    if (/fetch failed|ECONNREFUSED|ENOTFOUND/.test(msg)) {
      console.error('[Embedding] Gợi ý: chạy embedding-service tại', LOCAL_URL, 'hoặc set EMBEDDING_PROVIDER=openai để dùng OpenAI.');
    }
    return null;
  }
}

async function getEmbeddingLocalBatch(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const inputs = texts.map((t) => (typeof t === 'string' ? t.trim().slice(0, 8000) : '')).filter(Boolean);
  if (inputs.length === 0) return [];
  try {
    const res = await fetchWithRetry(`${LOCAL_URL.replace(/\/$/, '')}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: inputs }),
      signal: AbortSignal.timeout(LOCAL_TIMEOUT_MS),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[Embedding] Local batch:', err);
      return [];
    }
    const data = await res.json();
    const list = data.embeddings || (data.embedding ? [data.embedding] : []);
    return list;
  } catch (err) {
    const msg = err?.cause?.message || err?.message || String(err);
    console.error('[Embedding] Local batch:', msg);
    return [];
  }
}

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

  let res;
  if (PROVIDER === 'local') res = await getEmbeddingLocal(q);
  else res = await getEmbeddingOpenAI(q);

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
const LOCAL_BATCH_DELAY_MS = Math.max(0, Number(process.env.EMBEDDING_LOCAL_BATCH_DELAY_MS) || 1500);

/**
 * @param {string[]} texts
 * @param {{ onProgress?: (info: { current: number, total: number }) => void }} [opts]
 */
async function getEmbeddingBatch(texts, opts = {}) {
  const total = texts.length;
  const onProgress = opts.onProgress;
  if (!Array.isArray(texts) || total === 0) return [];
  const list = [];
  const size = PROVIDER === 'local' ? LOCAL_BATCH_SIZE : BATCH_SIZE;
  const delay = PROVIDER === 'local' ? LOCAL_BATCH_DELAY_MS : BATCH_DELAY_MS;
  for (let i = 0; i < texts.length; i += size) {
    if (i > 0 && delay > 0) await new Promise((r) => setTimeout(r, delay));
    const batch = texts.slice(i, i + size);
    const embeddings = PROVIDER === 'local'
      ? await getEmbeddingLocalBatch(batch)
      : await getEmbeddingOpenAIBatch(batch);
    list.push(...embeddings);
    if (onProgress) onProgress({ current: Math.min(i + size, total), total });
  }
  return list;
}

function getEmbeddingStatus() {
  return {
    provider: PROVIDER,
    openaiKeySet: Boolean(OPENAI_KEY),
    localUrl: LOCAL_URL,
    dimensions: DIMENSIONS,
  };
}

/** Gợi ý cấu hình khi getEmbedding trả null (hiển thị API / log). */
function getEmbeddingFailureHint() {
  if (PROVIDER === 'local') {
    return (
      `Đang dùng EMBEDDING_PROVIDER=local → cần chạy embedding-service tại ${LOCAL_URL}. ` +
      'Trong thư mục services/embedding-service: pip install -r requirements.txt rồi python app.py. ' +
      'Sau đó restart document-service. ' +
      'Hoặc thêm OPENAI_API_KEY vào services/document-service/.env và đặt EMBEDDING_PROVIDER=openai.'
    );
  }
  return (
    'Đang dùng OpenAI embedding → cần OPENAI_API_KEY (OpenAI API, không dùng được GEMINI_API_KEY thay thế). ' +
    'Đặt trong services/document-service/.env hoặc services/chat-service/.env rồi restart document-service. ' +
    'Nếu chỉ có Gemini cho chat: thêm key OpenAI riêng cho embed, hoặc chạy embedding-service local (EMBEDDING_PROVIDER=local).'
  );
}

module.exports = {
  getEmbedding,
  getEmbeddingBatch,
  DIMENSIONS,
  isLocal: PROVIDER === 'local',
  getEmbeddingStatus,
  getEmbeddingFailureHint,
};
