/**
 * Build embedding chunks for an article (full / PR-CH).
 */

const {
  splitParentChild,
  splitStructural,
  splitOversizedChild,
  wordCount,
} = require('./structuralSplit');
const { hasAttachmentSignals } = require('./attachmentDetect');

const PRCH_MIN_WORDS = Number(process.env.PRCH_MIN_WORDS || 3000);
const PRCH_MIN_CHARS = Number(process.env.PRCH_MIN_CHARS || 12000);
const EMBED_SAFE_CHARS = Number(process.env.EMBED_SAFE_CHARS || 24000);

function mapStructuralChildren(children, article, titlePrefix) {
  const { id, documentid } = article;
  return children.map((child, chunkNo) => ({
    chunkIndex: id,
    chunkNo,
    chunkType: 'article_child',
    parentArticleId: id,
    structuralLabel: child.label,
    exactContent: child.text,
    textToEmbed: `${titlePrefix}[${child.label}] ${child.text}`,
    documentId: documentid,
  }));
}

/** Structural split for long texts that cannot be embedded as a single article_full. */
function splitLongTextStructurally(text) {
  const structural = splitStructural(text);
  const flat = [];
  for (const child of structural) {
    flat.push(...splitOversizedChild(child, 500));
  }
  return flat.length >= 2 ? flat : null;
}

/**
 * @param {{ id: number, documentid: string, title: string, content: string }} article
 * @returns {Array<{ chunkIndex: number, chunkNo: number, chunkType: string, parentArticleId: number, structuralLabel?: string, exactContent: string, textToEmbed: string }>}
 */
function buildChunksForArticle(article) {
  const { id, documentid, title, content } = article;
  const text = String(content || '').trim();
  if (!text) return [];

  const words = wordCount(text);
  const titlePrefix = title ? `${title}: ` : '';

  const usePrCh =
    (words >= PRCH_MIN_WORDS || text.length >= PRCH_MIN_CHARS) &&
    !hasAttachmentSignals(text);

  if (usePrCh) {
    const children = splitParentChild(text);
    if (children && children.length >= 2) {
      return mapStructuralChildren(children, article, titlePrefix);
    }
  }

  if (text.length > EMBED_SAFE_CHARS) {
    const children = splitParentChild(text) || splitLongTextStructurally(text);
    if (children && children.length >= 2) {
      return mapStructuralChildren(children, article, titlePrefix);
    }
  }

  return [
    {
      chunkIndex: id,
      chunkNo: 0,
      chunkType: 'article_full',
      parentArticleId: id,
      structuralLabel: 'full',
      exactContent: text,
      textToEmbed: `${titlePrefix}${text}`,
      documentId: documentid,
    },
  ];
}

/** Query hints for attachment-aware retrieval */
function queryWantsAttachments(query) {
  const q = String(query || '').toLowerCase();
  return /(mã hàng|mã hs|thuế suất|danh mục|phụ lục|biểu thuế|biểu |hs code|tariff)/i.test(q);
}

module.exports = {
  buildChunksForArticle,
  queryWantsAttachments,
  PRCH_MIN_WORDS,
};
