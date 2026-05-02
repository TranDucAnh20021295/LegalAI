/* ============================================
   Auth Callback Page — White/Green Theme
   ============================================ */
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setUserToken } from '@/lib/auth-storage';

export default function AuthCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState('Đang xác thực bảo mật...');

  useEffect(() => {
    const token = params.get('token');
    const error = params.get('error');

    if (error) {
      setStatus('Xác thực thất bại. Đang quay lại...');
      setTimeout(() => router.replace('/?error=auth_failed'), 1200);
      return;
    }

    if (token) {
      setUserToken(token);
      setStatus('Xác thực thành công! Đang vào hệ thống...');
      setTimeout(() => router.replace('/'), 800);
    } else {
      router.replace('/');
    }
  }, [params, router]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#f8fdf9',
      fontFamily: "'Inter', sans-serif",
      gap: '24px'
    }}>
      {/* Animated Icon */}
      <div style={{
        width: '64px',
        height: '64px',
        borderRadius: '20px',
        background: 'linear-gradient(135deg, #00a651, #007a3d)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: '28px',
        boxShadow: '0 8px 24px rgba(0, 166, 81, 0.2)'
      }}>⚖️</div>

      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#111827', margin: '0 0 8px' }}>LegalAI</h2>
        <p style={{ fontSize: '15px', color: '#6b7280', margin: 0 }}>{status}</p>
      </div>

      {/* Modern Spinner */}
      <div style={{
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        border: '2px solid #d1fae5',
        borderTopColor: '#00a651',
        animation: 'spin 1s linear infinite'
      }} />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
