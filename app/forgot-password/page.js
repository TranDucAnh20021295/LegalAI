'use client';

import { useState } from 'react';
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(null);
    setLoading(true);
    try {
      const data = await authAPI.forgotPassword(email);
      setSuccess(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

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
          <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#ffffff' }}>Quên mật khẩu</h1>
          <Link href="/" style={{ color: '#94a3b8', fontSize: '20px', lineHeight: 1 }}>×</Link>
        </div>

        <p style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '24px' }}>
          Nhập email đăng ký, chúng tôi sẽ gửi link đặt lại mật khẩu cho bạn.
        </p>

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

        {success ? (
          <div style={{
            padding: '16px',
            background: 'rgba(34, 197, 94, 0.2)',
            color: '#86efac',
            borderRadius: '8px',
            fontSize: '14px',
          }}>
            <p style={{ marginBottom: '12px' }}>{success.message}</p>
            <Link href="/" style={{ color: '#60a5fa', textDecoration: 'underline' }}>Quay lại đăng nhập</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Nhập email"
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
              {loading ? 'Đang gửi...' : 'Gửi link đặt lại mật khẩu'}
            </button>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '14px', color: '#94a3b8' }}>
          <Link href="/" style={{ color: '#ffffff', fontWeight: '600' }}>Quay lại đăng nhập</Link>
        </div>
      </div>
    </main>
  );
}
