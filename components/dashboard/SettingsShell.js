'use client';

import Link from 'next/link';
import { clearUserToken } from '@/lib/auth-storage';
import styles from './SettingsShell.module.css';

export default function SettingsShell({ user, children, activeMenu = 'change-password' }) {
  const handleLogout = () => {
    clearUserToken();
    window.location.href = '/';
  };

  const menuItems = [
    { href: '/dashboard/profile', icon: 'person', label: 'Hồ sơ cá nhân', key: 'profile' },
    { href: '/dashboard/change-password', icon: 'lock', label: 'Đổi mật khẩu', key: 'change-password' },
  ];

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          LegalAI
        </Link>
        <div />
      </header>

      <div className={styles.body}>
        <div className={styles.breadcrumb}>
          <Link href="/dashboard" className={styles.breadcrumbLink}>Trang chủ</Link>
          <span className={styles.chevron}>&gt;</span>
          <span className={styles.breadcrumbCurrent}>Cài đặt chung</span>
        </div>
        <div className={styles.contentRow}>
          <aside className={styles.aside}>
            <div className={styles.userBlock}>
              <div className={styles.userRow}>
                <div className={styles.avatar}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <span className={styles.userName}>{user?.fullName || 'Người dùng'}</span>
              </div>
            </div>

            <nav className={styles.nav}>
              {menuItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={activeMenu === item.key ? styles.navLinkActive : styles.navLink}
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
              <button type="button" onClick={handleLogout} className={styles.navLogout}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Đăng xuất
              </button>
            </nav>
          </aside>

          <main className={styles.main}>{children}</main>
        </div>
      </div>
    </div>
  );
}
