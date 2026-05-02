function splitTextIntoChunks(text, chunkSize = 1500, overlap = 200) {
  if (!text || typeof text !== 'string') return [];
  const cleaned = text.trim();
  if (!cleaned) return [];
  
  // Tách theo xuống dòng (\n) hoặc dấu câu (. ! ?) có kèm khoảng trắng/xuống dòng
  // Cách này đảm bảo không cắt ngang giữa câu (trừ khi một câu quá dài)
  const segments = cleaned.match(/[^.!?\n]+[.!?\n]*/g) || [cleaned];
  
  const chunks = [];
  let currentChunk = [];
  let currentLength = 0;

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i].trim();
    if (!s) continue;
    
    // Nếu một câu / đoạn quá dài so với chunkSize thì bắt buộc phải cắt cứng
    if (s.length > chunkSize) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n'));
        currentChunk = [];
        currentLength = 0;
      }
      let start = 0;
      while (start < s.length) {
        let end = start + chunkSize;
        // Lùi lại tìm dấu cách gần nhất để cắt cho đẹp chữ
        if (end < s.length) {
           const spaceIdx = s.lastIndexOf(' ', end);
           if (spaceIdx > start + chunkSize / 2) end = spaceIdx;
        }
        chunks.push(s.slice(start, end).trim());
        start = end - overlap;
        if (start >= s.length) break;
      }
      continue;
    }

    if (currentLength + s.length + 1 > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n'));
      
      // Giữ lại phần overlap từ các câu cuối của chunk trước
      let overlapLength = 0;
      const overlapChunk = [];
      for (let j = currentChunk.length - 1; j >= 0; j--) {
        if (overlapLength + currentChunk[j].length <= overlap) {
          overlapChunk.unshift(currentChunk[j]);
          overlapLength += currentChunk[j].length + 1;
        } else {
          break;
        }
      }
      currentChunk = [...overlapChunk, s];
      currentLength = overlapLength + s.length + 1;
    } else {
      currentChunk.push(s);
      currentLength += s.length + 1;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n'));
  }

  return chunks.map(c => c.trim()).filter(Boolean);
}

module.exports = { splitTextIntoChunks };
