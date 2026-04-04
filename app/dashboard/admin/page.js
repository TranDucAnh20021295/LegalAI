'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI } from '@/lib/api';
import { getUserToken } from '@/lib/auth-storage';
import styles from './page.module.css';

/** Admin đã tách sang /admin — URL cũ chỉ redirect. */
export default function DashboardAdminRedirect() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = typeof window !== 'undefined' ? getUserToken() : null;
      if (!token) {
        router.replace('/');
        return;
      }
      try {
        const u = await authAPI.getMe();
        if (cancelled) return;
        if (u?.role === 'ADMIN') {
          router.replace('/admin/users');
        } else {
          router.replace('/dashboard');
        }
      } catch {
        if (!cancelled) router.replace('/');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return <div className={styles.loading}>Đang chuyển trang...</div>;
}
