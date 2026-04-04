'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authAPI } from '@/lib/api';
import styles from '../auth-page.module.css';

function ResetPasswordInner() {
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
    <main className={styles.main}>
      <Link href="/" className={styles.brandLink}>
        <h1 className={styles.brandTitle}>LegalAI</h1>
      </Link>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h1 className={styles.cardHeading}>Đặt lại mật khẩu</h1>
          <Link href="/" className={styles.cardClose}>
            ×
          </Link>
        </div>

        {success ? (
          <div>
            <p className={styles.successText}>Đặt lại mật khẩu thành công.</p>
            <Link href="/" className={styles.linkBlueUnderline}>
              Đăng nhập ngay
            </Link>
          </div>
        ) : (
          <>
            {error && <div className={styles.alertError}>{error}</div>}

            <form onSubmit={handleSubmit}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mật khẩu mới"
                required
                minLength={6}
                className={styles.inputDarkMb16}
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Xác nhận mật khẩu mới"
                required
                className={styles.inputDarkMb24}
              />
              <button type="submit" disabled={loading} className={styles.primaryBtn}>
                {loading ? 'Đang xử lý...' : 'Đặt lại mật khẩu'}
              </button>
            </form>
          </>
        )}

        <div className={styles.authFooter}>
          <Link href="/" className={styles.authFooterLink}>
            Quay lại đăng nhập
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className={styles.main}>
          <Link href="/" className={styles.brandLink}>
            <h1 className={styles.brandTitle}>LegalAI</h1>
          </Link>
          <p className={styles.cardIntro}>Đang tải…</p>
        </main>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}
