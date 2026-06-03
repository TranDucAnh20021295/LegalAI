/**
 * Detect and split appendix / catalog / table / code-list blocks from article content.
 */

const MARKER_PATTERNS = [
  { type: 'appendix', pattern: /(?:^|\n)\s*PHỤ\s*LỤC\b/i, label: 'PHỤ LỤC' },
  { type: 'catalog', pattern: /(?:^|\n)\s*DANH\s*MỤC\b/i, label: 'DANH MỤC' },
  { type: 'catalog', pattern: /(?:^|\n)\s*BIỂU\s*THUẾ\b/i, label: 'BIỂU THUẾ' },
  { type: 'table', pattern: /(?:^|\n)\s*BIỂU\b/i, label: 'BIỂU' },
  { type: 'table', pattern: /<table[\s>]/i, label: '<table>' },
  { type: 'code_list', pattern: /(?:^|\n)\s*Mã\s*hàng\b/i, label: 'Mã hàng' },
  { type: 'code_list', pattern: /(?:^|\n)\s*Mã\s*HS\b/i, label: 'Mã HS' },
  { type: 'code_list', pattern: /Mô\s*tả\s*hàng\s*hoá|Mô\s*tả\s*hàng\s*hóa/i, label: 'Mô tả hàng hóa' },
  { type: 'code_list', pattern: /Thuế\s*suất\s*\(\s*%\s*\)/i, label: 'Thuế suất (%)' },
];

const SIGNATURE_PATTERN = /(?:^|\n)\s*Nơi\s*nhận\s*:/i;

function wordCount(text) {
  return String(text || '').split(/\s+/).filter(Boolean).length;
}

function normLine(line) {
  return String(line || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lines that look like HS / tariff table rows */
function isCodeTableLine(line) {
  const s = normLine(line);
  if (!s || s.length < 4) return false;
  if (/^\d{4}\.\d{2}(\.\d{2})?(\.\d{2})?\b/.test(s)) return true;
  if (/^[0-9]{2,4}\.[0-9]{2}/.test(s) && /\d+\s*$/.test(s)) return true;
  if (/^[│|]/.test(s) && s.split(/[│|]/).length >= 3) return true;
  return false;
}

function findEarliestMarker(content) {
  let best = null;
  for (const m of MARKER_PATTERNS) {
    const match = content.match(m.pattern);
    if (!match || match.index == null) continue;
    const pos = match.index;
    if (!best || pos < best.pos) {
      best = { pos, type: m.type, marker: m.label, pattern: m.pattern };
    }
  }
  return best;
}

/** Dense code-table block without explicit header */
function findCodeTableBlock(content, opts = {}) {
  const aggressive = Boolean(opts.aggressive);
  const lines = content.split(/\r?\n/);
  let codeLines = 0;
  let firstIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isCodeTableLine(lines[i])) {
      codeLines += 1;
      if (firstIdx < 0) firstIdx = i;
    }
  }
  const minCodeLines = aggressive ? 5 : 8;
  if (codeLines < minCodeLines || firstIdx < 0) return null;
  const ratio = codeLines / Math.max(lines.length, 1);
  if (ratio < (aggressive ? 0.08 : 0.15)) return null;
  let pos = 0;
  for (let i = 0; i < firstIdx; i++) {
    pos += lines[i].length + 1;
  }
  const wordsBefore = wordCount(content.slice(0, pos));
  const minWordsBefore = aggressive ? 0 : 50;
  if (wordsBefore < minWordsBefore) return null;
  return { pos, type: 'code_list', marker: 'dense_code_table' };
}

function findSignatureSplit(content, opts = {}) {
  const aggressive = Boolean(opts.aggressive);
  const match = content.match(SIGNATURE_PATTERN);
  if (!match || match.index == null) return null;
  const pos = match.index;
  const ratio = pos / Math.max(content.length, 1);
  const wordsBefore = wordCount(content.slice(0, pos));
  if (aggressive) {
    if (ratio < 0.08 || wordsBefore < 25) return null;
  } else if (ratio < 0.35 || wordsBefore < 80) {
    return null;
  }
  return { pos, type: 'signature_block', marker: 'Nơi nhận:' };
}

