'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authAPI, documentAPI, chatAPI } from '@/lib/api';
import { vbplHref } from '@/lib/vbpl';
import { getUserToken, clearUserToken } from '@/lib/auth-storage';
import shell from '../dashboard-shell.module.css';
import styles from './page.module.css';

function parseMarkdownToHtml(text) {
  if (!text) return '';
  let s = String(text);
  // Nếu đã có tag HTML thì pass-through, không double-encode
  // Chỉ xử lý Markdown bên ngoài thẻ HTML
  const parts = [];
  const tagRe = /(<(?:table|tr|td|th|tbody|thead|colgroup|col|p|ul|ol|li|div|br|hr|h[1-6]|strong|em|span)[^>]*>[\s\S]*?<\/(?:table|tr|td|th|tbody|thead|colgroup|p|ul|ol|li|div|h[1-6]|strong|em|span)>|<br\s*\/?>|<hr\s*\/>)/gi;
  let lastIndex = 0;
  let match;
  while ((match = tagRe.exec(s)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'md', text: s.slice(lastIndex, match.index) });
    parts.push({ type: 'html', text: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < s.length) parts.push({ type: 'md', text: s.slice(lastIndex) });

  return parts.map(({ type, text: t }) => {
    if (type === 'html') return t;
    let m = t;
    m = m.replace(/^(#{1,6})\s+(.*)$/gm, (_, hashes, content) => `<h${hashes.length} style="color:#e2e8f0;margin:1em 0 .5em;font-weight:700">${content}</h${hashes.length}>`);
    m = m.replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>');
    m = m.replace(/\*([^\*\n]+?)\*/g, '<em>$1</em>');
    m = m.replace(/\n/g, '<br>');
    return m;
  }).join('');
}

export default function DocumentsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [searchIn, setSearchIn] = useState('title');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [touchedSearch, setTouchedSearch] = useState(false);
  const [detail, setDetail] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const settingsRef = useRef(null);
  const abortRef = useRef(null);
  const [conversations, setConversations] = useState([]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) setSettingsMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!getUserToken()) { router.push('/'); return; }
    authAPI.getMe().then(setUser).catch(() => { clearUserToken(); router.push('/'); }).finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!user) return;
    chatAPI.listConversations().then(setConversations).catch(() => setConversations([]));
  }, [user]);

  // Live search theo debounce
  useEffect(() => {
    const q = keyword.trim();
    if (!q || q.length < 2) {
      setResults([]);
      setTouchedSearch(false);
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setSearching(true);
    setTouchedSearch(true);
    setSearchError('');
    const timer = setTimeout(async () => {
      try {
        const rows = await documentAPI.search(q, 50, searchIn, false, { signal: abortRef.current?.signal });
        const list = Array.isArray(rows) ? rows : [];
        setResults(
          list.map((d) => ({
            rowKey: d.documentId,
            documentId: d.documentId,
            title: d.title,
            documentNumber: d.documentNumber,
            documentType: d.documentType,
            field: d.field,
          }))
        );
      } catch (err) {
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        setResults([]);
        setSearchError(err.response?.data?.message || 'Không thể tra cứu. Thử lại sau.');
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [keyword, searchIn]);

  const handleSearch = async () => {
    const q = keyword.trim();
    if (!q) { setSearchError('Vui lòng nhập nội dung cần tra cứu.'); setResults([]); return; }
    setSearchError('');
    setTouchedSearch(true);
    setSearching(true);
    try {
      const rows = await documentAPI.search(q, 50, searchIn);
      const list = Array.isArray(rows) ? rows : [];
      setResults(
        list.map((d) => ({
          rowKey: d.documentId,
          documentId: d.documentId,
          title: d.title,
          documentNumber: d.documentNumber,
          documentType: d.documentType,
          field: d.field,
        }))
      );
    } catch (err) {
      setResults([]);
      setSearchError(err.response?.data?.message || 'Không thể tra cứu. Thử lại sau.');
    } finally {
      setSearching(false);
    }
  };

  const handleViewDetail = async (documentId) => {
    try {
      const doc = await documentAPI.getDetail(documentId);
      setDetail(doc);
    } catch (err) {
      setDetail(null);
    }
  };

  const handleLogout = async () => {
    await authAPI.logout();
    clearUserToken();
    router.push('/');
  };

  if (loading) {
    return <div className={shell.loadingCenter}>Đang tải...</div>;
  }

  const sb = sidebarCollapsed;

  return (
    <div className={shell.layoutRoot}>
      <aside className={`${shell.sidebar} ${sb ? shell.sidebarNarrow : ''}`}>
        <div className={`${shell.sidebarHeader} ${sb ? shell.sidebarHeaderNarrow : ''}`}>
          {!sb && (
            <Link href="/dashboard" className={shell.brandLink}>
              LegalAI
            </Link>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sb)}
            className={`${shell.collapseBtn} ${sb ? shell.collapseBtnNarrow : ''}`}
            title={sb ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`${shell.chevron} ${sb ? shell.chevronRotated : ''}`}
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>

        <Link
          href="/dashboard"
          className={`${shell.sideNavItem} ${sb ? shell.sideNavItemNarrow : ''}`}
          title="Trò chuyện mới"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={shell.iconShrink}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          {!sb && 'Trò chuyện mới'}
        </Link>

        <Link
          href="/dashboard/documents"
          className={sb ? shell.sideNavItemDocsNarrow : shell.sideNavItemDocs}
          title="Tra cứu văn bản/án lệ"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={shell.iconShrink}>
            <path d="M12 3v18M8 21h8M10 21V9l2-4 2 4v12M8 9l4-6 4 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {!sb && 'Tra cứu văn bản/án lệ'}
        </Link>

        {!sb && (
          <div className={shell.historySection}>
            <div className={shell.historyLabel}>Lịch sử trò chuyện</div>
            {conversations.length === 0 ? (
              <div className={shell.emptyConvWrap}>
                <div className={shell.emptyConvInner}>
                  <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={shell.emptyConvIcon}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <p className={shell.emptyConvTitle}>Chưa có phiên làm việc nào</p>
                  <p className={shell.emptyConvHint}>Bấm &quot;Trò chuyện mới&quot; để bắt đầu</p>
                </div>
              </div>
            ) : (
              <div className={shell.convList}>
                {conversations.map((c) => (
                  <Link key={c.conversationId} href="/dashboard" className={shell.convListLink} title={c.title}>
                    {c.title}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
        {sb && <div className={shell.sidebarFlexFill} />}

        <div ref={settingsRef} className={shell.settingsWrap}>
          <button
            type="button"
            onClick={() => setSettingsMenuOpen(!settingsMenuOpen)}
            className={`${shell.settingsBtn} ${sb ? shell.settingsBtnNarrow : ''}`}
            title="Cài đặt"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={shell.iconShrink}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            {!sb && 'Cài đặt'}
          </button>

          {settingsMenuOpen && (
            <div className={shell.settingsMenu}>
              <Link href="/dashboard/profile" onClick={() => setSettingsMenuOpen(false)} className={shell.settingsMenuLink}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                Hồ sơ cá nhân
              </Link>
              <Link href="/dashboard/change-password" onClick={() => setSettingsMenuOpen(false)} className={shell.settingsMenuLink}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                Đổi mật khẩu
              </Link>
              <button type="button" onClick={() => { setSettingsMenuOpen(false); handleLogout(); }} className={shell.settingsMenuButton}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className={styles.main}>
        <h1 className={styles.pageTitle}>Tra cứu văn bản pháp luật</h1>

        {searchError && <div className={styles.alertError}>{searchError}</div>}

        <div className={styles.searchRow}>
          <input
            type="text"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setSearchError('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder={searchIn === 'title' ? 'Nhập tiêu đề văn bản...' : 'Nhập số hiệu (vd: 109/2025/QH15)...'}
            className={styles.searchInput}
          />
          <button type="button" onClick={handleSearch} disabled={searching} className={styles.searchBtn}>
            {searching ? 'Đang tìm...' : 'Tìm kiếm'}
          </button>
        </div>
        <div className={styles.searchFilters}>
          <label className={styles.filterOption}>
            <input type="radio" name="adminSearchIn" value="title" checked={searchIn === 'title'} onChange={() => setSearchIn('title')} />
            Tiêu đề văn bản
          </label>
          <label className={styles.filterOption}>
            <input type="radio" name="adminSearchIn" value="number" checked={searchIn === 'number'} onChange={() => setSearchIn('number')} />
            Số hiệu văn bản
          </label>
        </div>

        <div className={styles.resultsScroll}>
          {results.length === 0 && !searching && (
            <div className={styles.emptyState}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.emptyIcon}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              {touchedSearch && !searchError ? <p>Không có kết quả. Thử từ khóa khác.</p> : <p>Nhập từ khóa rồi bấm tra cứu.</p>}
            </div>
          )}
          {results.length > 0 && (
            <div className={styles.resultList}>
              {results.map((doc) => (
                <div
                  key={doc.rowKey}
                  className={styles.resultCard}
                >
                  <div className={styles.resultTitleRow}>
                    <div className={styles.resultTitle}>{doc.title || doc.documentNumber || 'Không có tiêu đề'}</div>
                    <Link
                      href={vbplHref(doc.documentId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.viewDetailBtn}
                    >
                      Xem chi tiết →
                    </Link>
                  </div>
                  <div className={styles.resultMeta}>
                    {doc.documentNumber && <span>Số hiệu: {doc.documentNumber}</span>}
                    {doc.documentType && <span className={styles.metaGap}>Loại: {doc.documentType}</span>}
                    {doc.field && <span className={styles.metaGap}>Lĩnh vực: {doc.field}</span>}
                  </div>
                  {doc.contentPreview ? <p className={styles.preview}>{doc.contentPreview}</p> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {detail && (
        <div className={styles.modalBackdrop} onClick={() => setDetail(null)} role="presentation">
          <div className={styles.modalPanel} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{detail.title || 'Chi tiết văn bản'}</h2>
              <button type="button" onClick={() => setDetail(null)} className={styles.closeBtn} aria-label="Đóng">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className={styles.detailMeta}>
              {detail.documentNumber && <div>Số hiệu: {detail.documentNumber}</div>}
              {detail.documentType && <div>Loại văn bản: {detail.documentType}</div>}
              {detail.issuingAuthority && <div>Cơ quan ban hành: {detail.issuingAuthority}</div>}
              {detail.issueDate && <div>Ngày ban hành: {new Date(detail.issueDate).toLocaleDateString('vi-VN')}</div>}
              {detail.effectiveDate && <div>Ngày hiệu lực: {new Date(detail.effectiveDate).toLocaleDateString('vi-VN')}</div>}
              {detail.status && <div>Trạng thái: {detail.status}</div>}
              {detail.field && <div>Lĩnh vực: {detail.field}</div>}
            </div>
            <div 
              className={styles.detailBody} 
              dangerouslySetInnerHTML={{ __html: parseMarkdownToHtml(detail.content) }} 
            />
          </div>
        </div>
      )}
    </div>
  );
}
