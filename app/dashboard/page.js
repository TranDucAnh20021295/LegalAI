'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authAPI, chatAPI } from '@/lib/api';
import { getUserToken, clearUserToken } from '@/lib/auth-storage';
import ChatAiMessage from '@/components/ChatAiMessage';
import shell from './dashboard-shell.module.css';
import styles from './page.module.css';

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState('');
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState({ open: false, conversation: null });
  const [renameDialog, setRenameDialog] = useState({ open: false, conversation: null, title: '' });
  const [conversationMenuId, setConversationMenuId] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const settingsRef = useRef(null);
  const messagesEndRef = useRef(null);

  const [subscription, setSubscription] = useState({ active: false, plan: null, endsAt: null });
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);

  const handleRenameConversation = (conv) => {
    setRenameDialog({
      open: true,
      conversation: conv,
      title: conv.title || 'Cuộc hội thoại mới',
    });
  };

  const handleDeleteConversation = (conv) => {
    setConfirmDelete({ open: true, conversation: conv });
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setSettingsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!getUserToken()) {
      router.push('/');
      return;
    }
    const fetchUser = async () => {
      try {
        const userData = await authAPI.getMe();
        setUser(userData);
      } catch (error) {
        clearUserToken();
        router.push('/');
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [router]);

  useEffect(() => {
    if (!user) return;
    chatAPI.listConversations().then(setConversations).catch(() => setConversations([]));
  }, [user]);

  const syncSubscription = useCallback(
    (withLoading) => {
      if (!user) return Promise.resolve();
      if (withLoading) setSubscriptionLoading(true);
      return chatAPI
        .getSubscriptionMe()
        .then((data) => {
          setSubscription({
            active: !!data.active,
            plan: data.plan || null,
            endsAt: data.endsAt || null,
          });
        })
        .catch(() => setSubscription({ active: false, plan: null, endsAt: null }))
        .finally(() => {
          if (withLoading) setSubscriptionLoading(false);
        });
    },
    [user]
  );

  useEffect(() => {
    syncSubscription(true);
  }, [syncSubscription]);

  useEffect(() => {
    if (!user) return undefined;
    const onVis = () => {
      if (document.visibilityState === 'visible') syncSubscription(false);
    };
    const onFocus = () => syncSubscription(false);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    const t = setInterval(() => syncSubscription(false), 8000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
      clearInterval(t);
    };
  }, [user, syncSubscription]);

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }
    chatAPI.getMessages(activeConversationId).then(setMessages).catch(() => setMessages([]));
  }, [activeConversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const animateAiReply = (aiMsg) => {
    const fullText = aiMsg?.content || '';
    if (!fullText) return;
    const messageId = aiMsg.messageId;
    const createdAt = aiMsg.createdAt || new Date().toISOString();
    const metadata = aiMsg.metadata ?? null;
    setMessages((prev) => [
      ...prev,
      { messageId, content: '', senderType: 'AI', createdAt, metadata },
    ]);
    let index = 0;
    const step = 3;
    const interval = setInterval(() => {
      index += step;
      const slice = fullText.slice(0, index);
      setMessages((prev) =>
        prev.map((m) => (m.messageId === messageId ? { ...m, content: slice, metadata } : m))
      );
      if (index >= fullText.length) {
        clearInterval(interval);
      }
    }, 15);
  };

  const handleNewConversation = async () => {
    // Chỉ reset trạng thái, chưa tạo cuộc hội thoại cho tới khi gửi tin nhắn đầu tiên
    setActiveConversationId(null);
    setMessages([]);
    setQuestion('');
  };

  const handleSend = async () => {
    const text = question.trim();
    if (!text || sending) return;
    if (!subscription.active) return;
    const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const userMessage = {
      messageId: tempId,
      content: text,
      senderType: 'USER',
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setQuestion('');
    setSending(true);
    let createdConv = null;
    try {
      let conversationId = activeConversationId;
      if (!conversationId) {
        const conv = await chatAPI.createConversation();
        createdConv = conv;
        setConversations((prev) => [conv, ...prev]);
        setActiveConversationId(conv.conversationId);
        conversationId = conv.conversationId;
      }

      const res = await chatAPI.sendMessage(conversationId, text, 'USER');
      if (res.aiMessage?.content) {
        animateAiReply(res.aiMessage);
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => prev.filter((m) => m.messageId !== tempId));
      setQuestion(text);
      const st = err?.response?.status;
      if (st === 403) {
        setSubscription({ active: false, plan: null, endsAt: null });
        setSubscriptionLoading(false);
        if (createdConv) {
          setConversations((prev) => prev.filter((c) => c.conversationId !== createdConv.conversationId));
          setActiveConversationId(null);
          setMessages([]);
        }
        syncSubscription(false);
      }
    } finally {
      setSending(false);
    }
  };

  const handleLogout = async () => {
    await authAPI.logout();
    clearUserToken();
    router.push('/');
  };

  if (loading) {
    return <div className={shell.loadingCenter}>Đang tải...</div>;
  }

  const sb = sidebarCollapsed;

  const sendButtonReady = !sending && question.trim().length > 0;

  const showSubscriptionPaywall = !subscription.active && !subscriptionLoading;

  return (
    <div className={shell.layoutRoot}>
      <aside className={`${shell.sidebar} ${sb ? shell.sidebarNarrow : ''}`}>
        <div className={`${shell.sidebarHeader} ${sb ? shell.sidebarHeaderNarrow : ''}`}>
          {!sb && (
            <Link href="/dashboard" className={shell.brandLink}>
              LegalAI
            </Link>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sb)}
            className={`${shell.collapseBtn} ${sb ? shell.collapseBtnNarrow : ''}`}
            title={sb ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`${shell.chevron} ${sb ? shell.chevronRotated : ''}`}
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>

        <button
          type="button"
          onClick={handleNewConversation}
          className={`${shell.sideNavItem} ${sb ? shell.sideNavItemNarrow : ''}`}
          title="Trò chuyện mới"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={shell.iconShrink}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          {!sb && 'Trò chuyện mới'}
        </button>

        <Link
          href="/dashboard/documents"
          className={sb ? shell.sideNavItemDocsNarrow : shell.sideNavItemDocs}
          title="Tra cứu văn bản/án lệ"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={shell.iconShrink}>
            <path d="M12 3v18M8 21h8M10 21V9l2-4 2 4v12M8 9l4-6 4 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {!sb && 'Tra cứu văn bản/án lệ'}
        </Link>

        {!sb && (
          <div className={shell.historySection}>
            <div className={shell.historyLabel}>Lịch sử trò chuyện</div>
            {conversations.length === 0 ? (
              <div className={shell.emptyConvWrap}>
                <div className={shell.emptyConvInner}>
                  <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={shell.emptyConvIcon}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <p className={shell.emptyConvTitle}>Chưa có phiên làm việc nào</p>
                  <p className={shell.emptyConvHint}>Bấm &quot;Trò chuyện mới&quot; để bắt đầu</p>
                </div>
              </div>
            ) : (
              <div className={shell.convList}>
                {conversations.map((c) => (
                  <div
                    key={c.conversationId}
                    className={`conversation-item ${activeConversationId === c.conversationId ? styles.convRowActive : styles.convRow}`}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveConversationId(c.conversationId)}
                      className={styles.convTitleBtn}
                    >
                      {c.title}
                    </button>
                    <button
                      type="button"
                      className={`conversation-menu-btn ${styles.menuBtn}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConversationMenuId((prev) =>
                          prev === c.conversationId ? null : c.conversationId
                        );
                      }}
                      title="Tùy chọn"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="5" r="1.5" />
                        <circle cx="12" cy="12" r="1.5" />
                        <circle cx="12" cy="19" r="1.5" />
                      </svg>
                    </button>
                    {conversationMenuId === c.conversationId && (
                      <div className={styles.dropdownMenu}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConversationMenuId(null);
                            handleRenameConversation(c);
                          }}
                          className={styles.dropdownItem}
                        >
                          Đổi tên hội thoại
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConversationMenuId(null);
                            handleDeleteConversation(c);
                          }}
                          className={styles.dropdownItemDanger}
                        >
                          Xóa hội thoại
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {sb && <div className={shell.sidebarFlexFill} />}

        <div ref={settingsRef} className={shell.settingsWrap}>
          <button
            type="button"
            onClick={() => setSettingsMenuOpen(!settingsMenuOpen)}
            className={`${shell.settingsBtn} ${sb ? shell.settingsBtnNarrow : ''}`}
            title="Cài đặt"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={shell.iconShrink}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            {!sb && 'Cài đặt'}
          </button>

          {settingsMenuOpen && (
            <div className={shell.settingsMenu}>
              <Link href="/dashboard/profile" onClick={() => setSettingsMenuOpen(false)} className={shell.settingsMenuLink}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Hồ sơ cá nhân
              </Link>
              <Link href="/dashboard/change-password" onClick={() => setSettingsMenuOpen(false)} className={shell.settingsMenuLink}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Đổi mật khẩu
              </Link>
              <button type="button" onClick={() => { setSettingsMenuOpen(false); handleLogout(); }} className={shell.settingsMenuButton}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.gridOverlay} aria-hidden />
        <div className={styles.innerColumn}>
          {!activeConversationId ? (
            <div className={styles.welcomeWrap}>
              <div className={styles.welcomeInner}>
                <h1 className={styles.welcomeTitle}>Chào bạn! LegalAI có thể giúp gì cho bạn?</h1>
                <p className={styles.welcomeSub}>
                  Bạn có thể bấm &quot;Trò chuyện mới&quot; hoặc hỏi trực tiếp ở khung bên dưới.
                </p>
              </div>
            </div>
          ) : (
            <div className={styles.msgScroll}>
              {messages.map((m) => (
                <div
                  key={m.messageId || m.createdAt + m.content?.slice(0, 20)}
                  className={m.senderType === 'USER' ? styles.msgUser : styles.msgAi}
                >
                  {m.senderType === 'USER' ? (
                    m.content
                  ) : (
                    <ChatAiMessage content={m.content} metadata={m.metadata} />
                  )}
                </div>
              ))}
              {sending && (
                <div className={styles.typingWrap}>
                  <span className="typing-dots">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          <div className={styles.composerBlock}>
            <div className={styles.composerRow}>
              <div className={styles.inputShell}>
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="Đặt câu hỏi"
                  maxLength={500}
                  className={styles.textInput}
                />
                <button type="button" className={styles.attachBtn} title="Tải lên">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </button>
              </div>
              <button
                type="button"
                onClick={handleSend}
                disabled={!sendButtonReady}
                className={styles.sendBtn}
                title="Gửi"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
            <div className={styles.footerRow}>
              <p className={styles.footerNote}>
                LegalAI không lấy thông tin của người dùng để đào tạo AI model
              </p>
              <span className={styles.counter}>{question.length}/500</span>
            </div>
          </div>
        </div>

        {showSubscriptionPaywall && (
          <div className={styles.paywallBackdrop}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="paywall-title"
              className={styles.paywallCard}
            >
              <div className={styles.paywallIntro}>
                <div id="paywall-title" className={styles.paywallTitle}>
                  Bạn cần mua gói để sử dụng LegalAI
                </div>
                <p className={styles.paywallText}>
                  Gói <strong className={styles.paywallStrong}>1 tháng</strong> —{' '}
                  <strong className={styles.paywallPrice}>10.000 đ/tháng</strong>. Quét mã VietQR bên dưới để thanh toán.
                </p>
              </div>
              <div className={styles.qrBox}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/bidv-vietqr-payment.png"
                  alt="Mã QR VietQR thanh toán gói LegalAI 1 tháng"
                  className={styles.qrImg}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {confirmDelete.open && confirmDelete.conversation && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalBox}>
            <div className={styles.modalHead}>
              <h2 className={styles.modalHeadTitle}>
                Xóa chủ đề {confirmDelete.conversation.title || 'cuộc hội thoại'}
              </h2>
              <button
                type="button"
                onClick={() => setConfirmDelete({ open: false, conversation: null })}
                className={styles.iconClose}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>
            <p className={styles.modalDesc}>
              Bạn có chắc muốn xóa chủ đề này? Hành động này sẽ không thể hoàn tác.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={() => setConfirmDelete({ open: false, conversation: null })}
                className={styles.btnGhost}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={async () => {
                  const conv = confirmDelete.conversation;
                  try {
                    await chatAPI.deleteConversation(conv.conversationId);
                    setConversations((prev) =>
                      prev.filter((c) => c.conversationId !== conv.conversationId)
                    );
                    if (activeConversationId === conv.conversationId) {
                      setActiveConversationId(null);
                      setMessages([]);
                    }
                  } catch (err) {
                    console.error(err);
                  } finally {
                    setConfirmDelete({ open: false, conversation: null });
                  }
                }}
                className={styles.btnDanger}
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {renameDialog.open && renameDialog.conversation && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalBox}>
            <div className={styles.modalHead}>
              <h2 className={styles.modalHeadTitle}>Đổi tên chủ đề</h2>
              <button
                type="button"
                onClick={() => setRenameDialog({ open: false, conversation: null, title: '' })}
                className={styles.iconClose}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>
            <p className={styles.modalDescTight}>Nhập tên mới cho chủ đề này.</p>
            <input
              type="text"
              value={renameDialog.title}
              onChange={(e) =>
                setRenameDialog((prev) => ({ ...prev, title: e.target.value }))
              }
              autoFocus
              maxLength={100}
              className={styles.renameInput}
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  const title = renameDialog.title.trim();
                  if (!title) return;
                  try {
                    const conv = renameDialog.conversation;
                    const updated = await chatAPI.renameConversation(conv.conversationId, title);
                    setConversations((prev) =>
                      prev.map((c) =>
                        c.conversationId === conv.conversationId ? { ...c, title: updated.title } : c
                      )
                    );
                  } catch (err) {
                    console.error(err);
                  } finally {
                    setRenameDialog({ open: false, conversation: null, title: '' });
                  }
                }
              }}
              placeholder="Nhập tên chủ đề"
            />
            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={() => setRenameDialog({ open: false, conversation: null, title: '' })}
                className={styles.btnGhost}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={async () => {
                  const title = renameDialog.title.trim();
                  if (!title) return;
                  try {
                    const conv = renameDialog.conversation;
                    const updated = await chatAPI.renameConversation(conv.conversationId, title);
                    setConversations((prev) =>
                      prev.map((c) =>
                        c.conversationId === conv.conversationId ? { ...c, title: updated.title } : c
                      )
                    );
                  } catch (err) {
                    console.error(err);
                  } finally {
                    setRenameDialog({ open: false, conversation: null, title: '' });
                  }
                }}
                className={styles.btnPrimary}
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