/** Marker after minPos (skip header-only false positives at doc start) */
function findEarliestMarkerAfter(content, minPos = 0) {
  let best = null;
  for (const m of MARKER_PATTERNS) {
    const pattern = minPos > 0
      ? new RegExp(m.pattern.source.replace('^', ''), m.pattern.flags)
      : m.pattern;
    const hay = minPos > 0 ? content.slice(minPos) : content;
    const match = hay.match(pattern);
    if (!match || match.index == null) continue;
    const pos = (minPos > 0 ? minPos : 0) + match.index;
    if (!best || pos < best.pos) {
      best = { pos, type: m.type, marker: m.label };
    }
  }
  return best;
}

function isToanVanTitle(title) {
  return /^toàn\s*văn$/i.test(String(title || '').trim()) || /^toan\s*van$/i.test(String(title || '').trim());
}

/**
 * @param {string} content
 * @param {{ aggressive?: boolean, minCleanWords?: number }} [options]
 * @returns {{ cleaned: string, attachment: object|null, skippedReason?: string }}
 */
function splitAttachments(content, options = {}) {
  const aggressive = Boolean(options.aggressive);
  const minCleanWords = options.minCleanWords != null
    ? options.minCleanWords
    : aggressive
      ? 3
      : 10;
  const raw = String(content || '').trim();
  if (!raw) return { cleaned: '', attachment: null };

  let split = findEarliestMarker(raw);
  const sig = findSignatureSplit(raw, { aggressive });
  if (sig && (!split || sig.pos < split.pos)) split = sig;

  if (!split) {
    const codeBlock = findCodeTableBlock(raw, { aggressive });
    if (codeBlock) split = codeBlock;
  }

  // Aggressive: marker sớm ở đầu văn bản — thử marker/bảng sau đoạn mở đầu
  if (aggressive && split && split.pos < 800 && wordCount(raw) > 2000) {
    const later = findEarliestMarkerAfter(raw, 400);
    const laterCode = findCodeTableBlock(raw.slice(400), { aggressive });
    let laterSplit = later;
    if (laterCode) {
      const codePos = 400 + laterCode.pos;
      if (!laterSplit || codePos < laterSplit.pos) {
        laterSplit = { ...laterCode, pos: codePos };
      }
    }
    if (laterSplit && laterSplit.pos > split.pos) split = laterSplit;
  }

  if (!split || split.pos <= 0) {
    if (aggressive && isToanVanTitle(options.title)) {
      const codeOnly = findCodeTableBlock(raw, { aggressive: true });
      if (codeOnly) split = codeOnly;
    }
    if (!split || split.pos <= 0) {
      return { cleaned: raw, attachment: null, skippedReason: 'no_split_point' };
    }
  }

  if (aggressive && split.pos <= 0) {
    const nl = raw.indexOf('\n');
    const stubEnd = nl > 0 ? nl + 1 : Math.min(400, raw.length);
    split = { ...split, pos: stubEnd };
  }

  const cleaned = raw.slice(0, split.pos).trim();
  const attachContent = raw.slice(split.pos).trim();
  if (!attachContent || wordCount(attachContent) < 5) {
    return { cleaned: raw, attachment: null, skippedReason: 'empty_attachment' };
  }

  const cleanWords = wordCount(cleaned);
  const attachWords = wordCount(attachContent);

  if (cleanWords < minCleanWords) {
    if (aggressive && attachWords >= 200) {
      const stub = cleaned || raw.slice(0, Math.min(500, raw.length)).trim();
      return {
        cleaned: stub,
        attachment: {
          attachment_type: split.type,
          marker: split.marker,
          title: attachContent.slice(0, 200).replace(/\s+/g, ' '),
          content: attachContent,
          word_count: attachWords,
        },
      };
    }
    return { cleaned: raw, attachment: null, skippedReason: 'cleaned_too_short' };
  }

  return {
    cleaned,
    attachment: {
      attachment_type: split.type,
      marker: split.marker,
      title: attachContent.slice(0, 200).replace(/\s+/g, ' '),
      content: attachContent,
      word_count: attachWords,
    },
  };
}

function hasAttachmentSignals(content) {
  const raw = String(content || '');
  if (!raw) return false;
  if (findEarliestMarker(raw)) return true;
  if (findSignatureSplit(raw)) return true;
  if (findCodeTableBlock(raw)) return true;
  return false;
}

module.exports = {
  splitAttachments,
  hasAttachmentSignals,
  wordCount,
  MARKER_PATTERNS,
};
