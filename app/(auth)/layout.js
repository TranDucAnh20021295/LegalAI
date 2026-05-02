'use client';

import React from 'react';
import Link from 'next/link';
import styles from './auth-page.module.css';

export default function AuthLayout({ children }) {
  return (
    <div className={styles.authLayoutRoot}>
      <header className={styles.authLayoutHeader}>
        <Link href="/" className={styles.brandLink}>
          <div className={styles.logoIcon}>L</div>
          <span className={styles.brandTitle}>LegalAI</span>
        </Link>
      </header>
      <main className={styles.authLayoutContent}>
        {children}
      </main>
      <footer className={styles.authLayoutFooter}>
        © 2024 LegalAI — Nền tảng tra cứu pháp luật thông minh
      </footer>
    </div>
  );
}
