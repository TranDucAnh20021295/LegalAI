/** Ghép documentId từ segment URL (id có dấu / như Luật 01/2026/QH16). */
export function resolveDocumentIdFromParams(param) {
  if (!param) return '';
  const parts = Array.isArray(param) ? param : [param];
  return parts
    .map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    })
    .join('/')
    .trim();
}

/** Đường dẫn trang chi tiết VBPL (một segment, encode cả dấu /). */
export function vbplHref(documentId) {
  const id = String(documentId || '').trim();
  if (!id) return '/vbpl';
  return `/vbpl/${encodeURIComponent(id)}`;
}
