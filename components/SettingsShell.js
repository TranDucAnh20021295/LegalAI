'use client';

import Link from 'next/link';

export default function SettingsShell({ user, children, activeMenu = 'change-password' }) {
  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/';
  };

  const menuItems = [
    { href: '/dashboard/profile', icon: 'person', label: 'Hồ sơ cá nhân', key: 'profile' },
    { href: '/dashboard/change-password', icon: 'lock', label: 'Đổi mật khẩu', key: 'change-password' },
  ];

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      width: '100vw',
      height: '100vh',
      margin: 0,
      background: '#f1f5f9',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      zIndex: 9999,
      }}>
      <header style={{
        height: '112px',
        background: '#f1f5f9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
      }}>
        <Link href="/dashboard" style={{ fontSize: '36px', fontWeight: '700', color: '#1e293b', textDecoration: 'none' }}>
          LegalAI
        </Link>
        <div />
      </header>

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        padding: '24px 24px 24px 48px',
      }}>
        <div style={{
          fontSize: '16px',
          color: '#64748b',
          marginBottom: '12px',
        }}>
          <Link href="/dashboard" style={{ color: '#64748b', textDecoration: 'none' }}>Trang chủ</Link>
          <span style={{ margin: '0 8px' }}>&gt;</span>
          <span style={{ color: '#1e293b', fontWeight: '500' }}>Cài đặt chung</span>
        </div>
        <div style={{ flex: 1, display: 'flex', gap: '24px', alignItems: 'flex-start', overflow: 'hidden' }}>
        <aside style={{
          width: '520px',
          minWidth: '520px',
          background: '#ffffff',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px 16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          flexShrink: 0,
          alignSelf: 'flex-start',
          borderBottom: '1px solid #e2e8f0',
        }}>
          <div style={{ padding: '0 4px 16px', borderBottom: '1px solid #e2e8f0', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: '#e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748b',
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <span style={{ color: '#1e293b', fontSize: '17px', fontWeight: '600' }}>
                {user?.fullName || 'Người dùng'}
              </span>
            </div>
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  margin: '0 4px',
                  color: activeMenu === item.key ? '#ffffff' : '#475569',
                  background: activeMenu === item.key ? '#1e40af' : 'transparent',
                  fontSize: '16px',
                  textDecoration: 'none',
                  borderRadius: '10px',
                  fontWeight: activeMenu === item.key ? '600' : '400',
                }}
              >
                {item.icon === 'person' && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                )}
                {item.icon === 'lock' && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
                {item.label}
              </Link>
            ))}
            <button
              onClick={handleLogout}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                margin: '0 4px',
                width: 'calc(100% - 8px)',
                background: 'transparent',
                border: 'none',
                color: '#475569',
                fontSize: '16px',
                cursor: 'pointer',
                textAlign: 'left',
                borderRadius: '10px',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Đăng xuất
            </button>
          </nav>
        </aside>

        <main style={{
          flex: 1,
          overflow: 'auto',
          background: '#ffffff',
          padding: '28px 36px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          minWidth: 0,
          borderBottom: '1px solid #e2e8f0',
        }}>
          {children}
        </main>
        </div>
      </div>
    </div>
  );
}
