'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { documentAPI } from '@/lib/api';
import { getUserToken } from '@/lib/auth-storage';
import styles from './detail.module.css';

/* ──────────────────────────────────────────
   Chuyển nội dung (HTML thô + Markdown) → HTML an toàn để render
   ────────────────────────────────────────── */
function contentToHtml(text) {
  if (!text) return '';
  let s = String(text);

  // Kiểm tra có thẻ HTML thực sự (table, td, p, div…)
  const hasHtml = /<(table|tr|td|th|tbody|thead|p|div|ul|ol|li|colgroup|col)\s/i.test(s)
               || /<(table|tr|td|th|tbody|thead|p|div|ul|ol|li|colgroup|col)>/i.test(s);

  if (hasHtml) {
    // Nội dung đã chứa HTML → pass-through, chỉ xử lý Markdown bên ngoài thẻ
    s = s.replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^\*\n]+?)\*/g, '<em>$1</em>');
    return s;
  }

  // Markdown thuần → convert
  s = s.replace(/^(#{1,6})\s+(.+)$/gm, (_, hashes, content) =>
    `<h${hashes.length} class="${styles.mdH}">${content}</h${hashes.length}>`);
  s = s.replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^\*\n]+?)\*/g, '<em>$1</em>');
  s = s.replace(/\n/g, '<br>');
  return s;
}

/* ──────────────────────────────────────────
   Trang chi tiết văn bản — PUBLIC (không cần login)
   ────────────────────────────────────────── */
export default function DocumentDetailPage() {
  const params = useParams();
  const documentId = params?.documentId;
  const settingsRef = useRef(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [doc, setDoc]   = useState(null);
  const [error, setError] = useState('');

  // Kiểm tra user đang login không (để hiển thị nav phù hợp)
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => { setLoggedIn(!!getUserToken()); }, []);

  // Click ngoài dropdown → đóng
  useEffect(() => {
    const h = (e) => { if (settingsRef.current && !settingsRef.current.contains(e.target)) setSettingsOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Fetch văn bản
  useEffect(() => {
    if (!documentId) return;
    setLoading(true);
    documentAPI.getDetail(documentId)
      .then((data) => { setDoc(data); setLoading(false); })
      .catch(() => { setError('Không tải được văn bản. Vui lòng thử lại.'); setLoading(false); });
  }, [documentId]);

  /* ── HEADER dùng chung (giống trang chủ) ── */
  const Navbar = () => (
    <header className={styles.topnav}>
      <Link href="/" className={styles.logo}>
        <div className={styles.logoIcon}>L</div>
        <span className={styles.logoText}>LegalAI</span>
      </Link>
      <nav className={styles.topnavNav}>
        <Link href="/" className={styles.navLink}>Trang chủ</Link>
        <span className={`${styles.navLink} ${styles.navActive}`}>Văn bản pháp luật</span>
      </nav>
      <div className={styles.topnavActions}>
        {loggedIn ? (
          <Link href="/dashboard" className={styles.btnPrimary}>Vào Dashboard</Link>
        ) : (
          <>
            <Link href="/" className={styles.btnOutline}>Đăng nhập</Link>
            <Link href="/" className={styles.btnPrimary}>Đăng ký</Link>
          </>
        )}
      </div>
    </header>
  );

  if (loading) {
    return (
      <div className={styles.pageWrap}>
        <Navbar />
        <div className={styles.loadingWrap}>
          <div className={styles.spinner} />
          <p className={styles.loadingText}>Đang tải văn bản...</p>
        </div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className={styles.pageWrap}>
        <Navbar />
        <div className={styles.errorWrap}>
          <p className={styles.errorText}>{error || 'Không tìm thấy văn bản.'}</p>
          <Link href="/" className={styles.backLink}>← Quay lại trang chủ</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageWrap}>
      <Navbar />

      <main className={styles.main}>
        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <Link href="/" className={styles.bcLink}>Trang chủ</Link>
          <span className={styles.bcSep}>/</span>
          <span className={styles.bcCurrent}>Chi tiết văn bản</span>
        </div>

        <div className={styles.docCard}>
          {/* Badges */}
          <div className={styles.badges}>
            {doc.documentType && <span className={styles.badge}>{doc.documentType}</span>}
            {doc.field && <span className={styles.badgeField}>{doc.field}</span>}
          </div>

          {/* Tiêu đề */}
          <h1 className={styles.docTitle}>{doc.title || 'Không có tiêu đề'}</h1>

          {/* Metadata grid */}
          <div className={styles.metaGrid}>
            {doc.documentNumber && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>📄 Số hiệu</span>
                <span className={styles.metaValue}>{doc.documentNumber}</span>
              </div>
            )}
            {doc.issuingAuthority && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>🏛 Cơ quan ban hành</span>
                <span className={styles.metaValue}>{doc.issuingAuthority}</span>
              </div>
            )}
            {doc.issueDate && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>📅 Ngày ban hành</span>
                <span className={styles.metaValue}>{new Date(doc.issueDate).toLocaleDateString('vi-VN')}</span>
              </div>
            )}
            {doc.effectiveDate && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>✅ Hiệu lực từ</span>
                <span className={styles.metaValue}>{new Date(doc.effectiveDate).toLocaleDateString('vi-VN')}</span>
              </div>
            )}
            {doc.status && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>🔖 Trạng thái</span>
                <span className={styles.metaValue}>{doc.status}</span>
              </div>
            )}
          </div>

          <div className={styles.divider} />

          {/* Nội dung */}
          <div
            className={styles.docBody}
            dangerouslySetInnerHTML={{ __html: contentToHtml(doc.content) }}
          />
        </div>
      </main>
    </div>
  );
}
