'use client';

import { useMemo, useState, useEffect, useCallback, Fragment, createElement } from 'react';
import Link from 'next/link';
import styles from './ChatAiMessage.module.css';
import { documentAPI } from '@/lib/api';
import { vbplHref } from '@/lib/vbpl';

function parseMetadata(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw;
  return null;
}

function normalizeSource(s) {
  if (!s || typeof s !== 'object') return null;
  const excerpt = String(s.excerpt ?? s.contentChunk ?? s.content ?? '');
  const documentNumber = s.documentNumber ?? s.document_number ?? null;
  return {
    ...s,
    index: typeof s.index === 'number' ? s.index : 0,
    excerpt,
    documentNumber: documentNumber != null ? String(documentNumber).trim() || null : null,
    title: s.title ?? s.documentTitle ?? null,
    documentType: s.documentType ?? s.document_type ?? null,
    documentId: s.documentId ?? s.document_id ?? null,
    chunkId: s.chunkId ?? s.chunk_id ?? null,
  };
}

function sourceRowLabel(row) {
  const t = row.title ? String(row.title).trim() : '';
  const n = row.documentNumber ? String(row.documentNumber).trim() : '';
  return t && n ? `${t} (${n})` : t || n || 'Văn bản pháp luật';
}

/** Gộp theo documentId; nếu thiếu id thì gộp theo (số hiệu + tiêu đề). */
function buildDisplaySources(sources) {
  const map = new Map();
  for (const s of sources) {
    const title = s.title ? String(s.title).trim() : '';
    const num = s.documentNumber ? String(s.documentNumber).trim() : '';
    const id =
      s.documentId ||
      (num && title ? `${num}\0${title.toLowerCase()}` : null) ||
      (num || null) ||
      s.chunkId ||
      `idx-${s.index}`;
    if (!map.has(id)) {
      map.set(id, {
        key: String(id),
        documentId: s.documentId,
        title: s.title,
        documentNumber: s.documentNumber,
        documentType: s.documentType,
        excerpts: [],
      });
    }
    const row = map.get(id);
    if (s.excerpt) row.excerpts.push(s.excerpt);
  }
  const rows = [...map.values()].map((row) => {
    const excerpt = row.excerpts.filter(Boolean).join('\n\n—\n\n');
    return { ...row, excerpt, label: sourceRowLabel({ ...row, excerpt }) };
  });

  /** Cùng số hiệu nhưng khác documentId/chunk (dữ liệu trùng) → một dòng nguồn. */
  const byNum = new Map();
  const noNum = [];
  for (const row of rows) {
    const nk = row.documentNumber ? String(row.documentNumber).trim().toLowerCase() : '';
    if (!nk) {
      noNum.push(row);
      continue;
    }
    if (!byNum.has(nk)) {
      byNum.set(nk, { ...row });
    } else {
      const p = byNum.get(nk);
      p.excerpt = [p.excerpt, row.excerpt].filter(Boolean).join('\n\n—\n\n');
      if (!p.documentId && row.documentId) p.documentId = row.documentId;
      const tPrev = p.title ? String(p.title).trim() : '';
      const tNew = row.title ? String(row.title).trim() : '';
      if (tNew && (!tPrev || tNew.length > tPrev.length)) p.title = row.title;
      p.label = sourceRowLabel(p);
    }
  }
  return [...byNum.values(), ...noNum].map((row) => ({
    ...row,
    key: String(row.documentId || row.documentNumber || row.key),
    label: sourceRowLabel(row),
  }));
}

function cleanDisplayText(text) {
  return String(text || '')
    .replace(/【CITE:\d+】[\s\S]*?【\/CITE】/g, (m) => m.replace(/【CITE:\d+】|【\/CITE】/g, '').trim())
    .replace(/\{\{\s*REF\s*:\s*\d+\s*\}\}/g, '');
}

