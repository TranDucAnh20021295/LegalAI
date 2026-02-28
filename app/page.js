'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import LoginForm from '@/components/LoginForm';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) router.push('/dashboard');
  }, [router]);

  return (
    <main style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px' }}>
      <Link href="/" style={{ textDecoration: 'none' }}>
      <h1 style={{
        position: 'relative',
        zIndex: 1,
        fontSize: '36px',
        fontWeight: '700',
        color: '#ffffff',
        letterSpacing: '-0.02em',
      }}>
        LegalAI
      </h1>
      </Link>
      <LoginForm />
    </main>
  );
}
