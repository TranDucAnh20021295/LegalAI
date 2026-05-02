'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LandingNavbar from '@/components/landing/LandingNavbar';
import LandingHero from '@/components/landing/LandingHero';
import LawGrid from '@/components/landing/LawGrid';
import PitCalculatorModal from '@/components/landing/PitCalculatorModal';
import AuthModal from '@/components/landing/AuthModal';
import { useLanding } from '@/hooks/useLanding';
import { documentAPI } from '@/lib/api';

import styles from './page.module.css';

/** Xóa toàn bộ HTML + Markdown để chỉ giữ text thuần hiển thị preview */
function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<[\s\S]*?>/g, ' ')   // Xóa thẻ HTML multiline
    .replace(/#{1,6}\s+/g, '')     // Xóa ## heading Markdown
    .replace(/\*\*(.*?)\*\*/g, '$1') // Xóa **bold**
    .replace(/\*(.*?)\*/g, '$1')    // Xóa *italic*
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\.\/\.\s*$/gm, '.')
    .replace(/([\\\|\_\#\*]{2,}[\s]*){2,}/g, ' ')
    .replace(/[\\\|\_\#\*]{3,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

const INITIAL_LAWS = [
  { id: 1, title: 'Luật Thuế thu nhập cá nhân 2025 (Số 109/2025/QH15)', category: 'thue', date: '01/01/2026', views: '12.5k', tags: ['new', 'hot'], excerpt: 'Quy định chi tiết về biểu thuế lũy tiến 5 bậc mới và các mức giảm trừ gia cảnh mới áp dụng từ năm 2026.' },
  { id: 2, title: 'Nghị định 123/2024/NĐ-CP về hóa đơn điện tử', category: 'doanh-nghiep', date: '15/12/2024', views: '8.2k', tags: ['hot'], excerpt: 'Hướng dẫn các doanh nghiệp chuyển đổi và sử dụng hóa đơn điện tử theo quy chuẩn mới nhất của Bộ Tài chính.' },
  { id: 3, title: 'Thông tư 45/2024/TT-BTC về trích khấu hao tài sản', category: 'doanh-nghiep', date: '10/12/2024', views: '5.4k', tags: [], excerpt: 'Quy định về thời gian và phương pháp trích khấu hao tài sản cố định áp dụng cho doanh nghiệp vừa và nhỏ.' },
  { id: 4, title: 'Bộ Luật Lao động 2024 (sửa đổi, bổ sung)', category: 'lao-dong', date: '05/12/2024', views: '15.9k', tags: ['new'], excerpt: 'Cập nhật các quy định về giờ làm việc, nghỉ ngơi và chế độ bảo hiểm xã hội mới cho người lao động.' },
  { id: 5, title: 'Luật Đất đai (sửa đổi) - Các điểm mới cần lưu ý', category: 'dat-dai', date: '20/11/2024', views: '25.3k', tags: ['hot'], excerpt: 'Phân tích các thay đổi về bảng giá đất, bồi thường tái định cư và quy trình cấp sổ đỏ mới.' },
  { id: 6, title: 'Quy trình xử lý tố giác tội phạm theo Bộ luật Hình sự', category: 'hinh-su', date: '10/11/2024', views: '4.1k', tags: [], excerpt: 'Hướng dẫn chi tiết quy trình tiếp nhận và xử lý tin báo tố giác tội phạm tại các cơ quan chức năng.' },
];

export default function HomePage() {
  const router = useRouter();
  const settingsRef = useRef(null);
  const l = useLanding();

  const [laws, setLaws] = useState([]);
  const [lawsLoading, setLawsLoading] = useState(true);

  // Fetch initial documents
  useEffect(() => {
    setLawsLoading(true);
    documentAPI.filter(l.activeCat === 'all' ? '' : l.activeCat, 10)
      .then(data => {
        const mapped = (data || []).map(d => {
          const formatDate = (dateVal) => {
            if (!dateVal || dateVal === '—') return '—';
            const dateObj = new Date(dateVal);
            if (!isNaN(dateObj.getTime())) return dateObj.toLocaleDateString('vi-VN');
            return dateVal;
          };

          return {
            id: d.documentId,
            documentId: d.documentId,
            title: d.title,
            documentNumber: d.documentNumber,
            documentType: d.documentType,
            category: d.field || d.documentType,
            field: d.field,
            status: d.status || d.trang_thai,
            issuedDate: formatDate(d.issueDate),
            effectiveDate: formatDate(d.effectiveDate),
            date: formatDate(d.issueDate),
            excerpt: stripHtml(d.contentPreview || d.excerpt || d.content || ''),
            views: d.views || '0',
            tags: []
          };
        });
        setLaws(mapped);
        setLawsLoading(false);
      })
      .catch((err) => {
        console.error('--- Laws fetch error:', err);
        setLawsLoading(false);
      });
  }, [l.activeCat]);



  const catLabels = {
    all: 'Tất cả',
    'Dân sự & Hôn nhân Gia đình': '👪 Dân sự & Hôn nhân',
    'Hình sự & An ninh Quốc phòng': '🚔 Hình sự & An ninh',
    'Kinh tế & Doanh nghiệp': '🏢 Kinh tế & DN',
    'Tài chính - Kế toán - Thuế': '💰 Tài chính & Thuế',
    'Lao động & Bảo hiểm Xã hội': '👷 LĐ & BHXH',
    'Đất đai - Bất động sản': '🏠 Đất đai & BĐS',
    'Hành chính': '📋 Hành chính',
    'Giáo dục': '🎓 Giáo dục',
    'Y tế': '🏥 Y tế',
    'Khác': '📌 Khác'
  };

  const userInitial = l.user?.fullName?.[0].toUpperCase() || 'U';

  return (
    <div className={styles.pageRoot}>
      <LandingNavbar
        user={l.user}
        userLoading={l.userLoading}
        userInitial={userInitial}
        settingsOpen={l.settingsOpen}
        setSettingsOpen={l.setSettingsOpen}
        settingsRef={settingsRef}
        openAuth={l.openAuth}
        openChat={l.handleSend}
        setCalcOpen={l.setCalcOpen}
        handleLogout={l.handleLogout}
        dropdownItemStyle={dropdownItemStyle}
      />

      <LandingHero
        searchQuery={l.searchQuery}
        setSearchQuery={l.setSearchQuery}
        searchIn={l.searchIn}
        setSearchIn={l.setSearchIn}
        exactMatch={l.exactMatch}
        setExactMatch={l.setExactMatch}
        filterCat={l.setActiveCat}
      />

      <LawGrid
        laws={laws}
        loading={lawsLoading}
        activeCat={l.activeCat}
        filterCat={l.setActiveCat}
        catLabels={catLabels}
        openLaw={(law) => {
          if (law.documentId) {
            window.open(`/vbpl/${law.documentId}`, '_blank');
          }
        }}
      />

      <PitCalculatorModal
        calcOpen={l.calcOpen}
        setCalcOpen={l.setCalcOpen}
        inputMode={l.inputMode}
        setInputMode={l.setInputMode}
        gross={l.gross}
        setGross={l.setGross}
        deps={l.deps}
        setDeps={l.setDeps}
        insurance={l.insurance}
        setInsurance={l.setInsurance}
        otherDeduct={l.otherDeduct}
        setOtherDeduct={l.setOtherDeduct}
        calculate={l.doCalculate}
        calcResult={l.calcResult}
        liveCalc={l.doCalculate}
      />

      <AuthModal
        authOpen={l.authOpen}
        closeAuth={l.closeAuth}
        authTab={l.authTab}
        setAuthTab={l.setAuthTab}
        user={l.user}
      />
    </div>
  );
}

const dropdownItemStyle = {
  display: 'flex', alignItems: 'center', gap: '10px',
  width: '100%', padding: '10px 16px', background: 'none', border: 'none',
  fontSize: '14px', color: '#374151', cursor: 'pointer', textAlign: 'left',
  fontFamily: 'inherit', transition: 'background .15s'
};
