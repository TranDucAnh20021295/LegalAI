'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import RegisterForm from '@/components/RegisterForm';
import { getUserToken } from '@/lib/auth-storage';
import styles from '../auth-page.module.css';

export default function RegisterPage() {
  const router = useRouter();

  useEffect(() => {
    if (getUserToken()) router.push('/dashboard');
  }, [router]);

  return (
    <main className={styles.main}>
      <Link href="/" className={styles.brandLink}>
        <h1 className={styles.brandTitle}>LegalAI</h1>
      </Link>
      <RegisterForm />
    </main>
  );
}
