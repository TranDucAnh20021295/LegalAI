'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authAPI, documentAPI } from '@/lib/api';

export default function DocumentsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [field, setField] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [detail, setDetail] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const settingsRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) setSettingsMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/'); return; }
    authAPI.getMe().then(setUser).catch(() => { localStorage.removeItem('token'); router.push('/'); }).finally(() => setLoading(false));
  }, [router]);

  const handleSearch = async () => {
    setSearching(true);
    try {
      const data = await documentAPI.search(keyword);
      setResults(Array.isArray(data) ? data : []);
    } catch (err) {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleFilter = async () => {
    setSearching(true);
    try {
      const data = await documentAPI.filter(field);
      setResults(Array.isArray(data) ? data : []);
    } catch (err) {
      setResults([]);
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
    localStorage.removeItem('token');
    router.push('/');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: '#94a3b8' }}>
        Đang tải...
      </div>
    );
  }

  const sidebarWidth = sidebarCollapsed ? 64 : 280;
  const sidebarStyle = {
    width: sidebarWidth,
    minWidth: sidebarWidth,
    minHeight: '100vh',
    background: '#0f172a',
    borderRight: '1px solid #1e293b',
    display: 'flex',
    flexDirection: 'column',
    padding: sidebarCollapsed ? '16px 8px' : '20px 16px',
    transition: 'width 0.2s ease, padding 0.2s ease',
  };

  const mainStyle = {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    padding: '32px 40px',
    background: '#0a192f',
    overflow: 'auto',
  };

  const btnStyle = {
    width: '100%',
    height: '40px',
    minHeight: '40px',
    padding: sidebarCollapsed ? '0' : '0 16px',
    background: 'transparent',
    border: '1px solid #334155',
    borderRadius: '10px',
    color: '#94a3b8',
    fontSize: '15px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
    gap: '10px',
    cursor: 'pointer',
    textDecoration: 'none',
  };

  const btnActiveStyle = {
    ...btnStyle,
    background: '#1e293b',
    borderColor: 'rgba(59, 130, 246, 0.5)',
    color: '#ffffff',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', background: '#0a192f', overflow: 'hidden' }}>
      <aside style={sidebarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', justifyContent: sidebarCollapsed ? 'stretch' : 'flex-start', width: '100%' }}>
          {!sidebarCollapsed && (
            <Link href="/dashboard" style={{ fontSize: '22px', fontWeight: '700', color: '#ffffff', flex: 1 }}>
              LegalAI
            </Link>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            style={{
              width: sidebarCollapsed ? '100%' : '40px',
              height: '40px',
              minWidth: '40px',
              borderRadius: '10px',
              background: 'transparent',
              border: '1px solid #334155',
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            title={sidebarCollapsed ? 'Mở rộng' : 'Thu gọn'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: sidebarCollapsed ? 'rotate(180deg)' : 'none' }}>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>

        <Link href="/dashboard" style={{ ...btnStyle, marginBottom: '8px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          {!sidebarCollapsed && 'Trò chuyện'}
        </Link>

        <div style={{ ...btnActiveStyle, marginBottom: sidebarCollapsed ? '16px' : '24px', pointerEvents: 'none' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
            <path d="M12 3v18M8 21h8M10 21V9l2-4 2 4v12M8 9l4-6 4 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {!sidebarCollapsed && 'Tra cứu văn bản'}
        </div>

        {!sidebarCollapsed && <div style={{ flex: 1, minHeight: 16 }} />}
        {sidebarCollapsed && <div style={{ flex: 1, minHeight: 16 }} />}

        <div ref={settingsRef} style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #1e293b', position: 'relative' }}>
          <button
            onClick={() => setSettingsMenuOpen(!settingsMenuOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
              gap: '8px',
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: '14px',
              cursor: 'pointer',
              padding: sidebarCollapsed ? '0' : '8px 0',
              width: sidebarCollapsed ? '40px' : '100%',
              height: '40px',
              minWidth: sidebarCollapsed ? '40px' : 'auto',
              borderRadius: sidebarCollapsed ? '10px' : 0,
            }}
            title="Cài đặt"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            {!sidebarCollapsed && 'Cài đặt'}
          </button>

          {settingsMenuOpen && (
            <div style={{ position: 'absolute', bottom: 0, left: '100%', marginLeft: '8px', minWidth: '220px', background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', padding: '8px 0', zIndex: 1000 }}>
              <Link href="/dashboard/profile" onClick={() => setSettingsMenuOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', color: '#e2e8f0', fontSize: '14px', textDecoration: 'none' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                Hồ sơ cá nhân
              </Link>
              <Link href="/dashboard/change-password" onClick={() => setSettingsMenuOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', color: '#e2e8f0', fontSize: '14px', textDecoration: 'none' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                Đổi mật khẩu
              </Link>
              <button onClick={() => { setSettingsMenuOpen(false); handleLogout(); }} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', width: '100%', background: 'none', border: 'none', color: '#e2e8f0', fontSize: '14px', cursor: 'pointer', textAlign: 'left' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      </aside>

      <main style={mainStyle}>
        <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#f1f5f9', marginBottom: '24px' }}>
          Tra cứu văn bản pháp luật
        </h1>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px', display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Tìm theo từ khóa..."
              style={{
                flex: 1,
                padding: '12px 16px',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '10px',
                color: '#f1f5f9',
                fontSize: '15px',
                outline: 'none',
              }}
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              style={{
                padding: '12px 24px',
                background: '#2563eb',
                border: 'none',
                borderRadius: '10px',
                color: 'white',
                fontSize: '15px',
                fontWeight: '600',
                cursor: searching ? 'not-allowed' : 'pointer',
                opacity: searching ? 0.7 : 1,
              }}
            >
              {searching ? 'Đang tìm...' : 'Tìm kiếm'}
            </button>
          </div>
          <div style={{ flex: 1, minWidth: '200px', display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={field}
              onChange={(e) => setField(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
              placeholder="Lọc theo lĩnh vực..."
              style={{
                flex: 1,
                padding: '12px 16px',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '10px',
                color: '#f1f5f9',
                fontSize: '15px',
                outline: 'none',
              }}
            />
            <button
              onClick={handleFilter}
              disabled={searching}
              style={{
                padding: '12px 24px',
                background: '#334155',
                border: '1px solid #475569',
                borderRadius: '10px',
                color: '#e2e8f0',
                fontSize: '15px',
                fontWeight: '500',
                cursor: searching ? 'not-allowed' : 'pointer',
                opacity: searching ? 0.7 : 1,
              }}
            >
              Lọc
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {results.length === 0 && !searching && (
            <div style={{ textAlign: 'center', color: '#64748b', padding: '48px 24px' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ margin: '0 auto 16px', opacity: 0.5 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <p>Nhập từ khóa hoặc lĩnh vực để tra cứu văn bản</p>
            </div>
          )}
          {results.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {results.map((doc) => (
                <div
                  key={doc.documentId}
                  onClick={() => handleViewDetail(doc.documentId)}
                  style={{
                    padding: '16px 20px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s, background 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.background = '#1e3a5f'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#334155'; e.currentTarget.style.background = '#1e293b'; }}
                >
                  <div style={{ fontSize: '16px', fontWeight: '600', color: '#f1f5f9', marginBottom: '8px' }}>
                    {doc.title || doc.documentNumber || 'Không có tiêu đề'}
                  </div>
                  <div style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '4px' }}>
                    {doc.documentNumber && <span>Số hiệu: {doc.documentNumber}</span>}
                    {doc.documentType && <span style={{ marginLeft: '12px' }}>Loại: {doc.documentType}</span>}
                    {doc.field && <span style={{ marginLeft: '12px' }}>Lĩnh vực: {doc.field}</span>}
                  </div>
                  {doc.contentPreview && (
                    <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.5 }}>{doc.contentPreview}...</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {detail && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '24px' }}
          onClick={() => setDetail(null)}
        >
          <div
            style={{
              background: '#1e293b',
              borderRadius: '16px',
              maxWidth: '720px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
              padding: '28px 32px',
              border: '1px solid #334155',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#f1f5f9', margin: 0, flex: 1 }}>{detail.title || 'Chi tiết văn bản'}</h2>
              <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '16px' }}>
              {detail.documentNumber && <div>Số hiệu: {detail.documentNumber}</div>}
              {detail.documentType && <div>Loại văn bản: {detail.documentType}</div>}
              {detail.issuingAuthority && <div>Cơ quan ban hành: {detail.issuingAuthority}</div>}
              {detail.issueDate && <div>Ngày ban hành: {new Date(detail.issueDate).toLocaleDateString('vi-VN')}</div>}
              {detail.effectiveDate && <div>Ngày hiệu lực: {new Date(detail.effectiveDate).toLocaleDateString('vi-VN')}</div>}
              {detail.status && <div>Trạng thái: {detail.status}</div>}
              {detail.field && <div>Lĩnh vực: {detail.field}</div>}
            </div>
            <div style={{ fontSize: '15px', color: '#e2e8f0', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{detail.content}</div>
          </div>
        </div>
      )}
    </div>
  );
}
