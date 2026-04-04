'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authAPI, chatAPI, adminAPI } from '@/lib/api';
import { clearAdminToken } from '@/lib/auth-storage';
import styles from './page.module.css';

function EditIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const u = await authAPI.getMeAdmin();
        if (!mounted) return;
        if (u?.role !== 'ADMIN') {
          router.push('/admin');
          return;
        }
        setMe(u);
      } catch {
        router.push('/admin');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  const refresh = async () => {
    setLoadingUsers(true);
    setError('');
    try {
      const rows = await chatAPI.adminListUsersWithSubscription();
      setUsers(rows || []);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'Không thể tải danh sách user';
      setError(msg);
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (!me) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const sorted = useMemo(
    () => users.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [users]
  );

  const [searchEmail, setSearchEmail] = useState('');
  const [searchName, setSearchName] = useState('');
  const filteredUsers = useMemo(() => {
    const qE = searchEmail.trim().toLowerCase();
    const qN = searchName.trim().toLowerCase();
    if (!qE && !qN) return sorted;
    return sorted.filter((u) => {
      const email = (u.email || '').toLowerCase();
      const name = (u.fullName || '').toLowerCase();
      if (qE && !email.includes(qE)) return false;
      if (qN && !name.includes(qN)) return false;
      return true;
    });
  }, [sorted, searchEmail, searchName]);

  const planFromUser = (u) => {
    if (!u?.subEndsAt) return 'none';
    return u.subPlan === 'year' ? 'year' : 'month';
  };

  const planLabel = (p) => {
    if (p === 'year') return '1 năm';
    if (p === 'month') return '1 tháng';
    return 'Không có gói';
  };

  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    password: '',
    isActive: true,
    plan: 'none',
  });
  const [planBaseline, setPlanBaseline] = useState('none');
  const [editSaving, setEditSaving] = useState(false);
  const [confirmChange, setConfirmChange] = useState(null);

  const openEdit = (u) => {
    const p = planFromUser(u);
    setEditUser(u);
    setPlanBaseline(p);
    setEditForm({
      fullName: u.fullName || '',
      email: u.email || '',
      password: '',
      isActive: u.isActive !== false,
      plan: p,
    });
    setConfirmChange(null);
    setError('');
  };

  const closeEdit = () => {
    if (editSaving) return;
    setEditUser(null);
    setConfirmChange(null);
    setError('');
  };

  const mergeRow = (userId, patch) => {
    setUsers((prev) => prev.map((row) => (row.userId === userId ? { ...row, ...patch } : row)));
  };

  const applyProfileToServer = async () => {
    if (!editUser) return;
    await adminAPI.updateUser(editUser.userId, {
      fullName: editForm.fullName.trim(),
      email: editForm.email.trim(),
      ...(editForm.password.trim() ? { password: editForm.password.trim() } : {}),
    });
    if (editUser.isActive !== editForm.isActive) {
      await adminAPI.setUserActive(editUser.userId, editForm.isActive);
    }
    mergeRow(editUser.userId, {
      fullName: editForm.fullName.trim(),
      email: editForm.email.trim(),
      isActive: editForm.isActive,
    });
  };

  const saveProfileOnly = async () => {
    if (!editUser) return;
    setEditSaving(true);
    try {
      await applyProfileToServer();
      setEditUser(null);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'Không thể lưu thông tin';
      setError(msg);
    } finally {
      setEditSaving(false);
    }
  };

  const handleSave = () => {
    if (!editUser) return;
    if (!editForm.fullName.trim() || !editForm.email.trim()) {
      setError('Vui lòng nhập họ tên và email');
      return;
    }
    setError('');
    if (editForm.plan !== planBaseline) {
      setConfirmChange({ to: editForm.plan });
    } else {
      saveProfileOnly();
    }
  };

  const cancelConfirm = () => {
    setConfirmChange(null);
  };

  const confirmApply = async () => {
    if (!editUser || !confirmChange) return;
    const { to } = confirmChange;
    setEditSaving(true);
    try {
      await applyProfileToServer();
      if (to === 'none') {
        const rev = await chatAPI.adminRevokeSubscription(editUser.userId);
        if (rev?.revokedRows === 0) {
          setError(
            'Không tìm thấy bản ghi gói trong DB cho user này (đã hủy trước đó hoặc userId lệch). Đã cập nhật giao diện; user nên tải lại dashboard.'
          );
        }
        mergeRow(editUser.userId, { subPlan: null, subStartsAt: null, subEndsAt: null });
      } else if (to === 'month') {
        const data = await chatAPI.adminGrantSubscription(editUser.userId, 'month');
        mergeRow(editUser.userId, {
          subPlan: data.plan,
          subStartsAt: data.startsAt,
          subEndsAt: data.endsAt,
        });
      }
      setConfirmChange(null);
      setEditUser(null);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'Không thể lưu';
      setError(msg);
    } finally {
      setEditSaving(false);
    }
  };

  const logout = async () => {
    await authAPI.logoutAdmin();
    clearAdminToken();
    router.push('/admin');
  };

  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const settingsRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setSettingsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (loading) {
    return <div className={styles.loading}>Đang tải...</div>;
  }

  const formatSubDateTime = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
  };

  const sep = (i) => (i < 6 ? styles.cellSep : '');

  return (
    <div className={styles.page}>
      <div className={styles.logoFixed}>LegalAI</div>
      <div ref={settingsRef} className={styles.settingsWrap}>
        <button
          type="button"
          onClick={() => setSettingsMenuOpen((o) => !o)}
          aria-expanded={settingsMenuOpen}
          aria-haspopup="true"
          className={styles.gearBtn}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Cài đặt
        </button>
        {settingsMenuOpen && (
          <div className={styles.dropdown}>
            <Link
              href="/admin/change-password"
              onClick={() => setSettingsMenuOpen(false)}
              className={styles.dropdownLink}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Đổi mật khẩu
            </Link>
            <button
              type="button"
              onClick={() => {
                setSettingsMenuOpen(false);
                logout();
              }}
              className={styles.dropdownBtn}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Đăng xuất
            </button>
          </div>
        )}
      </div>

      <div className={styles.container}>
        <div className={styles.pageTitle}>Danh sách user</div>

        <div className={styles.panel}>
          {error && !editUser && <div className={styles.panelError}>{error}</div>}
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {['Email', 'Tên', 'Role', 'Gói hiện tại', 'Mua gói', 'Hết hạn'].map((h, i) => (
                    <th key={h} className={`${styles.th} ${sep(i)}`.trim()}>
                      {h}
                    </th>
                  ))}
                  <th aria-label="Chỉnh sửa" className={styles.thIcon} />
                </tr>
                <tr>
                  <td className={`${styles.tdFilter} ${sep(0)}`.trim()}>
                    <input
                      type="search"
                      value={searchEmail}
                      onChange={(e) => setSearchEmail(e.target.value)}
                      disabled={loadingUsers}
                      placeholder="Lọc email..."
                      aria-label="Tìm theo email"
                      className={styles.filterInput}
                    />
                  </td>
                  <td className={`${styles.tdFilter} ${sep(1)}`.trim()}>
                    <input
                      type="search"
                      value={searchName}
                      onChange={(e) => setSearchName(e.target.value)}
                      disabled={loadingUsers}
                      placeholder="Lọc tên..."
                      aria-label="Tìm theo tên"
                      className={styles.filterInput}
                    />
                  </td>
                  <td className={`${styles.tdFilter} ${sep(2)}`.trim()} />
                  <td className={`${styles.tdFilter} ${sep(3)}`.trim()} />
                  <td className={`${styles.tdFilter} ${sep(4)}`.trim()} />
                  <td className={`${styles.tdFilter} ${sep(5)}`.trim()} />
                  <td className={styles.tdFilter} />
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.userId}>
                    <td className={`${styles.td} ${sep(0)}`.trim()}>{u.email}</td>
                    <td className={`${styles.td} ${sep(1)}`.trim()}>{u.fullName}</td>
                    <td className={`${styles.td} ${sep(2)}`.trim()}>{u.role}</td>
                    <td className={`${styles.td} ${sep(3)}`.trim()}>
                      {u.subEndsAt ? (
                        <span className={styles.planBadge}>{u.subPlan === 'year' ? '1 năm' : '1 tháng'}</span>
                      ) : (
                        <span className={styles.planNone}>Chưa có gói</span>
                      )}
                    </td>
                    <td className={`${styles.tdMuted} ${sep(4)}`.trim()}>
                      {u.subStartsAt ? formatSubDateTime(u.subStartsAt) : '—'}
                    </td>
                    <td className={`${styles.tdMuted} ${sep(5)}`.trim()}>
                      {u.subEndsAt ? formatSubDateTime(u.subEndsAt) : '—'}
                    </td>
                    <td className={styles.tdCenter}>
                      <button
                        type="button"
                        title="Chỉnh sửa"
                        onClick={() => openEdit(u)}
                        className={styles.editIconBtn}
                      >
                        <EditIcon />
                      </button>
                    </td>
                  </tr>
                ))}
                {loadingUsers && sorted.length === 0 && (
                  <tr>
                    <td colSpan={7} className={styles.emptyCell}>
                      Đang tải danh sách...
                    </td>
                  </tr>
                )}
                {sorted.length === 0 && !loadingUsers && (
                  <tr>
                    <td colSpan={7} className={styles.emptyCell}>
                      Không có dữ liệu.
                    </td>
                  </tr>
                )}
                {sorted.length > 0 && filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={7} className={styles.emptyCell}>
                      Không tìm thấy user phù hợp.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editUser && (
        <div role="presentation" onClick={closeEdit} className={styles.modalOverlay}>
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className={styles.modalDialog}
          >
            <div className={styles.modalTitle}>Chỉnh sửa user</div>

            {error && <div className={styles.modalError}>{error}</div>}

            <label className={styles.label}>Email</label>
            <input
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              disabled={editSaving}
              className={styles.inputMb14}
            />

            <label className={styles.label}>Họ và tên</label>
            <input
              type="text"
              value={editForm.fullName}
              onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
              disabled={editSaving}
              className={styles.inputMb14}
            />

            <label className={styles.label}>Mật khẩu mới (để trống nếu không đổi)</label>
            <input
              type="password"
              autoComplete="new-password"
              value={editForm.password}
              onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
              disabled={editSaving}
              className={styles.inputMb14}
            />

            <label
              className={`${styles.labelRow} ${editSaving ? styles.labelRowDisabled : ''}`.trim()}
            >
              <input
                type="checkbox"
                checked={editForm.isActive}
                onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))}
                disabled={editSaving}
              />
              Tài khoản đang hoạt động
            </label>

            <label className={styles.label}>Gói chat</label>
            <select
              value={editForm.plan}
              onChange={(e) => setEditForm((f) => ({ ...f, plan: e.target.value }))}
              disabled={editSaving}
              className={styles.select}
            >
              {planBaseline === 'year' && (
                <option value="year">1 năm (đang dùng — không cấp mới)</option>
              )}
              <option value="month">1 tháng</option>
              <option value="none">Không có gói</option>
            </select>
            <div className={styles.hint}>
              Chỉ còn gói 1 tháng. User thanh toán qua QR; có thể cấp tay sau khi nhận tiền.
            </div>

            <div className={styles.modalActions}>
              <button type="button" onClick={closeEdit} disabled={editSaving} className={styles.btnSecondary}>
                Đóng
              </button>
              <button type="button" onClick={handleSave} disabled={editSaving} className={styles.btnPrimary}>
                {editSaving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editUser && confirmChange && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmDialog}>
            <div className={styles.confirmTitle}>Xác nhận thay đổi gói</div>
            <p className={styles.confirmText}>
              Đổi gói từ <strong className={styles.strongLight}>{planLabel(planBaseline)}</strong> sang{' '}
              <strong className={styles.strongLight}>{planLabel(confirmChange.to)}</strong>. Thông tin user đã chỉnh cũng
              sẽ được lưu.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                onClick={cancelConfirm}
                disabled={editSaving}
                className={styles.btnGhostConfirm}
              >
                Hủy
              </button>
              <button type="button" onClick={confirmApply} disabled={editSaving} className={styles.btnPrimary}>
                {editSaving ? 'Đang lưu...' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
