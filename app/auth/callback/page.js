'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setUserToken } from '@/lib/auth-storage';
import styles from './page.module.css';

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');

    if (token) {
      setUserToken(token);
      router.push('/dashboard');
    } else {
      router.push('/?error=auth_failed');
    }
  }, [searchParams, router]);

  return <div className={styles.wrap}>Đang xử lý đăng nhập...</div>;
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className={styles.wrap}>Đang xử lý đăng nhập...</div>}>
      <AuthCallbackInner />
    </Suspense>
  );
}
