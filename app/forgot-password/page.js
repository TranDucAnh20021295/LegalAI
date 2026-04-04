'use client';

import { useState } from 'react';
import Link from 'next/link';
import { authAPI } from '@/lib/api';
import styles from '../auth-page.module.css';

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
    <main className={styles.main}>
      <Link href="/" className={styles.brandLink}>
        <h1 className={styles.brandTitle}>LegalAI</h1>
      </Link>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h1 className={styles.cardHeading}>Quên mật khẩu</h1>
          <Link href="/" className={styles.cardClose}>
            ×
          </Link>
        </div>

        <p className={styles.cardIntro}>
          Nhập email đăng ký, chúng tôi sẽ gửi link đặt lại mật khẩu cho bạn.
        </p>

        {error && <div className={styles.alertError}>{error}</div>}

        {success ? (
          <div className={styles.alertSuccess}>
            <p className={styles.successParagraph}>{success.message}</p>
            <Link href="/" className={styles.linkBlueUnderline}>
              Quay lại đăng nhập
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Nhập email"
              required
              className={styles.inputDarkMb24}
            />
            <button type="submit" disabled={loading} className={styles.primaryBtn}>
              {loading ? 'Đang gửi...' : 'Gửi link đặt lại mật khẩu'}
            </button>
          </form>
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
