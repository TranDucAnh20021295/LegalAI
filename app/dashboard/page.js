'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authAPI, chatAPI } from '@/lib/api';
import { clearUserToken, getUserToken } from '@/lib/auth-storage';
import ChatAiMessage from '@/components/dashboard/ChatAiMessage';
import styles from './dashboard-shell.module.css';

const FREE_MSG_LIMIT = 10;

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const [sb, setSb] = useState(false); // sidebar collapsed
  const [menuOpen, setMenuOpen] = useState(false);
  const [subscription, setSubscription] = useState({ active: false });
  const [subLoading, setSubLoading] = useState(true);
  const [showPaywall, setShowPaywall] = useState(false);
  const [totalMsgCount, setTotalMsgCount] = useState(0);
  const scrollRef = useRef(null);
  const menuRef = useRef(null);
  const mounted = useRef(false);

  // ── Auth guard (client-side only) ──
  useEffect(() => {
    mounted.current = true;
    const token = getUserToken();
    if (!token) { router.replace('/'); return; }
    authAPI.getMe()
      .then((u) => { if (mounted.current) setUser(u); })
      .catch(() => { clearUserToken(); router.replace('/'); })
      .finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; };
  }, [router]);

  // ── Load conversations ──
  useEffect(() => {
    if (!user) return;
    chatAPI.listConversations()
      .then((list) => {
        setConversations(list || []);
        const count = (list || []).reduce((a, c) => a + (c.messageCount || 0), 0);
        setTotalMsgCount(count);
      })
      .catch(() => {});
    chatAPI.getSubscriptionMe()
      .then((d) => setSubscription({ active: !!d.active, plan: d.plan, endsAt: d.endsAt }))
      .catch(() => setSubscription({ active: false }))
      .finally(() => setSubLoading(false));
  }, [user]);

  // ── Khôi phục hội thoại đang mở từ localStorage ──
  useEffect(() => {
    const saved = localStorage.getItem('legal_ai_last_conv');
    if (saved) setActiveConvId(saved);
  }, []);

  // ── Lưu hội thoại đang mở vào localStorage ──
  useEffect(() => {
    if (activeConvId) {
      localStorage.setItem('legal_ai_last_conv', activeConvId);
    } else {
      localStorage.removeItem('legal_ai_last_conv');
    }
  }, [activeConvId]);

  // ── Load messages when conversation changes ──

  useEffect(() => {
    if (!activeConvId) { setMessages([]); return; }
    chatAPI.getMessages(activeConvId).then(setMessages).catch(() => setMessages([]));
  }, [activeConvId]);

  // ── Auto scroll ──
  useEffect(() => {
    if (messages.length > 0) {
      // Dùng setTimeout để đảm bảo DOM đã render xong hoàn toàn
      const timer = setTimeout(() => {
        scrollRef.current?.scrollIntoView({ 
          behavior: sending ? 'smooth' : 'auto', 
          block: 'end' 
        });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages, sending, activeConvId]);



  // ── Close menu on outside click ──
  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const [editingConvId, setEditingConvId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [menuConvId, setMenuConvId] = useState(null); // ID của hội thoại đang mở menu ...
  const [confirmDeleteId, setConfirmDeleteId] = useState(null); // ID của hội thoại đang chờ xóa

  const handleDeleteConv = async () => {
    if (!confirmDeleteId) return;
    try {
      await chatAPI.deleteConversation(confirmDeleteId);
      setConversations(prev => prev.filter(c => c.conversationId !== confirmDeleteId));
      if (activeConvId === confirmDeleteId) {
        setActiveConvId(null);
        setMessages([]);
      }
    } catch (err) {
      alert('Không thể xóa cuộc hội thoại.');
    } finally {
      setConfirmDeleteId(null);
      setMenuConvId(null);
    }
  };

  const handleStartRename = (e, c) => {
    e.stopPropagation();
    setEditingConvId(c.conversationId);
    setEditingTitle(c.title || 'Cuộc hội thoại');
    setMenuConvId(null);
  };


  const handleFinishRename = async () => {
    if (!editingConvId) return;
    const t = editingTitle.trim();
    if (!t) { setEditingConvId(null); return; }
    try {
      await chatAPI.renameConversation(editingConvId, t);
      setConversations(prev => prev.map(c => c.conversationId === editingConvId ? { ...c, title: t } : c));
    } catch (err) {
      alert('Không thể đổi tên.');
    }
    setEditingConvId(null);
  };

  const handleLogout = async () => {
    await authAPI.logout().catch(() => {});
    clearUserToken();
    router.replace('/');
  };

  const handleNewConv = () => { setActiveConvId(null); setMessages([]); };

  const handleSend = async () => {
    const text = question.trim();
    if (!text || sending) return;

    // Freemium gate
    if (!subscription.active && totalMsgCount >= FREE_MSG_LIMIT) {
      setShowPaywall(true);
      return;
    }

    setSending(true);
    setQuestion('');
    // Optimistic UI
    setMessages(prev => [...prev, { senderType: 'USER', content: text, messageId: 'tmp-' + Date.now() }]);

    try {
      let convId = activeConvId;
      if (!convId) {
        const newConv = await chatAPI.createConversation(text.slice(0, 40));
        setConversations(prev => [newConv, ...prev]);
        setActiveConvId(newConv.conversationId);
        convId = newConv.conversationId;
      }
      const res = await chatAPI.sendMessage(convId, text, 'USER');
      setMessages(prev => {
        const withoutOptimistic = prev.filter(m => !m.messageId?.startsWith('tmp-'));
        return [
          ...withoutOptimistic, 
          res.userMessage || { senderType: 'USER', content: text }, 
          { ...res.aiMessage, isNew: true }
        ];
      });

      setTotalMsgCount(c => c + 1);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 403) {
        setShowPaywall(true);
        setMessages(prev => prev.filter(m => !m.messageId?.startsWith('tmp-')));
      } else {
        setMessages(prev => [...prev.filter(m => !m.messageId?.startsWith('tmp-')), {
          senderType: 'AI', content: '❌ Có lỗi xảy ra. Vui lòng thử lại.'
        }]);
      }
    } finally {
      setSending(false);
    }
  };

  const userInitial = user?.fullName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U';

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Inter, sans-serif', color: '#6b7280' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #e5e7eb', borderTop: '3px solid #00a651', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          Đang tải LegalAI...
        </div>
      </div>
    );
  }

  return (
    <div className={styles.layoutRoot}>
      {/* ── SIDEBAR ── */}
      <aside className={`${styles.sidebar} ${sb ? styles.sidebarNarrow : ''}`}>
        <div className={styles.sidebarHeader}>
          {!sb && (
            <Link href="/" className={styles.brandLink}>
              <div className={styles.logoIcon}>L</div>
              <span>LegalAI</span>
            </Link>
          )}
          <button className={`${styles.collapseBtn} ${sb ? styles.collapseBtnNarrow : ''}`} onClick={() => setSb(!sb)} title={sb ? 'Mở rộng' : 'Thu gọn'}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: sb ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>

        <button className={`${styles.newChatBtn} ${sb ? styles.newChatBtnNarrow : ''}`} onClick={handleNewConv} title="Cuộc hội thoại mới">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {!sb && 'Cuộc hội thoại mới'}
        </button>

        <div className={styles.historySection}>
          {!sb && <div className={styles.historyLabel}>Lịch sử</div>}
          {conversations.length === 0 ? (
            !sb && <div className={styles.emptyHist}>Chưa có cuộc hội thoại nào</div>
          ) : (
            conversations.map(c => (
              <div key={c.conversationId} className={styles.convItemOuter}>
                <button
                  className={`${styles.convItem} ${activeConvId === c.conversationId ? styles.convItemActive : ''}`}
                  onClick={() => setActiveConvId(c.conversationId)}
                  title={c.title || 'Cuộc hội thoại'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  {!sb && (
                    editingConvId === c.conversationId ? (
                      <input
                        autoFocus
                        className={styles.renameInput}
                        value={editingTitle}
                        onChange={e => setEditingTitle(e.target.value)}
                        onBlur={handleFinishRename}
                        onKeyDown={e => { if (e.key === 'Enter') handleFinishRename(); if (e.key === 'Escape') setEditingConvId(null); }}
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span className={styles.convTitle}>{c.title || 'Cuộc hội thoại mới'}</span>
                    )
                  )}
                </button>
                
                {!sb && editingConvId !== c.conversationId && (
                  <div className={styles.convActions}>
                    <button className={styles.dotsBtn} onClick={(e) => { e.stopPropagation(); setMenuConvId(menuConvId === c.conversationId ? null : c.conversationId); }} title="Thao tác">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
                      </svg>
                    </button>
                    {menuConvId === c.conversationId && (
                      <div className={styles.convMenu} onClick={e => e.stopPropagation()}>
                        <button className={styles.convMenuBtn} onClick={(e) => handleStartRename(e, c)}>
                          Đổi tên
                        </button>
                        <button className={`${styles.convMenuBtn} ${styles.convMenuDelete}`} onClick={() => setConfirmDeleteId(c.conversationId)}>
                          Xóa
                        </button>
                      </div>
                    )}
                  </div>
                )}


              </div>
            ))
          )}
        </div>



        {/* Free message counter */}
        {!sb && !subscription.active && !subLoading && (
          <div className={styles.freeCounter}>
            <div className={styles.freeBar}>
              <div className={styles.freeBarFill} style={{ width: `${Math.min(100, (totalMsgCount / FREE_MSG_LIMIT) * 100)}%` }} />
            </div>
            <span className={styles.freeText}>{Math.max(0, FREE_MSG_LIMIT - totalMsgCount)} tin nhắn miễn phí còn lại</span>
          </div>
        )}

        {/* User menu */}
        <div className={styles.userWrap} ref={menuRef}>
          <button className={`${styles.userBtn} ${sb ? styles.userBtnNarrow : ''}`} onClick={() => setMenuOpen(!menuOpen)}>
            <div className={styles.avatar}>{userInitial}</div>
            {!sb && (
              <>
                <span className={styles.userName}>{user?.fullName?.split(' ').pop() || 'Tài khoản'}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 'auto', transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </>
            )}
          </button>
          {menuOpen && (
            <div className={styles.userMenu}>
              <Link href="/dashboard/profile" className={styles.menuItem} onClick={() => setMenuOpen(false)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Hồ sơ cá nhân
              </Link>
              <Link href="/dashboard/change-password" className={styles.menuItem} onClick={() => setMenuOpen(false)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Đổi mật khẩu
              </Link>
              <div className={styles.menuDivider} />
              <button className={`${styles.menuItem} ${styles.menuItemLogout}`} onClick={handleLogout}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className={styles.mainContent}>
        {/* Chat messages */}
        <div className={styles.chatScroll}>
          {messages.length === 0 ? (
            <div className={styles.welcome}>
              <div className={styles.welcomeIcon}>⚖️</div>
              <h1 className={styles.welcomeTitle}>Xin chào, {user?.fullName?.split(' ')[0] || 'bạn'}!</h1>
              <p className={styles.welcomeSub}>Tôi là trợ lý pháp luật AI của LegalAI. Hãy đặt câu hỏi về pháp luật Việt Nam.</p>
              <div className={styles.suggestions}>
                {['Quy định về giờ làm thêm theo luật lao động?', 'Mức phạt vi phạm hợp đồng?', 'Thủ tục đăng ký doanh nghiệp?'].map(s => (
                  <button key={s} className={styles.suggestion} onClick={() => { setQuestion(s); }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={m.messageId || i} className={m.senderType === 'USER' ? styles.msgUserWrap : styles.msgAiWrap}>
                {m.senderType === 'USER' ? (
                  <div className={styles.msgUser}>{m.content}</div>
                ) : (
                  <div className={styles.msgAi}>
                    <div className={styles.aiAvatar}>⚖️</div>
                    <div className={styles.msgAiContent}>
                      <ChatAiMessage content={m.content} metadata={m.metadata} isNew={m.isNew} />
                    </div>

                  </div>
                )}
              </div>
            ))
          )}
          {sending && (
            <div className={styles.msgAiWrap}>
              <div className={styles.msgAi}>
                <div className={styles.aiAvatar}>⚖️</div>
                <div className={styles.typingDots}>
                  <span/><span/><span/>
                </div>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        {/* Composer */}
        <div className={styles.composer}>
          <div className={styles.composerInner}>
            <textarea
              className={styles.composerInput}
              placeholder="Đặt câu hỏi về pháp luật Việt Nam..."
              value={question}
              rows={1}
              onChange={(e) => { setQuestion(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'; }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            />
            <button
              className={styles.sendBtn}
              onClick={handleSend}
              disabled={sending || !question.trim()}
              title="Gửi (Enter)"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
          <p className={styles.composerHint}>Enter để gửi · Shift+Enter xuống dòng</p>
        </div>
      </main>

      {/* ── PAYWALL ── */}
      {showPaywall && (
        <div className={styles.paywallOverlay} onClick={() => setShowPaywall(false)}>
          <div className={styles.paywallCard} onClick={e => e.stopPropagation()}>
            <div className={styles.paywallIcon}>🔒</div>
            <h2 className={styles.paywallTitle}>Hết lượt chat miễn phí</h2>
            <p className={styles.paywallSub}>Bạn đã dùng hết {FREE_MSG_LIMIT} tin nhắn miễn phí. Nâng cấp Premium để chat không giới hạn.</p>
            <div className={styles.qrSection}>
              <div className={styles.qrPlaceholder}>
                <svg width="80" height="80" viewBox="0 0 100 100" fill="none"><rect x="10" y="10" width="35" height="35" rx="4" fill="#007a3d"/><rect x="55" y="10" width="35" height="35" rx="4" fill="#007a3d"/><rect x="10" y="55" width="35" height="35" rx="4" fill="#007a3d"/><rect x="18" y="18" width="19" height="19" rx="2" fill="white"/><rect x="63" y="18" width="19" height="19" rx="2" fill="white"/><rect x="18" y="63" width="19" height="19" rx="2" fill="white"/><rect x="55" y="55" width="10" height="10" rx="1" fill="#007a3d"/><rect x="70" y="55" width="10" height="10" rx="1" fill="#007a3d"/><rect x="55" y="70" width="10" height="10" rx="1" fill="#007a3d"/></svg>
              </div>
              <div className={styles.qrInfo}>
                <div className={styles.qrBank}><strong>Ngân hàng:</strong> Vietcombank</div>
                <div className={styles.qrBank}><strong>STK:</strong> 1234567890</div>
                <div className={styles.qrBank}><strong>Nội dung:</strong> LEGAL [email]</div>
                <div className={styles.qrBank}><strong>Số tiền:</strong> 99.000 VNĐ / tháng</div>
              </div>
            </div>
            <button className={styles.paywallClose} onClick={() => setShowPaywall(false)}>Đóng</button>
          </div>
        </div>
      )}

      {/* ── CONFIRM DELETE MODAL ── */}
      {confirmDeleteId && (
        <div className={styles.paywallOverlay} onClick={() => setConfirmDeleteId(null)}>
          <div className={styles.paywallCard} style={{ maxWidth: 400, padding: 32 }} onClick={e => e.stopPropagation()}>
            <div className={styles.paywallIcon} style={{ fontSize: 40 }}>⚠️</div>
            <h2 className={styles.paywallTitle} style={{ fontSize: 20 }}>Xóa cuộc hội thoại?</h2>
            <p className={styles.paywallSub} style={{ marginBottom: 24 }}>Hành động này không thể hoàn tác. Toàn bộ tin nhắn trong cuộc hội thoại này sẽ bị xóa vĩnh viễn.</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className={styles.paywallClose} style={{ flex: 1 }} onClick={() => setConfirmDeleteId(null)}>Hủy</button>
              <button 
                className={styles.sendBtn} 
                style={{ flex: 1, height: 48, borderRadius: 12, background: '#ef4444' }} 
                onClick={handleDeleteConv}
              >
                Xóa ngay
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
