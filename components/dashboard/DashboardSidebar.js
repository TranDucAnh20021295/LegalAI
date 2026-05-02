'use client';

import React from 'react';
import Link from 'next/link';
import styles from './DashboardSidebar.module.css';

export default function DashboardSidebar({
  collapsed,
  setCollapsed,
  conversations,
  activeConversationId,
  setActiveConversationId,
  handleNewConversation,
  setRenameDialog,
  setConfirmDelete,
  settingsOpen,
  setSettingsOpen,
  handleLogout,
  user
}) {
  const sb = collapsed;
  const userInitial = user?.fullName ? user.fullName[0].toUpperCase() : user?.email?.[0]?.toUpperCase() || 'U';

  return (
    <aside className={`${styles.sidebar} ${sb ? styles.sidebarNarrow : ''}`}>
      <div className={`${styles.sidebarHeader} ${sb ? styles.sidebarHeaderNarrow : ''}`}>
        {!sb && (
          <Link href="/" className={styles.brandLink}>
            <div className={styles.logoIcon}>L</div>
            LegalAI
          </Link>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(!sb)}
          className={`${styles.collapseBtn} ${sb ? styles.collapseBtnNarrow : ''}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${styles.chevron} ${sb ? styles.chevronRotated : ''}`}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      <button type="button" onClick={handleNewConversation} className={`${styles.sideNavItem} ${sb ? styles.sideNavItemNarrow : ''}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {!sb && 'Trò chuyện mới'}
      </button>

      <div className={styles.historySection}>
        {!sb && <div className={styles.historyLabel}>Lịch sử trò chuyện</div>}
        <div className={styles.convList}>
          {conversations.map((c) => (
            <div key={c.conversationId} className={styles.convItem}>
               <button
                onClick={() => setActiveConversationId(c.conversationId)}
                className={`${styles.convLink} ${activeConversationId === c.conversationId ? styles.convLinkActive : ''}`}
              >
                {!sb ? c.title || 'Cuộc trò chuyện mới' : '💬'}
              </button>
              {!sb && activeConversationId === c.conversationId && (
                <div className={styles.convActions}>
                  <button onClick={() => setRenameDialog({ open: true, conversation: c, title: c.title || '' })}>✏️</button>
                  <button onClick={() => setConfirmDelete({ open: true, conversation: c })}>🗑️</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.settingsWrap}>
        <button className={`${styles.settingsBtn} ${sb ? styles.settingsBtnNarrow : ''}`} onClick={() => setSettingsOpen(!settingsOpen)}>
          <div className={styles.userAvatar}>{userInitial}</div>
          {!sb && <span>{user?.fullName?.split(' ').pop() || 'Tài khoản'}</span>}
        </button>
        {settingsOpen && (
          <div className={styles.settingsMenu}>
            <Link href="/dashboard/profile" className={styles.menuLink}>Hồ sơ</Link>
            <Link href="/dashboard/change-password" className={styles.menuLink}>Mật khẩu</Link>
            <button onClick={handleLogout} className={styles.menuBtnLogout}>Đăng xuất</button>
          </div>
        )}
      </div>
    </aside>
  );
}
