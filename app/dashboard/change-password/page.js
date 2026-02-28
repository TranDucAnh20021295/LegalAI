'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI } from '@/lib/api';
import SettingsShell from '@/components/SettingsShell';

const inputStyle = {
  width: '100%',
  padding: '14px 48px 14px 18px',
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  fontSize: '17px',
  color: '#1e293b',
  outline: 'none',
};

const PasswordInput = ({ value, onChange, placeholder, ...props }) => {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={inputStyle}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        style={{
          position: 'absolute',
          right: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          color: '#64748b',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
        }}
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

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/');
      return;
    }
    const fetchUser = async () => {
      try {
        const userData = await authAPI.getMe();
        setUser(userData);
        if (userData.loginProvider !== 'LOCAL') {
          setError('Tài khoản đăng nhập Google không thể đổi mật khẩu');
        }
      } catch (err) {
        localStorage.removeItem('token');
        router.push('/');
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
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
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: '#64748b' }}>
        Đang tải...
      </div>
    );
  }

  return (
    <SettingsShell user={user} activeMenu="change-password">
      <div style={{ width: '100%' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '600', color: '#1e293b', marginBottom: '10px' }}>
          Đổi mật khẩu
        </h1>
        <p style={{ fontSize: '17px', color: '#64748b', marginBottom: '28px' }}>
          Để bảo mật tài khoản, vui lòng không chia sẻ mật khẩu cho người khác
        </p>

        {success ? (
          <div style={{
            padding: '16px',
            background: 'rgba(34, 197, 94, 0.15)',
            borderRadius: '12px',
            color: '#15803d',
          }}>
            Đổi mật khẩu thành công.
          </div>
        ) : user?.loginProvider !== 'LOCAL' ? (
          <p style={{ color: '#dc2626' }}>{error}</p>
        ) : (
          <>
            {error && (
              <div style={{
                padding: '12px',
                marginBottom: '20px',
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#dc2626',
                borderRadius: '8px',
                fontSize: '14px',
              }}>{error}</div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', color: '#374151', fontSize: '17px', fontWeight: '500', marginBottom: '8px' }}>
                  Mật khẩu hiện tại <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <PasswordInput
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Nhập mật khẩu hiện tại"
                  required
                  autoComplete="current-password"
                />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', color: '#374151', fontSize: '17px', fontWeight: '500', marginBottom: '8px' }}>
                  Mật khẩu mới <span style={{ color: '#dc2626' }}>*</span>
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
              <div style={{ marginBottom: '28px' }}>
                <label style={{ display: 'block', color: '#374151', fontSize: '17px', fontWeight: '500', marginBottom: '8px' }}>
                  Xác nhận mật khẩu mới <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu"
                  required
                  autoComplete="new-password"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '14px 28px',
                  background: submitting ? '#94a3b8' : '#1e40af',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '17px',
                  fontWeight: '600',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
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
