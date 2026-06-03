/**
 * Parent-Child structural chunking by Khoản / Điểm.
 */

const { splitTextIntoChunks } = require('./splitText');

function norm(line) {
  return String(line || '')
    .replace(/\\\./g, '.')
    .replace(/\*\*/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(text) {
  return String(text || '').split(/\s+/).filter(Boolean).length;
}

/**
 * Split content into structural children (intro, khoan-N, diem-x).
 * @returns {{ label: string, text: string, words: number }[]}
 */
function splitStructural(content) {
  const lines = String(content || '').split(/\r?\n/);
  const children = [];
  let cur = [];
  let label = 'intro';

  const flush = () => {
    const text = cur.join('\n').trim();
    if (text) children.push({ label, text, words: wordCount(text) });
    cur = [];
  };

  for (const raw of lines) {
    const clean = norm(raw);
    if (!clean) continue;
    const khoan = clean.match(/^(\d+)\.\s+/);
    const diem = clean.match(/^([a-zđ])\)\s+/i);
    if ((khoan || diem) && cur.length) {
      flush();
      label = khoan ? `khoan-${khoan[1]}` : `diem-${diem[1].toLowerCase()}`;
    }
    cur.push(clean);
  }
  flush();
  return children;
}

const DEFAULT_MAX_CHILD_WORDS = 650;

/**
 * Split oversized structural children with sentence-level fallback.
 */
function splitOversizedChild(child, maxWords = DEFAULT_MAX_CHILD_WORDS) {
  if (child.words <= maxWords) return [child];
  const sub = splitTextIntoChunks(child.text, Math.min(1200, maxWords * 6), 100);
  return sub.map((text, i) => ({
    label: `${child.label}-part${i + 1}`,
    text,
    words: wordCount(text),
  }));
}

/**
 * Full PR-CH split for long articles.
 */
function splitParentChild(content, options = {}) {
  const maxChildWords = options.maxChildWords || DEFAULT_MAX_CHILD_WORDS;
  const minChildren = options.minChildren || 2;
  const structural = splitStructural(content);

  if (structural.length < minChildren) {
    return null;
  }

  const flat = [];
  for (const child of structural) {
    flat.push(...splitOversizedChild(child, maxChildWords));
  }

  if (flat.length < minChildren) return null;
  return flat;
}

module.exports = {
  splitStructural,
  splitParentChild,
  splitOversizedChild,
  wordCount,
  norm,
};
