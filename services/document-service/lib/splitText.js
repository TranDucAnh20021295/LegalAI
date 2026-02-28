function splitTextIntoChunks(text, chunkSize, overlap) {
  if (!text || typeof text !== 'string') return [];
  const size = chunkSize || 600;
  const ov = overlap || 100;
  const cleaned = text.trim();
  if (!cleaned) return [];
  const chunks = [];
  let start = 0;
  while (start < cleaned.length) {
    let end = start + size;
    if (end < cleaned.length) {
      const slice = cleaned.slice(start, end);
      const lastSpace = slice.lastIndexOf(' ');
      const lastNewline = slice.lastIndexOf('\n');
      const breakAt = Math.max(lastSpace, lastNewline, Math.floor(slice.length * 0.8));
      if (breakAt > size / 2) end = start + breakAt + 1;
    }
    const chunk = cleaned.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    start = end - ov;
    if (start >= cleaned.length) break;
  }
  return chunks;
}

module.exports = { splitTextIntoChunks };
