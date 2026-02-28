'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI } from '@/lib/api';
import SettingsShell from '@/components/SettingsShell';

const Section = ({ title, onEdit, children }) => (
  <div style={{ marginBottom: '32px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
        {title}
      </h2>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit?.(); }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'none',
          border: 'none',
          color: '#1e40af',
          fontSize: '15px',
          cursor: 'pointer',
          padding: '4px 0',
        }}
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
  <div style={{
    padding: '14px 0',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
  }}>
    <span style={{ fontSize: '16px', color: '#64748b', flexShrink: 0 }}>{label}</span>
    <span style={{ fontSize: '16px', color: '#1e293b', textAlign: 'right', wordBreak: 'break-word' }}>
      {value || '—'}
    </span>
  </div>
);

const EditModal = ({ title, label, value, error, saving, onClose, onSave }) => {
  const [draft, setDraft] = useState(value || '');

  useEffect(() => {
    setDraft(value || '');
  }, [value]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '28px 32px',
          width: '100%',
          maxWidth: '440px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
          {title}
        </h2>
        <label style={{ display: 'block', fontSize: '15px', color: '#374151', marginBottom: '8px' }}>
          {label}
        </label>
        <input
          type={label === 'Email' ? 'email' : 'text'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 16px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            fontSize: '16px',
            color: '#1e293b',
            outline: 'none',
            marginBottom: '24px',
            boxSizing: 'border-box',
          }}
        />
        {error && (
          <p style={{ color: '#dc2626', fontSize: '14px', marginBottom: '16px' }}>{error}</p>
        )}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '12px 24px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              fontSize: '15px',
              color: '#374151',
              cursor: 'pointer',
            }}
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={saving}
            style={{
              padding: '12px 24px',
              background: '#1e40af',
              border: 'none',
              borderRadius: '10px',
              fontSize: '15px',
              color: '#ffffff',
              fontWeight: '600',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
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
  const [editModal, setEditModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/');
      return;
    }
    authAPI.getMe().then(setUser).catch(() => router.push('/')).finally(() => setLoading(false));
  }, [router]);

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
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: '#64748b' }}>
        Đang tải...
      </div>
    );
  }

  return (
    <SettingsShell user={user} activeMenu="profile">
      <div style={{ width: '100%' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '600', color: '#1e293b', marginBottom: '32px' }}>
          Hồ sơ cá nhân
        </h1>

        <Section title="Thông tin cá nhân" onEdit={handleEditFullName}>
          <FieldRow label="Họ và tên" value={user?.fullName} />
        </Section>

        <Section title="Địa chỉ Email" onEdit={handleEditEmail}>
          <FieldRow label="Email" value={user?.email} />
        </Section>
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
