'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authAPI } from '@/lib/api';

const inputStyle = {
  width: '100%',
  padding: '14px 16px',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '12px',
  fontSize: '15px',
  color: '#f1f5f9',
  outline: 'none',
};

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setToken(searchParams.get('token') || '');
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }
    if (password.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }
    if (!token) {
      setError('Link không hợp lệ');
      return;
    }
    setLoading(true);
    try {
      await authAPI.resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  if (!token && !error) {
    return null;
  }

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

      <div style={{
        position: 'relative',
        zIndex: 1,
        background: '#1e293b',
        borderRadius: '24px',
        padding: '40px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        width: '100%',
        maxWidth: '440px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#ffffff' }}>Đặt lại mật khẩu</h1>
          <Link href="/" style={{ color: '#94a3b8', fontSize: '20px', lineHeight: 1 }}>×</Link>
        </div>

        {success ? (
          <div>
            <p style={{ color: '#86efac', marginBottom: '16px' }}>Đặt lại mật khẩu thành công.</p>
            <Link href="/" style={{ color: '#60a5fa', textDecoration: 'underline' }}>Đăng nhập ngay</Link>
          </div>
        ) : (
          <>
            {error && (
              <div style={{
                padding: '12px',
                marginBottom: '20px',
                background: 'rgba(239, 68, 68, 0.2)',
                color: '#fca5a5',
                borderRadius: '8px',
                fontSize: '14px',
              }}>{error}</div>
            )}

            <form onSubmit={handleSubmit}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mật khẩu mới"
                required
                minLength={6}
                style={{ ...inputStyle, marginBottom: '16px' }}
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Xác nhận mật khẩu mới"
                required
                style={{ ...inputStyle, marginBottom: '24px' }}
              />
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: loading ? '#475569' : '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Đang xử lý...' : 'Đặt lại mật khẩu'}
              </button>
            </form>
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '14px', color: '#94a3b8' }}>
          <Link href="/" style={{ color: '#ffffff', fontWeight: '600' }}>Quay lại đăng nhập</Link>
        </div>
      </div>
    </main>
  );
}
