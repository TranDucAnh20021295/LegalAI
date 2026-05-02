'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authAPI, chatAPI, adminAPI, documentAPI } from '@/lib/api';
import { clearAdminToken } from '@/lib/auth-storage';
import styles from './page.module.css';

// ── Thành phần biểu đồ SVG tùy chỉnh ──
function SimpleBarChart({ data }) {
  if (!data || data.length === 0) return <div style={{height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b'}}>Không có dữ liệu biểu đồ</div>;
  
  const maxVal = Math.max(...data.map(d => parseInt(d.value, 10)), 1);
  const chartHeight = 200;
  const barWidth = 40;
  const gap = 12;

  return (
    <div style={{ overflowX: 'auto', paddingBottom: '20px' }}>
      <svg width={data.length * (barWidth + gap) + 40} height={chartHeight + 40} style={{ display: 'block' }}>
        {data.map((d, i) => {
          const val = parseInt(d.value, 10);
          const h = (val / maxVal) * chartHeight;
          const x = i * (barWidth + gap) + 20;
          return (
            <g key={i}>
              <rect 
                x={x} 
                y={chartHeight - h + 10} 
                width={barWidth} 
                height={h} 
                fill="url(#greenGrad)" 
                rx="4"
              />
              <text x={x + barWidth/2} y={chartHeight + 25} fontSize="10" textAnchor="middle" fill="#64748b">{d.label}</text>
              <text x={x + barWidth/2} y={chartHeight - h + 5} fontSize="10" fontWeight="bold" textAnchor="middle" fill="#007a3d">{val}</text>
            </g>
          );
        })}
        <defs>
          <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00a651" />
            <stop offset="100%" stopColor="#007a3d" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'users';

  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── Tab: Users State ──
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchEmail, setSearchEmail] = useState('');
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({ fullName: '', email: '', password: '', isActive: true, plan: 'none' });
  const [editSaving, setEditSaving] = useState(false);

  // ── Tab: Config State ──
  const [configs, setConfigs] = useState([]);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saveStatus, setSaveStatus] = useState({});
  const [selectedPromptCat, setSelectedPromptCat] = useState('SYSTEM_PROMPT');
  const [toastMessage, setToastMessage] = useState({ text: '', type: 'success' });

  // ── Tab: Usage State ──
  const [usageStats, setUsageStats] = useState({ chartData: [], totalQuestions: 0, topUsers: [] });
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [period, setPeriod] = useState('7'); // 7 ngày hoặc 30 ngày

  // ── Tab: Crawler State ──
  const [crawlerState, setCrawlerState] = useState({ isRunning: false, currentTask: '', logs: [] });
  const logsEndRef = useRef(null);

  // ── Tab: Documents State ──
  const [docsList, setDocsList] = useState([]);
  const [docsSearchKeyword, setDocsSearchKeyword] = useState('');
  const [docsSearchIn, setDocsSearchIn] = useState('all'); // all, title, documentNumber
  const [docsLoading, setDocsLoading] = useState(false);
  const [editDoc, setEditDoc] = useState(null);

  useEffect(() => {
    authAPI.getMeAdmin().then(u => {
      if (u?.role !== 'ADMIN') return router.push('/admin');
      setMe(u);
      setLoading(false);
    }).catch(() => router.push('/admin'));
  }, [router]);

  useEffect(() => {
    if (!me) return;
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'config') fetchConfigs();
    if (activeTab === 'usage') fetchUsage();
    if (activeTab === 'documents') {
      const timer = setTimeout(() => {
        fetchDocs();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [me, activeTab, period, docsSearchKeyword, docsSearchIn]);

  // Polling cho tab crawler
  useEffect(() => {
    if (activeTab === 'crawler' && me) {
      const poll = setInterval(async () => {
        try {
          const res = await chatAPI.adminCrawlerStatus();
          setCrawlerState(res);
        } catch (e) {}
      }, 2000);
      // Gọi luôn 1 lần đầu
      chatAPI.adminCrawlerStatus().then(setCrawlerState).catch(()=>{});
      return () => clearInterval(poll);
    }
  }, [me, activeTab]);

  // Bỏ auto scroll cưỡng bức để user có thể đọc log cũ thoải mái
  /*
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [crawlerState.logs]);
  */

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try { const data = await chatAPI.adminListUsersWithSubscription(); setUsers(data || []); } catch (e) {} finally { setLoadingUsers(false); }
  };

  const fetchConfigs = async () => {
    setLoadingConfig(true);
    try { const data = await chatAPI.adminGetConfig(); setConfigs(data || []); } catch (e) {} finally { setLoadingConfig(false); }
  };

  const fetchUsage = async () => {
    setLoadingUsage(true);
    try {
      const data = await chatAPI.adminGetUsageStats(period);
      setUsageStats(data);
    } catch (e) {} finally { setLoadingUsage(false); }
  };

  const handleUpdateConfig = async (key, value) => {
    setSaveStatus(p => ({ ...p, [key]: 'saving' }));
    try {
      await chatAPI.adminUpdateConfig(key, value);
      setSaveStatus(p => ({ ...p, [key]: null }));
      setToastMessage({ text: 'Đã lưu cấu hình thành công!', type: 'success' });
      setTimeout(() => setToastMessage({ text: '', type: 'success' }), 3000);
    } catch (e) { 
      setSaveStatus(p => ({ ...p, [key]: null }));
      setToastMessage({ text: 'Lưu thất bại. Vui lòng thử lại!', type: 'error' });
      setTimeout(() => setToastMessage({ text: '', type: 'error' }), 3000);
    }
  };

  const logout = async () => {
    await authAPI.logoutAdmin();
    clearAdminToken();
    router.push('/admin');
  };

  const handleStartCrawler = async () => {
    try {
      await chatAPI.adminCrawlerStart();
      setToastMessage({ text: 'Đã khởi chạy tiến trình cập nhật!', type: 'success' });
      setTimeout(() => setToastMessage({ text: '', type: 'success' }), 3000);
      setCrawlerState(p => ({ ...p, isRunning: true }));
    } catch (e) {
      setToastMessage({ text: e.response?.data?.message || 'Lỗi khởi chạy tiến trình!', type: 'error' });
      setTimeout(() => setToastMessage({ text: '', type: 'error' }), 3000);
    }
  };
  
  const handleStopCrawler = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn dừng tiến trình cập nhật này không?')) return;
    try {
      await chatAPI.adminCrawlerStop();
      setToastMessage({ text: 'Đã gửi yêu cầu dừng tiến trình!', type: 'success' });
      setTimeout(() => setToastMessage({ text: '', type: 'success' }), 3000);
    } catch (e) {
      setToastMessage({ text: e.response?.data?.message || 'Lỗi khi dừng tiến trình!', type: 'error' });
      setTimeout(() => setToastMessage({ text: '', type: 'error' }), 3000);
    }
  };

  const fetchDocs = async () => {
    setDocsLoading(true);
    try {
      const res = await documentAPI.search(docsSearchKeyword, 50, docsSearchIn);
      setDocsList(res || []);
    } catch (e) {} finally { setDocsLoading(false); }
  };

  const handleEditDocSave = async () => {
    try {
      await documentAPI.updateDocument(editDoc.documentId, editDoc);
      setToastMessage({ text: 'Cập nhật văn bản thành công!', type: 'success' });
      setTimeout(() => setToastMessage({ text: '', type: 'success' }), 3000);
      setEditDoc(null);
      fetchDocs();
    } catch (e) {
      setToastMessage({ text: 'Lỗi khi cập nhật văn bản', type: 'error' });
      setTimeout(() => setToastMessage({ text: '', type: 'error' }), 3000);
    }
  };

  const handleDeleteDoc = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa văn bản này?')) return;
    try {
      await documentAPI.deleteDocument(id);
      setToastMessage({ text: 'Đã xóa văn bản!', type: 'success' });
      setTimeout(() => setToastMessage({ text: '', type: 'success' }), 3000);
      fetchDocs();
    } catch (e) {
      setToastMessage({ text: 'Lỗi khi xóa văn bản', type: 'error' });
      setTimeout(() => setToastMessage({ text: '', type: 'error' }), 3000);
    }
  };

  if (loading) return <div className={styles.loading}>Đang tải...</div>;

  return (
    <div className={styles.root}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <div className={styles.sidebarBrand}>LegalAI</div>
          <div className={styles.sidebarSub}>Hệ thống quản trị</div>
        </div>
        <nav className={styles.sidebarNav}>
          <button className={`${styles.navItem} ${activeTab === 'users' ? styles.navItemActive : ''}`} onClick={() => router.push('/admin/users?tab=users')}>
            👥 Người dùng
          </button>
          <button className={`${styles.navItem} ${activeTab === 'documents' ? styles.navItemActive : ''}`} onClick={() => router.push('/admin/users?tab=documents')}>
            📚 Quản lý VBPL
          </button>
          <button className={`${styles.navItem} ${activeTab === 'config' ? styles.navItemActive : ''}`} onClick={() => router.push('/admin/users?tab=config')}>
            ⚙️ Cấu hình hệ thống
          </button>
          <button className={`${styles.navItem} ${activeTab === 'usage' ? styles.navItemActive : ''}`} onClick={() => router.push('/admin/users?tab=usage')}>
            📈 Báo cáo sử dụng
          </button>
          <button className={`${styles.navItem} ${activeTab === 'crawler' ? styles.navItemActive : ''}`} onClick={() => router.push('/admin/users?tab=crawler')}>
            🔄 Crawler Tự động
          </button>
        </nav>
        <div className={styles.sidebarFooter}>
          <button onClick={logout} className={`${styles.sidebarFooterBtn} ${styles.sidebarFooterBtnDanger}`}>🚪 Đăng xuất</button>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topbarTitle}>
            {activeTab === 'users' && <span>Quản lý người dùng</span>}
            {activeTab === 'documents' && <span>Quản lý Văn bản Pháp luật</span>}
            {activeTab === 'config' && <span>Cấu hình hệ thống</span>}
            {activeTab === 'usage' && <span>Báo cáo &amp; Thống kê</span>}
            {activeTab === 'crawler' && <span>Crawler Dữ liệu Tự động</span>}
          </div>
          <div className={styles.topbarRight}>
            <div className={styles.adminChip}><div className={styles.adminAvatar}>{me.email[0].toUpperCase()}</div><span>{me.email}</span></div>
          </div>
        </header>

        <section className={styles.content}>
          {activeTab === 'users' && (
            <div className={styles.panel}>
              <div className={styles.searchRow}>
                <input className={styles.searchInput} placeholder="Tìm kiếm email..." value={searchEmail} onChange={e => setSearchEmail(e.target.value)} />
              </div>
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead><tr><th className={styles.th}>Email</th><th className={styles.th}>Họ tên</th><th className={styles.th}>Trạng thái</th><th className={styles.th}>Gói</th><th className={styles.th}>Hết hạn</th><th className={styles.th}>Hành động</th></tr></thead>
                  <tbody>
                    {users.filter(u => u.email.includes(searchEmail)).map(u => (
                      <tr key={u.userId} className={styles.tr}>
                        <td className={styles.td}>{u.email}</td><td className={styles.td}>{u.fullName}</td>
                        <td className={styles.td}><span className={`${styles.badge} ${u.isActive ? styles.badgeGreen : styles.badgeRed}`}>{u.isActive ? 'Hoạt động' : 'Khóa'}</span></td>
                        <td className={styles.td}><span className={`${styles.badge} ${u.subEndsAt ? styles.badgeGreen : styles.badgeGray}`}>{u.subEndsAt ? 'Premium' : 'Free'}</span></td>
                        <td className={styles.td}>{u.subEndsAt ? new Date(u.subEndsAt).toLocaleDateString('vi-VN') : '—'}</td>
                        <td className={styles.td}><button className={styles.btnSm} onClick={() => { setEditUser(u); setEditForm({ ...u, password: '', plan: u.subPlan || 'none' }); }}>Chỉnh sửa</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'config' && (
            <div className={styles.panel}>
              {/* Cấu hình chung */}
              <div className={styles.configGrid}>
                {configs.filter(c => !c.key.startsWith('PROMPT_CAT_') && c.key !== 'SYSTEM_PROMPT').map(cfg => (
                  <div key={cfg.key} className={styles.configSection}>
                    <label className={styles.label}>{cfg.key}</label>
                    <input className={styles.input} value={cfg.value} onChange={e => setConfigs(prev => prev.map(c => c.key === cfg.key ? {...c, value: e.target.value} : c))} />
                    <div className={styles.configSaveRow}>
                      <button className={styles.btnPrimary} disabled={saveStatus[cfg.key] === 'saving'} onClick={() => handleUpdateConfig(cfg.key, cfg.value)}>{saveStatus[cfg.key] === 'saving' ? 'Đang lưu...' : 'Lưu'}</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quản lý System Prompt theo lĩnh vực */}
              <div className={`${styles.configSection} ${styles.configSectionFull}`} style={{marginTop: '0', margin: '24px'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                  <label className={styles.label} style={{margin: 0}}>Quản lý System Prompt theo lĩnh vực</label>
                  <select 
                    className={styles.select} 
                    style={{width: '250px', padding: '8px 12px'}} 
                    value={selectedPromptCat} 
                    onChange={e => setSelectedPromptCat(e.target.value)}
                  >
                    <option value="SYSTEM_PROMPT">Mặc định (Khác)</option>
                    <option value="PROMPT_CAT_DAN_SU_HON_NHAN_GIA_DINH">Dân sự & Hôn nhân Gia đình</option>
                    <option value="PROMPT_CAT_HINH_SU_AN_NINH_QUOC_PHONG">Hình sự & An ninh Quốc phòng</option>
                    <option value="PROMPT_CAT_KINH_TE_DOANH_NGHIEP">Kinh tế & Doanh nghiệp</option>
                    <option value="PROMPT_CAT_TAI_CHINH_KE_TOAN_THUE">Tài chính - Kế toán - Thuế</option>
                    <option value="PROMPT_CAT_LAO_DONG_BAO_HIEM_XA_HOI">Lao động & Bảo hiểm Xã hội</option>
                    <option value="PROMPT_CAT_DAT_DAI_BAT_DONG_SAN">Đất đai - Bất động sản</option>
                    <option value="PROMPT_CAT_HANH_CHINH">Hành chính</option>
                    <option value="PROMPT_CAT_GIAO_DUC">Giáo dục</option>
                    <option value="PROMPT_CAT_Y_TE">Y tế</option>
                  </select>
                </div>
                
                <textarea 
                  className={styles.textarea} 
                  value={configs.find(c => c.key === selectedPromptCat)?.value || ''} 
                  onChange={e => {
                    const exists = configs.find(c => c.key === selectedPromptCat);
                    if (exists) {
                      setConfigs(prev => prev.map(c => c.key === selectedPromptCat ? {...c, value: e.target.value} : c));
                    } else {
                      setConfigs(prev => [...prev, { key: selectedPromptCat, value: e.target.value }]);
                    }
                  }} 
                  placeholder={`Nhập System Prompt riêng cho lĩnh vực này... (Nếu để trống, AI sẽ dùng Prompt Mặc định)`}
                />
                
                <div className={styles.configSaveRow}>
                  <button 
                    className={styles.btnPrimary} 
                    disabled={saveStatus[selectedPromptCat] === 'saving'} 
                    onClick={() => handleUpdateConfig(selectedPromptCat, configs.find(c => c.key === selectedPromptCat)?.value || '')}
                  >
                    {saveStatus[selectedPromptCat] === 'saving' ? 'Đang lưu...' : 'Lưu Prompt'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'usage' && (
            <div className={styles.usageContainer}>
              <div className={styles.statsRow}>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Tổng lượt chat (<span>{period}</span> ngày qua)</div>
                  <div className={styles.statValue} style={{color: '#00a651'}}><span>{usageStats.totalQuestions}</span></div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Trung bình / ngày</div>
                  <div className={styles.statValue}><span>{Math.round(usageStats.totalQuestions / parseInt(period, 10)) || 0}</span></div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Chọn giai đoạn</div>
                  <select className={styles.select} value={period} onChange={e => setPeriod(e.target.value)} style={{marginTop: '10px'}}>
                    <option value="7">7 ngày qua</option>
                    <option value="30">30 ngày qua</option>
                    <option value="90">3 tháng qua</option>
                  </select>
                </div>
              </div>

              <div className={styles.panel} style={{padding: '24px', marginBottom: '24px'}}>
                <div className={styles.panelTitle} style={{marginBottom: '20px'}}>Biểu đồ tăng trưởng lượt chat</div>
                <SimpleBarChart data={usageStats.chartData} />
              </div>

              <div className={styles.panel}>
                <div className={styles.panelHeader}><div className={styles.panelTitle}>Top 10 người dùng hoạt động mạnh nhất</div></div>
                <div className={styles.tableScroll}>
                  <table className={styles.table}>
                    <thead><tr><th className={styles.th}>Người dùng</th><th className={styles.th}>Số lượt chat</th><th className={styles.th}>Phần trăm đóng góp</th></tr></thead>
                    <tbody>
                      {usageStats.topUsers.map((u, i) => (
                        <tr key={i} className={styles.tr}>
                          <td className={styles.td}><strong>{u.fullName}</strong><div style={{fontSize: '12px', color: '#6b7280'}}>{u.email}</div></td>
                          <td className={styles.td}><span style={{fontWeight: '900', color: '#00a651'}}>{u.totalCount}</span> lượt</td>
                          <td className={styles.td}>
                            <div style={{width: '100%', height: '8px', background: '#f3f4f6', borderRadius: '4px', overflow: 'hidden'}}>
                              <div style={{width: `${(u.totalCount / (usageStats.totalQuestions || 1)) * 100}%`, height: '100%', background: '#00a651'}}></div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: Documents (Quản lý VBPL) ── */}
          {activeTab === 'documents' && (
            <div className={styles.panel}>
              <div className={styles.searchWrapper}>
                <select 
                  className={styles.select} 
                  style={{width: '160px', padding: '12px'}}
                  value={docsSearchIn}
                  onChange={e => setDocsSearchIn(e.target.value)}
                >
                  <option value="all">🔍 Tất cả</option>
                  <option value="title">📄 Tiêu đề</option>
                  <option value="documentNumber">🔢 Số hiệu</option>
                </select>
                <input 
                  type="text" 
                  className={styles.searchInput} 
                  placeholder="Nhập từ khóa tìm kiếm..." 
                  value={docsSearchKeyword}
                  onChange={e => setDocsSearchKeyword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fetchDocs()}
                />
                <button className={styles.btnPrimary} style={{padding: '0 24px'}} onClick={fetchDocs}>Tìm kiếm</button>
              </div>

              {docsLoading ? <div style={{padding: '32px 28px', color: '#64748b', fontSize: '15px'}}>Đang tải dữ liệu...</div> : (
                <div className={styles.tableContainer}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Số Hiệu</th>
                        <th>Tiêu Đề</th>
                        <th>Loại VB</th>
                        <th>Lĩnh Vực</th>
                        <th>Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {docsList.map(doc => (
                        <tr key={doc.documentId}>
                          <td style={{fontWeight: 600, color: '#0f172a'}}>{doc.documentNumber}</td>
                          <td style={{maxWidth: '350px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#334155'}} title={doc.title}>{doc.title}</td>
                          <td><span className={styles.badgeType}>{doc.documentType || 'Khác'}</span></td>
                          <td><span className={styles.badgeField}>{doc.field || 'Chưa phân loại'}</span></td>
                          <td>
                            <button className={styles.btnAction} onClick={async () => {
                              const detail = await documentAPI.getDetail(doc.documentId);
                              setEditDoc(detail);
                            }}>✏️ Sửa</button>
                            <button className={`${styles.btnAction} ${styles.btnDanger}`} onClick={() => handleDeleteDoc(doc.documentId)}>🗑️ Xóa</button>
                          </td>
                        </tr>
                      ))}
                      {docsList.length === 0 && (
                        <tr><td colSpan="5" style={{textAlign: 'center', padding: '48px 24px', color: '#94a3b8', fontSize: '15px'}}>Không tìm thấy văn bản nào.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Cập nhật dữ liệu (Crawler) ── */}
          {activeTab === 'crawler' && (
            <div className={styles.crawlerContainer}>
              <div className={styles.crawlerHeaderCard}>
                  <div className={styles.crawlerHeaderLeft}>
                    <h3>Tiến trình Crawler Tự động</h3>
                    <p>
                      Hệ thống sẽ tự động quét, tải về, chuyển đổi định dạng và đồng bộ các văn bản pháp luật mới nhất vào Cơ sở dữ liệu Vector.
                    </p>
                    
                    {crawlerState.isRunning && (
                      <div className={styles.progressContainer}>
                        <div className={styles.progressHeader}>
                          <span className={styles.progressLabel}>
                            {crawlerState.currentTask === 'CRAWL_NEW_DOCS' && '1/5: Đang tải văn bản...'}
                            {crawlerState.currentTask === 'CONVERT_MD' && '2/5: Đang chuyển đổi định dạng...'}
                            {crawlerState.currentTask === 'SPLIT_AND_SYNC' && '3/5: Đang phân tách Điều luật...'}
                            {crawlerState.currentTask === 'IMPORT_DB' && '4/5: Đang đồng bộ Database...'}
                            {crawlerState.currentTask === 'EMBEDDING' && '5/5: Đang tạo Vector Embedding...'}
                          </span>
                          <span className={styles.progressPct}>
                            {crawlerState.currentTask === 'CRAWL_NEW_DOCS' && '20%'}
                            {crawlerState.currentTask === 'CONVERT_MD' && '40%'}
                            {crawlerState.currentTask === 'SPLIT_AND_SYNC' && '60%'}
                            {crawlerState.currentTask === 'IMPORT_DB' && '80%'}
                            {crawlerState.currentTask === 'EMBEDDING' && '95%'}
                          </span>
                        </div>
                        <div className={styles.progressBar}>
                          <div className={styles.progressFill} style={{
                            width: 
                              crawlerState.currentTask === 'CRAWL_NEW_DOCS' ? '20%' :
                              crawlerState.currentTask === 'CONVERT_MD' ? '40%' :
                              crawlerState.currentTask === 'SPLIT_AND_SYNC' ? '60%' :
                              crawlerState.currentTask === 'IMPORT_DB' ? '80%' :
                              crawlerState.currentTask === 'EMBEDDING' ? '95%' : '0%'
                          }}></div>
                        </div>
                      </div>
                    )}
                  </div>
                <div style={{display: 'flex', gap: '12px'}}>
                  <button 
                    className={styles.btnCrawl} 
                    disabled={crawlerState.isRunning} 
                    onClick={handleStartCrawler}
                  >
                    {crawlerState.isRunning ? '🔄 Đang Cập Nhật...' : '▶️ Bắt Đầu Cập Nhật'}
                  </button>
                  {crawlerState.isRunning && (
                    <button 
                      className={`${styles.btnCrawl} ${styles.btnDanger}`} 
                      style={{background: '#ef4444'}}
                      onClick={handleStopCrawler}
                    >
                      🛑 Dừng Cập Nhật
                    </button>
                  )}
                </div>
              </div>

              <div className={styles.terminalWrapper}>
                <div className={styles.terminalHeader}>
                  <div className={`${styles.macDot} ${styles.dotRed}`}></div>
                  <div className={`${styles.macDot} ${styles.dotYellow}`}></div>
                  <div className={`${styles.macDot} ${styles.dotGreen}`}></div>
                  <span className={styles.terminalTitle}>root@legal-ai:~/crawler</span>
                </div>
                <div className={styles.terminalBody}>
                  {crawlerState.logs.length === 0 && <span style={{color: '#64748b'}}>&gt; Đang chờ lệnh hệ thống...</span>}
                  {crawlerState.logs.map((log, idx) => (
                    <div key={idx} className={styles.logLine} style={{
                      color: log.includes('[ERR]') || log.includes('❌') ? '#ef4444' : 
                             log.includes('✅') || log.includes('HOÀN TẤT') ? '#3b82f6' : 
                             log.includes('====================') ? '#64748b' : 'inherit',
                      marginBottom: '4px'
                    }}>
                      <span style={{color: '#e2e8f0', marginRight: '8px'}}>&gt;</span> {log}
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </div>
          )}

        </section>
      </main>

      {/* Toast Notification */}
      {toastMessage.text && (
        <div className={`${styles.toast} ${toastMessage.type === 'error' ? styles.toastError : ''}`}>
          {toastMessage.type === 'success' ? (
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {toastMessage.text}
        </div>
      )}

      {/* Modal Edit Document */}
      {editDoc && (
        <div className={styles.overlay} onClick={() => setEditDoc(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()} style={{maxWidth: '800px', width: '90%'}}>
            <h2 className={styles.modalTitle}>Chỉnh sửa Văn bản</h2>
            <div className={styles.formGroup}>
              <label className={styles.label}>Tiêu đề</label>
              <input className={styles.input} value={editDoc.title || ''} onChange={e => setEditDoc({...editDoc, title: e.target.value})} />
            </div>
            <div style={{display: 'flex', gap: '16px'}}>
              <div className={styles.formGroup} style={{flex: 1}}>
                <label className={styles.label}>Số hiệu</label>
                <input className={styles.input} value={editDoc.documentNumber || ''} onChange={e => setEditDoc({...editDoc, documentNumber: e.target.value})} />
              </div>
              <div className={styles.formGroup} style={{flex: 1}}>
                <label className={styles.label}>Loại văn bản</label>
                <input className={styles.input} value={editDoc.documentType || ''} onChange={e => setEditDoc({...editDoc, documentType: e.target.value})} />
              </div>
              <div className={styles.formGroup} style={{flex: 1}}>
                <label className={styles.label}>Lĩnh vực</label>
                <input className={styles.input} value={editDoc.field || ''} onChange={e => setEditDoc({...editDoc, field: e.target.value})} />
              </div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Nội dung văn bản</label>
              <textarea 
                className={styles.textarea} 
                style={{height: '300px'}}
                value={editDoc.content || ''} 
                onChange={e => setEditDoc({...editDoc, content: e.target.value})} 
              />
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnSecondary} onClick={() => setEditDoc(null)}>Hủy</button>
              <button className={styles.btnPrimary} onClick={handleEditDocSave}>Lưu Thay Đổi</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Edit User (Giữ nguyên logic cũ) ── */}
      {editUser && (
        <div className={styles.overlay} onClick={() => setEditUser(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Chỉnh sửa: {editUser.email}</h3>
            <div className={styles.inputGroup}><label className={styles.label}>Họ tên</label><input className={styles.input} value={editForm.fullName} onChange={e => setEditForm({...editForm, fullName: e.target.value})} /></div>
            <div className={styles.inputGroup}>
              <label className={styles.label}>Gói cước</label>
              <select className={styles.select} value={editForm.plan} onChange={e => setEditForm({...editForm, plan: e.target.value})}>
                <option value="none">Free (Giới hạn 10 câu/ngày)</option>
                <option value="month">Premium (Không giới hạn)</option>
              </select>
            </div>
            <label className={styles.checkRow}><input type="checkbox" checked={editForm.isActive} onChange={e => setEditForm({...editForm, isActive: e.target.checked})} /> Hoạt động</label>
            <div className={styles.modalFooter}>
              <button className={styles.btnSecondary} onClick={() => setEditUser(null)}>Hủy</button>
              <button className={styles.btnPrimary} onClick={async () => {
                setEditSaving(true);
                try {
                  await adminAPI.updateUser(editUser.userId, { fullName: editForm.fullName });
                  await adminAPI.setUserActive(editUser.userId, editForm.isActive);
                  if (editForm.plan === 'month') await chatAPI.adminGrantSubscription(editUser.userId, 'month');
                  else if (editForm.plan === 'none') await chatAPI.adminRevokeSubscription(editUser.userId);
                  setEditUser(null); fetchUsers();
                } catch(e) { alert('Lỗi'); } finally { setEditSaving(false); }
              }}>{editSaving ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
