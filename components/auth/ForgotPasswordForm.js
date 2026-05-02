'use client';

import { useState } from 'react';
import { authAPI } from '@/lib/api';
import styles from './auth-form.module.css';

export default function ForgotPasswordForm({ onBack }) {
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
      setSuccess(data.message || 'Một email đã được gửi đến bạn.');
    } catch (err) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.card}>
      <h2 className={styles.title} style={{ textAlign: 'center', marginBottom: 12 }}>Quên mật khẩu</h2>
      <p style={{ textAlign: 'center', fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
        Nhập email của bạn để nhận liên kết khôi phục mật khẩu.
      </p>

      {error && <div className={styles.errorBox}>{error}</div>}
      
      {success ? (
        <div style={{ background: '#e6f7ef', padding: 16, borderRadius: 12, color: '#007a3d', fontSize: 14, textAlign: 'center' }}>
          {success}
          <div style={{ marginTop: 12 }}>
             <button onClick={onBack} className={styles.linkWhite}>Quay lại đăng nhập</button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Nhập email đăng ký"
            required
            className={styles.inputMb}
          />
          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading ? 'Đang xử lý...' : 'Gửi yêu cầu'}
          </button>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button type="button" onClick={onBack} className={styles.linkWhite}>Quay lại đăng nhập</button>
          </div>
        </form>
      )}
    </div>
  );
}
