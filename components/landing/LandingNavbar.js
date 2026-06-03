'use client';

import Link from 'next/link';
import styles from './LandingNavbar.module.css';

export default function LandingNavbar({
  user,
  userLoading,
  userInitial,
  settingsOpen,
  setSettingsOpen,
  settingsRef,
  openAuth,
  openChat,
  setCalcOpen,
  handleLogout,
  dropdownItemStyle
}) {
  return (
    <header className={styles.topnav}>
      <Link href="/" className={styles.logo}>
        <div className={styles.logoIcon}>L</div>
        <span className={styles.logoText}>LegalAI</span>
      </Link>
      <nav className={styles.topnavNav}>
        <button className={`${styles.navLink} ${styles.navLinkActive}`}>Trang chủ</button>
        <Link href="/dashboard" className={styles.navLink} target="_blank">Hỏi đáp</Link>
        <button className={styles.navCalcBtn} onClick={() => setCalcOpen(true)}>📊 Tính thuế TNCN</button>

      </nav>
      <div className={styles.topnavActions}>
        {userLoading ? null : user ? (
          <div ref={settingsRef} style={{ position: 'relative' }}>
            <button
              className={styles.userBtn}
              onClick={() => setSettingsOpen(p => !p)}
            >
              <div className={styles.userAvatar}>{userInitial}</div>
              <span>{user.fullName?.split(' ').pop() || user.email}</span>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
                style={{ marginLeft: 2, transition: 'transform .2s', transform: settingsOpen ? 'rotate(180deg)' : 'none' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {settingsOpen && (
              <div className={styles.dropdown}>
                <Link href="/dashboard/profile" style={dropdownItemStyle} onClick={() => setSettingsOpen(false)}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                  Hồ sơ cá nhân
                </Link>
                <button style={dropdownItemStyle} onClick={() => { setSettingsOpen(false); openAuth('changepw'); }}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Đổi mật khẩu
                </button>
                <div className={styles.divider} />
                <button style={{ ...dropdownItemStyle, color: '#ef4444' }} onClick={handleLogout}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Đăng xuất
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <button className={styles.btnOutline} onClick={() => openAuth('login')}>Đăng nhập</button>
            <button className={styles.btnPrimary} onClick={() => openAuth('register')}>Đăng ký</button>
          </>
        )}
      </div>
    </header>
  );
}
