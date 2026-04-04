'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authAPI } from '@/lib/api';
import { getAdminToken, clearAdminToken } from '@/lib/auth-storage';
import styles from './page.module.css';

export default function AdminChangePasswordPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!getAdminToken()) {
      router.push('/admin');
      return;
    }
    (async () => {
      try {
        const userData = await authAPI.getMeAdmin();
        if (userData?.role !== 'ADMIN') {
          router.push('/admin');
          return;
        }
        setUser(userData);
        if (userData.loginProvider !== 'LOCAL') {
          setError('Tài khoản đăng nhập Google không thể đổi mật khẩu');
        }
      } catch {
        clearAdminToken();
        router.push('/admin');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Vui lòng điền đầy đủ thông tin');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu mới và xác nhận không khớp');
      return;
    }
    if (newPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự');
      return;
    }
    setSubmitting(true);
    try {
      await authAPI.changePasswordAdmin(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Đang tải...</div>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.logoFixed}>LegalAI</div>

      <div className={styles.inner}>
        <Link href="/admin/users" className={styles.backLink}>
          ← Danh sách user
        </Link>

        <h1 className={styles.title}>Đổi mật khẩu admin</h1>
        <p className={styles.intro}>Trang dành cho tài khoản admin. Để bảo mật, không chia sẻ mật khẩu.</p>

        <div className={styles.card}>
          {success ? (
            <div className={styles.successBox}>Đổi mật khẩu thành công.</div>
          ) : user?.loginProvider !== 'LOCAL' ? (
            <p className={styles.errorPlain}>{error}</p>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && <div className={styles.errorBanner}>{error}</div>}
              <div className={styles.field}>
                <label className={styles.label}>Mật khẩu hiện tại</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Nhập mật khẩu hiện tại"
                  autoComplete="current-password"
                  className={styles.input}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Mật khẩu mới</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Ít nhất 6 ký tự"
                  autoComplete="new-password"
                  minLength={6}
                  className={styles.input}
                />
              </div>
              <div className={styles.fieldLast}>
                <label className={styles.label}>Xác nhận mật khẩu mới</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới"
                  autoComplete="new-password"
                  className={styles.input}
                />
              </div>
              <button type="submit" disabled={submitting} className={styles.submitBtn}>
                {submitting ? 'Đang lưu...' : 'Lưu mật khẩu'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
