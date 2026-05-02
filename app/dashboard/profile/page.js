'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI, chatAPI } from '@/lib/api';
import { getUserToken } from '@/lib/auth-storage';
import SettingsShell from '@/components/dashboard/SettingsShell';
import styles from './page.module.css';

const Section = ({ title, onEdit, children }) => (
  <div className={styles.section}>
    <div className={styles.sectionHead}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onEdit?.();
        }}
        className={styles.editBtn}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        Chỉnh sửa
      </button>
    </div>
    {children}
  </div>
);

const FieldRow = ({ label, value }) => (
  <div className={styles.fieldRow}>
    <span className={styles.fieldLabel}>{label}</span>
    <span className={styles.fieldValue}>{value || '—'}</span>
  </div>
);

const EditModal = ({ title, label, value, error, saving, onClose, onSave }) => {
  const [draft, setDraft] = useState(value || '');

  useEffect(() => {
    setDraft(value || '');
  }, [value]);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalPanel} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>{title}</h2>
        <label className={styles.modalLabel}>{label}</label>
        <input
          type={label === 'Email' ? 'email' : 'text'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={styles.modalInput}
        />
        {error && <p className={styles.modalError}>{error}</p>}
        <div className={styles.modalActions}>
          <button type="button" onClick={onClose} disabled={saving} className={styles.btnCancel}>
            Hủy
          </button>
          <button type="button" onClick={() => onSave(draft)} disabled={saving} className={styles.btnSave}>
            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState({ active: false, plan: null, endsAt: null });
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [editModal, setEditModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const token = getUserToken();
    if (!token) { router.replace('/'); return; }
    authAPI.getMe()
      .then((u) => { if (mounted.current) setUser(u); })
      .catch(() => router.replace('/'))
      .finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; };
  }, [router]);

  useEffect(() => {
    if (!user) return;
    setSubscriptionLoading(true);
    chatAPI
      .getSubscriptionMe()
      .then((data) => {
        setSubscription({
          active: !!data.active,
          plan: data.plan || null,
          endsAt: data.endsAt || null,
        });
      })
      .catch(() => setSubscription({ active: false, plan: null, endsAt: null }))
      .finally(() => setSubscriptionLoading(false));
  }, [user]);

  const handleEditFullName = () => setEditModal('fullName');
  const handleEditEmail = () => setEditModal('email');

  const handleCloseModal = () => {
    setEditModal(null);
    setError('');
  };

  const handleSave = async (draft) => {
    setError('');
    if (editModal === 'fullName') {
      setSaving(true);
      try {
        const updated = await authAPI.updateProfile({ fullName: draft });
        setUser(updated);
        handleCloseModal();
      } catch (err) {
        setError(err.response?.data?.message || 'Không thể cập nhật');
      } finally {
        setSaving(false);
      }
    } else if (editModal === 'email') {
      setSaving(true);
      try {
        const updated = await authAPI.updateProfile({ email: draft });
        setUser(updated);
        handleCloseModal();
      } catch (err) {
        setError(err.response?.data?.message || 'Không thể cập nhật');
      } finally {
        setSaving(false);
      }
    }
  };

  if (loading) {
    return <div className={styles.loading}>Đang tải...</div>;
  }

  return (
    <SettingsShell user={user} activeMenu="profile">
      <div className={styles.wrap}>
        <h1 className={styles.pageTitle}>Hồ sơ cá nhân</h1>

        <Section title="Thông tin cá nhân" onEdit={handleEditFullName}>
          <FieldRow label="Họ và tên" value={user?.fullName} />
        </Section>

        <Section title="Địa chỉ Email" onEdit={handleEditEmail}>
          <FieldRow label="Email" value={user?.email} />
        </Section>

        <div className={styles.subBlock}>
          <h2 className={styles.subTitle}>Gói chat LegalAI</h2>
          {subscriptionLoading ? (
            <p className={styles.subMuted}>Đang tải…</p>
          ) : subscription.active ? (
            <>
              <FieldRow
                label="Loại gói"
                value={subscription.plan === 'year' ? '1 năm (cũ)' : '1 tháng'}
              />
              <FieldRow
                label="Hết hạn"
                value={
                  subscription.endsAt ? new Date(subscription.endsAt).toLocaleDateString('vi-VN') : '—'
                }
              />
            </>
          ) : (
            <p className={styles.subMuted}>
              Bạn chưa có gói đang hoạt động. Mua hoặc kích hoạt gói tại trang trò chuyện (dashboard) sau khi
              đăng nhập.
            </p>
          )}
        </div>
      </div>

      {editModal === 'fullName' && (
        <EditModal
          title="Thông tin cá nhân"
          label="Họ và tên"
          value={user?.fullName}
          error={error}
          saving={saving}
          onClose={handleCloseModal}
          onSave={handleSave}
        />
      )}
      {editModal === 'email' && (
        <EditModal
          title="Địa chỉ Email"
          label="Email"
          value={user?.email}
          error={error}
          saving={saving}
          onClose={handleCloseModal}
          onSave={handleSave}
        />
      )}
    </SettingsShell>
  );
}
