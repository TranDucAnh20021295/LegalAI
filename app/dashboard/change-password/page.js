'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI } from '@/lib/api';
import { getUserToken, clearUserToken } from '@/lib/auth-storage';
import SettingsShell from '@/components/dashboard/SettingsShell';
import styles from './page.module.css';

const PasswordInput = ({ value, onChange, placeholder, ...props }) => {
  const [show, setShow] = useState(false);
  return (
    <div className={styles.pwWrap}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={styles.pwInput}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className={styles.togglePw}
        tabIndex={-1}
      >
        {show ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
};

export default function ChangePasswordPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const mounted = useRef(false);

  useEffect(() => {
    // Guard runs only after hydration (localStorage available)
    mounted.current = true;
    const token = getUserToken();
    if (!token) {
      router.replace('/');
      return;
    }
    const fetchUser = async () => {
      try {
        const userData = await authAPI.getMe();
        if (!mounted.current) return;
        setUser(userData);
        if (userData.loginProvider !== 'LOCAL') {
          setError('Tài khoản đăng nhập Google không thể đổi mật khẩu trực tiếp.');
        }
      } catch (err) {
        clearUserToken();
        router.replace('/');
      } finally {
        if (mounted.current) setLoading(false);
      }
    };
    fetchUser();
    return () => { mounted.current = false; };
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
      await authAPI.changePassword(currentPassword, newPassword);
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
    <SettingsShell user={user} activeMenu="change-password">
      <div className={styles.wrap}>
        <h1 className={styles.title}>Đổi mật khẩu</h1>
        <p className={styles.intro}>Để bảo mật tài khoản, vui lòng không chia sẻ mật khẩu cho người khác</p>

        {success ? (
          <div className={styles.successBox}>Đổi mật khẩu thành công.</div>
        ) : user?.loginProvider !== 'LOCAL' ? (
          <p className={styles.errorInline}>{error}</p>
        ) : (
          <>
            {error && <div className={styles.errorBanner}>{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Mật khẩu hiện tại <span className={styles.required}>*</span>
                </label>
                <PasswordInput
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Nhập mật khẩu hiện tại"
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Mật khẩu mới <span className={styles.required}>*</span>
                </label>
                <PasswordInput
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nhập mật khẩu mới"
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
              <div className={styles.formGroupLast}>
                <label className={styles.label}>
                  Xác nhận mật khẩu mới <span className={styles.required}>*</span>
                </label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu"
                  required
                  autoComplete="new-password"
                />
              </div>
              <button type="submit" disabled={submitting} className={styles.submitBtn}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                {submitting ? 'Đang xử lý...' : 'Lưu thay đổi'}
              </button>
            </form>
          </>
        )}
      </div>
    </SettingsShell>
  );
}
