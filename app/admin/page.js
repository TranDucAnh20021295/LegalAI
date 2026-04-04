'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI } from '@/lib/api';
import { getAdminToken, setAdminToken } from '@/lib/auth-storage';
import styles from './page.module.css';

export default function AdminLogin() {
  const router = useRouter();
  const [form, setForm] = useState({ email: 'admin123@gmail.com', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getAdminToken()) return;
    authAPI
      .getMeAdmin()
      .then((u) => {
        if (u?.role === 'ADMIN') router.push('/admin/users');
      })
      .catch(() => {});
  }, [router]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authAPI.login({ email: form.email.trim(), password: form.password });
      setAdminToken(res.token);
      const me = await authAPI.getMeAdmin();
      if (me?.role !== 'ADMIN') {
        setError('Tài khoản không có quyền admin.');
        return;
      }
      router.push('/admin/users');
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng nhập thất bại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.hero}>
          <div className={styles.brand}>LegalAI Admin</div>
          <div className={styles.tagline}>Đăng nhập để quản lý user và gói chat</div>
        </div>

        <div className={styles.card}>
          {error && <div className={styles.errorBox}>{error}</div>}
          <form onSubmit={submit}>
            <input
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="Email admin"
              type="email"
              required
              className={styles.inputMb12}
            />
            <input
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              placeholder="Mật khẩu"
              type="password"
              required
              className={styles.inputMb16}
            />
            <button type="submit" disabled={loading} className={styles.submitBtn}>
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập Admin'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