/**
 * Markdown list: dòng bắt đầu (sau thụt lề) bằng * hoặc - + khoảng trắng → dấu đầu dòng •
 * Không đụng tới ** vì sau * phải có khoảng trắng, không phải ký tự * thứ hai.
 */
function normalizeMarkdownListMarkers(text) {
  return String(text || '')
    .replace(/(^|\n)([ \t]*)\*\s+/g, '$1$2• ')
    .replace(/(^|\n)([ \t]*)-\s+/g, '$1$2• ');
}

/** Gemini/OpenAI hay trả markdown **in đậm** — hiển thị thành <strong>, không để lộ dấu *. */
/** 
 * Render Bold/Italic Markdown thành React elements.
 * Hỗ trợ: **bold**, *italic*, __bold__, _italic_ và dọn dẹp ký tự thừa.
 */
function renderMarkdownInline(text) {
  const s = String(text ?? '');
  if (!s) return '';

  // 1. Xử lý Bold (** hoặc __)
  // 2. Xử lý Italic (* hoặc _)
  // 3. Dọn dẹp artifact
  
  // Để render React elements từ regex, ta split chuỗi
  // Ở đây ta làm đơn giản bằng cách replace sang một placeholder rồi split
  let processed = s;
  
  // Dùng các marker tạm thời để tránh xung đột khi split
  // Bold
  processed = processed.replace(/\*\*([^\n]+?)\*\*/g, '\0B$1\0');
  processed = processed.replace(/__([^\n]+?)__/g, '\0B$1\0');
  // Italic
  processed = processed.replace(/\*([^\n]+?)\*/g, '\0I$1\0');
  processed = processed.replace(/_([^\n]+?)_/g, '\0I$1\0');
  
  // Dọn dẹp các ký tự Markdown lẻ loi
  processed = processed.replace(/[\*_]{2,}/g, '');

  const parts = processed.split('\0');
  return parts.map((part, i) => {
    if (part.startsWith('B')) {
      return <strong key={i} className={styles.mdStrong}>{part.slice(1)}</strong>;
    }
    if (part.startsWith('I')) {
      return <em key={i} className={styles.mdItalic}>{part.slice(1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}


const MD_HEADING_CLASS = [
  styles.mdH1,
  styles.mdH2,
  styles.mdH3,
  styles.mdH4,
  styles.mdH5,
  styles.mdH6,
];

/**
 * Dòng bắt đầu bằng # … ###### + khoảng trắng = tiêu đề markdown (### = cấp 3).
 * Gom các dòng liên tục không phải heading thành một khối (giữ xuống dòng + ** đậm).
 */
function renderMarkdownBlocks(text) {
  const s = String(text ?? '');
  const lines = s.split('\n');
  const out = [];
  let para = [];
  let k = 0;
  const headingRe = /^(\s*)(#{1,6})\s+(.*)$/;
  const quoteRe = /^>\s*(.*)$/;

  const flushPara = () => {
    if (!para.length) return;
    const joined = para.join('\n');
    out.push(
      <div key={`blk-${k++}`} className={styles.mdBlock}>
        {renderMarkdownInline(joined)}
      </div>
    );
    para = [];
  };

  for (const line of lines) {
    const mh = line.match(headingRe);
    const mq = line.match(quoteRe);

    if (mh) {
      flushPara();
      const level = Math.min(Math.max(mh[2].length, 1), 6);
      const titleText = mh[3];
      const tag = `h${level}`;
      const cls = MD_HEADING_CLASS[level - 1] || styles.mdH3;
      out.push(createElement(tag, { key: `h-${k++}`, className: cls }, renderMarkdownInline(titleText)));
    } else if (mq) {
      flushPara();
      out.push(
        <blockquote key={`q-${k++}`} className={styles.mdQuote}>
          {renderMarkdownInline(mq[1])}
        </blockquote>
      );
    } else {
      para.push(line);
    }
  }
  flushPara();
  return out.length > 0 ? out : renderMarkdownInline(s);
}



/** Gỡ mở bài kiểu chào / “dựa trên thông tin…” (tin cũ hoặc model còn sót). */
function stripBoilerplateLead(text) {
  let s = String(text || '').replace(/^\uFEFF/, '').trimStart();
  const leadRes = [
    /^chào bạn[,.!]?\s*/i,
    /^xin chào[,.!]?\s*/i,
    /^dựa trên thông tin được cung cấp[,.]?\s*/i,
    /^dựa trên các?\s*(thông tin|tài liệu)[^.\n]*[,.]?\s*/i,
    /^theo thông tin[^.\n]*[,.]?\s*/i,
    /^tôi là trợ lý pháp lý[^.]*\.\s*/i,
    /^tôi xin (trình bày|phân tích)[^.]*[,.]?\s*/i,
  ];
  for (let pass = 0; pass < 5; pass++) {
    let hit = false;
    for (const re of leadRes) {
      const next = s.replace(re, '').trimStart();
      if (next !== s) {
        s = next;
        hit = true;
      }
    }
    if (!hit) break;
  }
  return s;
}

function foldMatch(s) {
  return String(s || '')
    .replace(/\*\*/g, '')
    .toLocaleLowerCase('vi')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Có trong câu trả lời: số hiệu, tiêu đề, hoặc dạng ghép — để chỉ liệt kê nguồn thực sự được nhắc tới. */
function sourceCitedInAnswer(answerText, row) {
  const a = foldMatch(answerText);
  if (!a) return false;
  const n = row.documentNumber ? foldMatch(String(row.documentNumber)) : '';
  const t = row.title ? String(row.title).trim() : '';
  const tFold = t ? foldMatch(t) : '';
  if (n && a.includes(n)) return true;
  if (tFold.length >= 6 && a.includes(tFold)) return true;
  if (t && row.documentNumber) {
    const num = String(row.documentNumber).trim();
    if (a.includes(foldMatch(`${t} (${num})`))) return true;
    if (a.includes(foldMatch(`${t} số ${num}`))) return true;
  }
  if (tFold.length > 48) {
    const head = tFold.slice(0, 48).trim();
    if (head.length >= 12 && a.includes(head)) return true;
  }
  const labelFold = foldMatch(row.label || '');
  if (labelFold.length >= 8 && a.includes(labelFold)) return true;
  return false;
}

/** Chỉ giữ văn bản mà nội dung phía trên có nhắc tới; một nguồn duy nhất → luôn hiển thị. */
function filterSourcesCitedInAnswer(answerText, displaySources) {
  if (!displaySources.length) return [];
  if (displaySources.length === 1) return displaySources;
  return displaySources.filter((row) => sourceCitedInAnswer(answerText, row));
}

export default function ChatAiMessage({ content, metadata, isNew, hideSources = false }) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [isTyping, setIsTyping] = useState(!!isNew);

  // Hiệu ứng "gõ chữ" (Typing Effect)
  useEffect(() => {
    if (!content) return;
    
    // Nếu không phải tin nhắn mới (load từ lịch sử) -> hiển thị ngay lập tức
    if (!isNew) {
      setDisplayedContent(content);
      setIsTyping(false);
      return;
    }
    
    let index = 0;
    const speed = 10; 
    const charsPerTick = 3; 
    
    setDisplayedContent('');
    setIsTyping(true);

    const timer = setInterval(() => {
      index += charsPerTick;
      if (index >= content.length) {
        setDisplayedContent(content);
        setIsTyping(false);
        clearInterval(timer);
      } else {
        setDisplayedContent(content.slice(0, index));
      }
    }, speed);

    return () => clearInterval(timer);
  }, [content, isNew]);

  // Tự động cuộn xuống khi đang "gõ" chữ
  useEffect(() => {
    if (isTyping && typeof window !== 'undefined') {
      // Tìm container cuộn (dùng class từ module CSS của dashboard nếu có thể, hoặc query chung)
      const scrollArea = document.querySelector('[class*="chatScroll"]');
      if (scrollArea) {
        scrollArea.scrollTop = scrollArea.scrollHeight;
      }
    }
  }, [displayedContent, isTyping]);


  const sources = useMemo(() => {
    const meta = parseMetadata(metadata);
    const raw = meta?.ragSources ?? meta?.rag_sources;
    const arr = Array.isArray(raw) ? raw : [];
    return arr.map(normalizeSource).filter(Boolean);
  }, [metadata]);

  const displaySources = useMemo(() => buildDisplaySources(sources), [sources]);
  
  const displayText = useMemo(() => {
    const raw = stripBoilerplateLead(cleanDisplayText(displayedContent || ''));
    return normalizeMarkdownListMarkers(raw);
  }, [displayedContent]);

  const citedSources = useMemo(
    () => filterSourcesCitedInAnswer(displayText, displaySources),
    [displayText, displaySources]
  );


  const [panel, setPanel] = useState(null);

  const openSource = useCallback((row) => {
    if (row.documentId) {
      window.open(vbplHref(row.documentId), '_blank');
      return;
    }
    // Chỉ hiện modal cho các đoạn trích không có ID chính thức
    setPanel({
      phase: 'excerpt',
      label: row.label,
      documentId: null,
      title: row.title || row.label,
      documentNumber: row.documentNumber,
      documentType: row.documentType,
      body: row.excerpt || '—',
      fetchFailed: false,
    });
  }, []);

  const closePanel = useCallback(() => setPanel(null), []);

  return (
    <>
      <div className={styles.wrap}>
        <div className={styles.body}>
          {renderMarkdownBlocks(displayText)}
        </div>


        {!hideSources && citedSources.length > 0 && (
          <div className={styles.refFooter}>
            <span className={styles.refFooterLead}>Bạn có thể tham khảo nội dung sau đây: </span>
            {citedSources.map((d, i) => (
              <Fragment key={d.key}>
                {i > 0 && <span className={styles.refFooterSep}> · </span>}
                <button
                  type="button"
                  className={styles.refLink}
                  title="Xem toàn văn trong hệ thống"
                  onClick={() => openSource(d)}
                >
                  {d.label}
                </button>
              </Fragment>
            ))}
          </div>
        )}
      </div>

      {panel && (
        <div className={styles.backdrop} role="presentation" onClick={closePanel}>
          <div
            className={styles.panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rag-source-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.panelHead}>
              <h3 id="rag-source-title" className={styles.panelTitle}>
                {panel.phase === 'loading' ? panel.label : panel.title || panel.label}
              </h3>
              <button type="button" className={styles.closeBtn} onClick={closePanel} aria-label="Đóng">
                ×
              </button>
            </div>
            {panel.phase === 'loading' && (
              <p className={styles.loadingNote}>Đang tải toàn văn từ cơ sở dữ liệu…</p>
            )}
            {panel.phase !== 'loading' && (panel.documentNumber || panel.documentType) && (
              <p className={styles.meta}>
                {[
                  panel.documentNumber && `Số hiệu: ${panel.documentNumber}`,
                  panel.documentType && `Loại: ${panel.documentType}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
            {panel.phase !== 'loading' && panel.fetchFailed && (
              <p className={styles.warn}>
                Không tải được toàn văn; hiển thị đoạn đã dùng cho câu trả lời.
              </p>
            )}
            {panel.phase !== 'loading' && (
              <pre className={styles.excerpt}>{panel.body}</pre>
            )}
            {panel.phase === 'full' && panel.documentId ? (
              <div className={styles.panelFooter}>
                <Link href={vbplHref(panel.documentId)} target="_blank" className={styles.docLink}>
                  Xem toàn văn →
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
