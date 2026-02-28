'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authAPI, chatAPI } from '@/lib/api';

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState('');
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const settingsRef = useRef(null);
  const messagesEndRef = useRef(null);

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
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/');
      return;
    }
    const fetchUser = async () => {
      try {
        const userData = await authAPI.getMe();
        setUser(userData);
      } catch (error) {
        localStorage.removeItem('token');
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

  const handleNewConversation = async () => {
    try {
      const conv = await chatAPI.createConversation();
      setConversations((prev) => [conv, ...prev]);
      setActiveConversationId(conv.conversationId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSend = async () => {
    const text = question.trim();
    if (!text || !activeConversationId || sending) return;
    setQuestion('');
    setSending(true);
    try {
      const res = await chatAPI.sendMessage(activeConversationId, text, 'USER');
      if (res.aiMessage) {
        setMessages((prev) => [
          ...prev,
          { content: res.userMessage.content, senderType: 'USER', createdAt: res.userMessage.createdAt },
          { content: res.aiMessage.content, senderType: 'AI', createdAt: res.aiMessage.createdAt },
        ]);
      } else {
        setMessages((prev) => [...prev, { content: text, senderType: 'USER', createdAt: new Date().toISOString() }]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const handleLogout = async () => {
    await authAPI.logout();
    localStorage.removeItem('token');
    router.push('/');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: '#94a3b8' }}>
        Đang tải...
      </div>
    );
  }

  const sidebarWidth = sidebarCollapsed ? 64 : 280;
  const sidebarStyle = {
    width: sidebarWidth,
    minWidth: sidebarWidth,
    minHeight: '100vh',
    background: '#0f172a',
    borderRight: '1px solid #1e293b',
    display: 'flex',
    flexDirection: 'column',
    padding: sidebarCollapsed ? '16px 8px' : '20px 16px',
    transition: 'width 0.2s ease, padding 0.2s ease',
  };

  const mainStyle = {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '40px 40px 32px',
    background: '#0a192f',
    position: 'relative',
    overflow: 'hidden',
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', display: 'flex', background: '#0a192f', overflow: 'hidden' }}>
      <aside style={sidebarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', justifyContent: sidebarCollapsed ? 'stretch' : 'flex-start', width: '100%' }}>
          {!sidebarCollapsed && (
            <Link href="/dashboard" style={{ fontSize: '22px', fontWeight: '700', color: '#ffffff', flex: 1 }}>
              LegalAI
            </Link>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            style={{
              width: sidebarCollapsed ? '100%' : '40px',
              height: '40px',
              minWidth: sidebarCollapsed ? 'auto' : '40px',
              minHeight: '40px',
              borderRadius: '10px',
              background: 'transparent',
              border: sidebarCollapsed ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid #334155',
              color: sidebarCollapsed ? '#ffffff' : '#64748b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: sidebarCollapsed ? 0 : 0,
            }}
            title={sidebarCollapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: sidebarCollapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>

        <button
          onClick={handleNewConversation}
          style={{
            width: '100%',
            height: '40px',
            minHeight: '40px',
            padding: sidebarCollapsed ? '0' : '0 16px',
            background: sidebarCollapsed ? 'transparent' : '#1e293b',
            border: sidebarCollapsed ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid #334155',
            borderRadius: '10px',
            color: '#ffffff',
            fontSize: '15px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            gap: '10px',
            cursor: 'pointer',
            marginBottom: '8px',
          }}
          title="Trò chuyện mới"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          {!sidebarCollapsed && 'Trò chuyện mới'}
        </button>

        <Link
          href="/dashboard/documents"
          style={{
            width: '100%',
            height: '40px',
            minHeight: '40px',
            padding: sidebarCollapsed ? '0' : '0 16px',
            background: sidebarCollapsed ? 'transparent' : '#1e293b',
            border: sidebarCollapsed ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid #334155',
            borderRadius: '10px',
            color: '#ffffff',
            fontSize: '15px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            gap: '10px',
            cursor: 'pointer',
            marginBottom: sidebarCollapsed ? '16px' : '24px',
            textDecoration: 'none',
          }}
          title="Tra cứu văn bản/án lệ"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
            <path d="M12 3v18M8 21h8M10 21V9l2-4 2 4v12M8 9l4-6 4 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {!sidebarCollapsed && 'Tra cứu văn bản/án lệ'}
        </Link>

        {!sidebarCollapsed && (
          <div style={{ flex: 1, overflow: 'auto', marginBottom: '16px' }}>
            {conversations.length === 0 ? (
              <div style={{ border: '1px dashed #334155', borderRadius: '8px', padding: '24px' }}>
                <div style={{ textAlign: 'center', color: '#64748b' }}>
                  <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ margin: '0 auto 12px' }}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <p style={{ fontSize: '14px', marginBottom: '4px' }}>Chưa có phiên làm việc nào</p>
                  <p style={{ fontSize: '12px' }}>Bấm &quot;Trò chuyện mới&quot; để bắt đầu</p>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {conversations.map((c) => (
                  <button
                    key={c.conversationId}
                    onClick={() => setActiveConversationId(c.conversationId)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      background: activeConversationId === c.conversationId ? '#334155' : 'transparent',
                      color: '#e2e8f0',
                      fontSize: '14px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {sidebarCollapsed && <div style={{ flex: 1, minHeight: 16 }} />}

        <div ref={settingsRef} style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #1e293b', position: 'relative' }}>
          <button
            onClick={() => setSettingsMenuOpen(!settingsMenuOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
              gap: '8px',
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: '14px',
              cursor: 'pointer',
              padding: sidebarCollapsed ? '0' : '8px 0',
              width: sidebarCollapsed ? '40px' : '100%',
              height: '40px',
              minWidth: sidebarCollapsed ? '40px' : 'auto',
              minHeight: '40px',
              borderRadius: sidebarCollapsed ? '10px' : 0,
            }}
            title="Cài đặt"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            {!sidebarCollapsed && 'Cài đặt'}
          </button>

          {settingsMenuOpen && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: '100%',
                marginLeft: '8px',
                minWidth: '220px',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '12px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                padding: '8px 0',
                zIndex: 1000,
              }}
            >
              <Link
                href="/dashboard/profile"
                onClick={() => setSettingsMenuOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  color: '#e2e8f0',
                  fontSize: '14px',
                  textDecoration: 'none',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Hồ sơ cá nhân
              </Link>
              <Link
                href="/dashboard/change-password"
                onClick={() => setSettingsMenuOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  color: '#e2e8f0',
                  fontSize: '14px',
                  textDecoration: 'none',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Đổi mật khẩu
              </Link>
              <button
                onClick={() => { setSettingsMenuOpen(false); handleLogout(); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  color: '#e2e8f0',
                  fontSize: '14px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
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

      <main style={mainStyle}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: `
              linear-gradient(rgba(59, 130, 246, 0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(59, 130, 246, 0.03) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
            pointerEvents: 'none',
          }}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
          {!activeConversationId ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <h1 style={{ fontSize: '28px', color: '#60a5fa', fontWeight: '500', textAlign: 'center' }}>
                Chào bạn! Bấm &quot;Trò chuyện mới&quot; để bắt đầu.
              </h1>
            </div>
          ) : (
            <div style={{ flex: 1, overflow: 'auto', padding: '0 8px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {messages.map((m) => (
                <div
                  key={m.messageId || m.createdAt + m.content?.slice(0, 20)}
                  style={{
                    alignSelf: m.senderType === 'USER' ? 'flex-end' : 'flex-start',
                    maxWidth: '80%',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: m.senderType === 'USER' ? '#2563eb' : '#1e293b',
                    color: '#f1f5f9',
                    fontSize: '15px',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {m.content}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}

          <div style={{ position: 'relative', zIndex: 1, width: '100%', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: '#1e293b', border: '1px solid #334155', borderRadius: '12px' }}>
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="Đặt câu hỏi"
                  maxLength={500}
                  disabled={!activeConversationId}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#f1f5f9', fontSize: '15px' }}
                />
                <button style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '2px', display: 'flex' }} title="Tải lên">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </button>
              </div>
              <button
                onClick={handleSend}
                disabled={!activeConversationId || sending || !question.trim()}
                style={{
                  width: '40px',
                  height: '40px',
                  minWidth: '40px',
                  borderRadius: '10px',
                  background: '#2563eb',
                  border: 'none',
                  color: 'white',
                  cursor: activeConversationId && !sending ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: activeConversationId && !sending ? 1 : 0.6,
                }}
                title="Gửi"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', padding: '0 4px' }}>
              <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>LegalAI không lấy thông tin của người dùng để đào tạo AI model</p>
              <span style={{ fontSize: '12px', color: '#64748b' }}>{question.length}/500</span>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
