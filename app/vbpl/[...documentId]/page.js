'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { documentAPI } from '@/lib/api';
import { getUserToken, clearUserToken } from '@/lib/auth-storage';
import { authAPI } from '@/lib/api';
import { resolveDocumentIdFromParams } from '@/lib/vbpl';
import styles from './page.module.css';
import ChatWidget from '@/components/chat/ChatWidget';

/** Xóa ký hiệu Markdown để hiển thị text thuần cho tiêu đề */
function stripMd(text) {
  if (!text) return '';
  return String(text)
    .replace(/[\*_]{2,}/g, '') // Xóa ** hoặc __
    .replace(/[\*_]/g, '')    // Xóa * hoặc _ lẻ
    .replace(/\\([.!?,;:\)\(\[\]\*\_\-\#\~\`\|\\])/g, '$1') // Xóa backslash
    .trim();
}

/* ──────────────────────────────────────────
   Render nội dung HTML + Markdown hỗn hợp
   ────────────────────────────────────────── */
function contentToHtml(text) {
  if (!text) return '';
  let s = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // DEBUG TẠM: tìm đoạn chứa "Điều 2" để xem format thực tế
  if (typeof window !== 'undefined') {
    const idx = s.indexOf('Điều 2');
    if (idx !== -1) console.log('[DEBUG Điều 2]', JSON.stringify(s.slice(Math.max(0, idx - 10), idx + 200)));
  }

  // ── FIX: Tách khoản đánh số khỏi dòng heading Markdown ──
  // DB lưu: "### **Điều 2. Đối tượng áp dụng** 1. Người lao động..."
  // Dùng \*+Điều...\*+ để bắt đúng phần title; [^\S\n]+ để chỉ match space cùng dòng
  s = s.replace(
    /^(#{1,6}\s+\*+Điều\s+\d+\.[^\n]*?\*+)[^\S\n]+(\d+\.\s)/gm,
    '$1\n\n$2'
  );



  // Xóa sạch các chuỗi ký tự rác (backslash, gạch đứng, gạch dưới...) xuất hiện liên tục
  // QUAN TRỌNG: dùng [^\S\n]* (không nuốt \n) thay vì [\s]* để tránh xóa mất ký tự xuống dòng
  // Ví dụ: "****\n\n" → [\s]* sẽ nuốt \n\n → mất xuống dòng; [^\S\n]* sẽ giữ \n\n lại
  s = s.replace(/([\\|\\_\#\*]{2,}[^\S\n]*){2,}/g, ' ');
  s = s.replace(/[\\|\\_\#\*]{3,}/g, ' ');


  // Xóa ký hiệu kết thúc văn bản pháp luật truyền thống (./.) nếu người dùng thấy thừa
  s = s.replace(/\.\/\.\s*$/gm, '.');

  // ── Tự động xuống dòng trước các tiêu đề Điều/Chương/Mục ──
  // Chỉ chèn newline trong 2 trường hợp an toàn:
  // 1. Đứng sau kết thúc câu (dấu chấm, chấm phẩy) → rõ ràng là sang điều mới
  s = s.replace(/([.;])\s+(Điều\s+\d+[\.\s])/g, '$1\n\n$2');
  s = s.replace(/([.;])\s+(Chương\s+[IVXLCDM\d])/g, '$1\n\n$2');
  s = s.replace(/([.;])\s+(Mục\s+\d+[\.\s])/g, '$1\n\n$2');
  s = s.replace(/([.;])\s+(Phần\s+[IVXLCDM\d])/g, '$1\n\n$2');
  // 2. Đứng ngay sau chuỗi CHỮ HOA (tên chương/mục viết hoa như "NHỮNG QUY ĐỊNH CHUNG Điều 1.")
  s = s.replace(/([A-ZĐÁÀẢÃẠẮẶẦẨẪẬÂẤÉÈẸẺẼÊẾỀỆỂỄÍÌỊỈĨÓÒỌỎÕÔỐỒỘỔỖƠỚỜỢỞỠÚÙỤỦŨƯỨỪỰỬỮÝỲỴỶỸ]{2,})\s+(Điều\s+\d+[\.\s])/g, '$1\n\n$2');
  s = s.replace(/([A-ZĐÁÀẢÃẠẮẶẦẨẪẬÂẤÉÈẸẺẼÊẾỀỆỂỄÍÌỊỈĨÓÒỌỎÕÔỐỒỘỔỖƠỚỜỢỞỠÚÙỤỦŨƯỨỪỰỬỮÝỲỴỶỸ]{2,})\s+(Chương\s+[IVXLCDM\d])/g, '$1\n\n$2');

  // 3. Khoản đánh số (1. 2. 3...) liền sau tiêu đề điều khoản
  // Dùng kỹ thuật protect/restore: tạm thay "Điều/Khoản/Mục X" bằng placeholder
  // để tránh "Điều 24." bị tách thành "Điều\n24." (\b không hoạt động với Unicode tiếng Việt nên bỏ \b)
  {
    const _protectMap = [];
    s = s.replace(
      /(Điều|Khoản|Mục|Điểm|Chương|Phần|điều|khoản|mục|điểm|chương|phần)\s+(\d+)/g,
      (match) => { _protectMap.push(match); return `\x00P${_protectMap.length - 1}\x00`; }
    );
    // Chỉ chèn newline khi: đứng SAU chữ thường (hết tiêu đề) + nội dung bắt đầu CHỮ HOA
    s = s.replace(
      /([a-zđáàảãạăắặầẩẫậâấéèẹẻẽêếềệểễíìịỉĩóòọỏõôốồộổỗơớờợởỡúùụủũưứừựửữýỳỵỷỹ])\s+(\d+\.\s+[A-ZĐÁÀẢÃẠĂẮẶẦẨẪẬÂẤÉÈẸẺẼÊẾỀỆỂỄÍÌỊỈĨÓÒỌỎÕÔỐỒỘỔỖƠỚỜỢỞỠÚÙỤỦŨƯỨỪỰỬỮÝỲỴỶỸ])/g,
      '$1\n$2'
    );
    // Khôi phục placeholders
    _protectMap.forEach((val, idx) => { s = s.replace(`\x00P${idx}\x00`, val); });
  }


  // Một số file MD dùng "- d)" như bullet list cho điểm luật. Khi hiển thị văn bản
  // pháp luật, bỏ bullet để chỉ còn "d)".
  s = s.replace(/(^|\n)\s*[-*]\s+([a-zđ]\)\s+)/gi, '$1$2');

  // Bỏ qua regex tự động ngắt dòng trước Điều/Chương vì gây lỗi ngắt câu giữa dòng khi trích dẫn điều khoản.
  // s = s.replace(/([^\n])\s+(Chương [IVXLCDM\d]+|Điều \d+|Mục \d+|Phần [IVXLCDM\d]+|Phụ lục [IVXLCDM\d]*)/gi, '$1\n$2');

  // Hàm xử lý Markdown cho một đoạn text
  const processMd = (t) => {
    let m = t;
    // Headings (Mặc định Markdown)
    m = m.replace(/^(#{1,6})\s+(.+)$/gm, (_, h, c) =>
      `<h${h.length} style="color:#111827;font-weight:700;margin:1.2em 0 .5em">${c}</h${h.length}>`);

    // Tự động Style cho Chương (Căn giữa, To, Đậm, Xanh)
    // Hỗ trợ cả trường hợp bị bọc bởi ** hoặc __
    m = m.replace(/^\s*([\*_]{2,})?(Chương\s+[IVXLCDM\d\.]+\s*.*?)([\*_]{2,})?$/gmi,
      '<div style="text-align:center; font-size:1.4rem; font-weight:800; margin:2rem 0 1rem; color:#1e40af; text-transform:uppercase; line-height:1.4; display:block;">$2</div>');

    // Tự động Style cho Mục (Căn giữa, Vừa, Đậm)
    m = m.replace(/^\s*([\*_]{2,})?(Mục\s+\d+\s*.*?)([\*_]{2,})?$/gmi,
      '<div style="text-align:center; font-size:1.15rem; font-weight:700; margin:1.5rem 0 0.8rem; color:#1e3a8a; display:block;">$2</div>');

    // Tự động Style cho Điều (Đậm, màu sẫm)
    m = m.replace(/^\s*([\*_]{2,})?(Điều\s+\d+[\.\s].*?)([\*_]{2,})?(\n|$)/gmi,
      '<div style="font-weight:700; font-size:1.1rem; color:#111827; margin:1rem 0 0.1rem; display:block;">$2</div>');

    // Bold-Italic (Chỉ cho phép xuống dòng đơn, không cho phép băng qua đoạn văn mới \n\n)
    m = m.replace(/\*\*\*([^\n]+(?:\n[^\n]+)*)\*\*\*/g, '<strong><em>$1</em></strong>');
    m = m.replace(/___([^\n]+(?:\n[^\n]+)*)___/g, '<strong><em>$1</em></strong>');

    // Bold
    m = m.replace(/\*\*([^\n]+(?:\n[^\n]+)*)\*\*/g, '<strong>$1</strong>');
    m = m.replace(/__([^\n]+(?:\n[^\n]+)*)__/g, '<strong>$1</strong>');

    // Italic
    m = m.replace(/\*([^\n]+(?:\n[^\n]+)*)\*/g, '<em>$1</em>');
    m = m.replace(/_([^\n]+(?:\n[^\n]+)*)_/g, '<em>$1</em>');

    // Blockquotes
    m = m.replace(/^>\s*(.+)$/gm, '<blockquote style="border-left: 4px solid #e5e7eb; padding-left: 1rem; color: #4b5563; font-style: italic; margin: 0.5rem 0;">$1</blockquote>');

    // Xóa các ký tự Markdown lẻ loi (artifact) còn sót lại sau khi đã parse Bold/Italic
    m = m.replace(/[\*_]{2,}/g, '');

    // Xóa backslash escape còn sót
    m = m.replace(/\\([.!?,;:\)\(\[\]\*\_\-\#\~\`\|\\])/g, '$1');

    return m;
  };

  // Phát hiện có thẻ HTML không
  const hasHtml = /<(table|tr|td|th|tbody|thead|p|div|ul|ol|li|colgroup|col)[\s>]/i.test(s);

  if (hasHtml) {
    const segments = s.split(/(<table[\s\S]*?<\/table>)/gi);
    return segments.map((seg) => {
      const isTable = /^\s*<table/i.test(seg);
      let processed = processMd(seg);
      if (isTable) return processed;
      return processed.replace(/\n/g, '<br>');
    }).join('');
  }

  return processMd(s).replace(/\n/g, '<br>');
}



/* ──────────────────────────────────────────
   Trang chi tiết văn bản — PUBLIC
   ────────────────────────────────────────── */
export default function VbplDetailPage() {
  const params = useParams();
  const documentId = useMemo(
    () => resolveDocumentIdFromParams(params?.documentId),
    [params?.documentId]
  );

  const [user, setUser] = useState(null);
  const [userLoading, setUserLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');

  // Load user nếu đã đăng nhập
  useEffect(() => {
    if (getUserToken()) {
      authAPI.getMe()
        .then(setUser)
        .catch(() => { clearUserToken(); })
        .finally(() => setUserLoading(false));
    } else {
      setUserLoading(false);
    }
  }, []);

  // Đóng dropdown khi click ngoài
  useEffect(() => {
    const h = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target))
        setSettingsOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Fetch văn bản
  useEffect(() => {
    if (!documentId) return;
    setLoading(true);
    documentAPI.getDetail(documentId)
      .then((data) => { setDoc(data); setLoading(false); })
      .catch(() => { setError('Không tải được văn bản.'); setLoading(false); });
  }, [documentId]);

  // Gửi context cho ChatWidget
  useEffect(() => {
    if (doc) {
      window.dispatchEvent(new CustomEvent('SET_CHAT_CONTEXT', {
        detail: {
          title: doc.title || doc.documentNumber,
          content: doc.content,
          id: documentId
        }
      }));
    }
  }, [doc, documentId]);

  const userInitial = user?.fullName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U';



  const handleLogout = () => {
    authAPI.logout().catch(() => { });
    clearUserToken();
    setUser(null);
  };

  /* ── NAVBAR (y hệt trang chủ) ── */
  const Navbar = () => (
    <header className={styles.topnav}>
      <Link href="/" className={styles.logo}>
        <div className={styles.logoIcon}>L</div>
        <span className={styles.logoText}>LegalAI</span>
      </Link>

      <nav className={styles.topnavNav}>
        <Link href="/" className={styles.navLink}>Trang chủ</Link>
        <Link href="/dashboard" className={styles.navLink} target="_blank">Hỏi đáp</Link>
        <button className={styles.navCalcBtn}>📊 Tính thuế TNCN</button>
      </nav>

      <div className={styles.topnavActions}>
        {userLoading ? null : user ? (
          <div ref={settingsRef} style={{ position: 'relative' }}>
            <button className={styles.userBtn} onClick={() => setSettingsOpen(p => !p)}>
              <div className={styles.userAvatar}>{userInitial}</div>
              <span>{user.fullName?.split(' ').pop() || user.email}</span>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
                style={{ marginLeft: 2, transition: 'transform .2s', transform: settingsOpen ? 'rotate(180deg)' : 'none' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {settingsOpen && (
              <div className={styles.dropdown}>
                <Link href="/dashboard/profile" className={styles.dropItem} onClick={() => setSettingsOpen(false)}>
                  👤 Hồ sơ cá nhân
                </Link>
                <Link href="/dashboard" className={styles.dropItem} onClick={() => setSettingsOpen(false)}>
                  💬 Dashboard
                </Link>
                <div className={styles.dropDivider} />
                <button className={`${styles.dropItem} ${styles.dropLogout}`} onClick={handleLogout}>
                  🚪 Đăng xuất
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <Link href="/" className={styles.btnOutline}>Đăng nhập</Link>
            <Link href="/" className={styles.btnPrimary}>Đăng ký</Link>
          </>
        )}
      </div>
    </header>
  );

  /* ── LOADING ── */
  if (loading) return (
    <div className={styles.pageWrap}>
      <Navbar />
      <div className={styles.center}>
        <div className={styles.spinner} />
        <p className={styles.loadingText}>Đang tải văn bản...</p>
      </div>
    </div>
  );

  /* ── ERROR ── */
  if (error || !doc) return (
    <div className={styles.pageWrap}>
      <Navbar />
      <div className={styles.center}>
        <p style={{ color: '#ef4444', fontWeight: 600 }}>{error || 'Không tìm thấy văn bản.'}</p>
        <Link href="/" className={styles.backLink}>← Quay lại trang chủ</Link>
      </div>
    </div>
  );

  /* ── MAIN ── */
  return (
    <div className={styles.pageWrap}>
      <Navbar />
      <main className={styles.main}>
        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <Link href="/" className={styles.bcLink}>Trang chủ</Link>
          <span className={styles.bcSep}>/</span>
          <span>Chi tiết văn bản</span>
        </div>

        <div className={styles.docCard}>
          {/* Badges */}
          <div className={styles.badges}>
            {doc.documentType && <span className={styles.badge}>{doc.documentType}</span>}
            {doc.field && <span className={styles.badgeField}>{doc.field}</span>}
          </div>

          {/* Tiêu đề */}
          <h1 className={styles.docTitle}>{stripMd(doc.title) || 'Không có tiêu đề'}</h1>

          {/* Metadata */}
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
            {doc.issueDate && doc.issueDate !== '—' && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>📅 Ngày ban hành</span>
                <span className={styles.metaValue}>
                  {(function (d) {
                    const obj = new Date(d);
                    if (!isNaN(obj.getTime())) return obj.toLocaleDateString('vi-VN');
                    return d;
                  })(doc.issueDate)}
                </span>
              </div>
            )}
            {doc.effectiveDate && doc.effectiveDate !== '—' && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>✅ Hiệu lực từ</span>
                <span className={styles.metaValue}>
                  {(function (d) {
                    const obj = new Date(d);
                    if (!isNaN(obj.getTime())) return obj.toLocaleDateString('vi-VN');
                    return d;
                  })(doc.effectiveDate)}
                </span>
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
          <article
            className={styles.docBody}
            dangerouslySetInnerHTML={{ __html: contentToHtml(doc.content) }}
          />
        </div>
      </main>
      <ChatWidget />
    </div>
  );
}
