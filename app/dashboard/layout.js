'use client';

import styles from './layout.module.css';

export default function DashboardLayout({ children }) {
  return <div className={styles.shell}>{children}</div>;
}
