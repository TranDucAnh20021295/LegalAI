'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import styles from './ChatWidget.module.css';
import { chatAPI } from '@/lib/api';
import ChatAiMessage from '@/components/dashboard/ChatAiMessage';

export default function ChatWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState(null); // { title, content, id }
  const scrollRef = useRef(null);
  
  // Lắng nghe context từ trang chi tiết văn bản
  useEffect(() => {
    const handleContext = (e) => {
      if (e.detail) setContext(e.detail);
    };
    window.addEventListener('SET_CHAT_CONTEXT', handleContext);
    return () => window.removeEventListener('SET_CHAT_CONTEXT', handleContext);
  }, []);

  // Nếu chuyển trang khác, reset context (trừ khi vẫn ở trang vbpl đó)
  useEffect(() => {
    if (!pathname?.startsWith('/vbpl/')) {
      setContext(null);
    }
  }, [pathname]);

  // Auto scroll to bottom khi có tin nhắn mới hoặc widget vừa mở
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // MutationObserver: scroll theo nội dung khi AI đang gõ từng chữ
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const observer = new MutationObserver(() => {
      el.scrollTop = el.scrollHeight;
    });

    observer.observe(el, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [isOpen]); // Kết nối lại observer mỗi khi widget mở/đóng


  // Không hiện widget trên trang Dashboard hoặc Admin
  // Phải đặt sau tất cả hooks để tránh lỗi "Rendered fewer hooks than expected"
  if (pathname?.startsWith('/dashboard') || pathname?.startsWith('/admin')) {
    return null;
  }


  const handleSend = async (e) => {
    e?.preventDefault();
    let text = input.trim();
    if (!text || loading) return;

    setLoading(true);
    setInput('');
    
    const userMsg = { senderType: 'USER', content: text, messageId: Date.now() };
    setMessages(prev => [...prev, userMsg]);

    try {
      // Dùng askAnonymous để không lưu vào Database
      const res = await chatAPI.askAnonymous(text, context?.id);
      
      // Map kết quả trả về vào UI
      setMessages(prev => [...prev, { ...res.aiMessage, isNew: true }]);
    } catch (err) {
      console.error(err);
      const msg = err.response?.status === 401 
        ? 'Bạn cần đăng nhập để sử dụng dịch vụ này.' 
        : 'Có lỗi xảy ra, vui lòng thử lại.';
      setMessages(prev => [...prev, { senderType: 'AI', content: msg }]);
    } finally {
      setLoading(false);
    }
  };





  return (
    <div className={styles.widgetContainer}>
      {/* Floating Button */}
      <button 
        className={`${styles.bubble} ${isOpen ? styles.bubbleActive : ''}`} 
        onClick={() => setIsOpen(!isOpen)}
        title="Chat với trợ lý AI"
      >
        {isOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className={styles.window}>
          <div className={styles.header}>
            <div className={styles.headerTitle}>
              <div className={styles.aiIcon}>⚖️</div>
              <div>
                <div className={styles.aiName}>Trợ lý LegalAI</div>
                <div className={styles.aiStatus}>Trực tuyến</div>
              </div>
            </div>
            <button className={styles.closeBtn} onClick={() => setIsOpen(false)}>×</button>
          </div>

          <div className={styles.chatArea} ref={scrollRef}>
            {context && messages.length === 0 && (
              <div className={styles.contextHint}>
                ✨ Đang hỗ trợ hỏi đáp về: <strong>{context.title}</strong>
              </div>
            )}
            {messages.length === 0 ? (
              <div className={styles.empty}>
                <p>Xin chào! Tôi đã sẵn sàng hỗ trợ bạn tìm hiểu về <strong>{context?.title || 'pháp luật Việt Nam'}</strong>. Bạn cần hỏi điều gì?</p>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={m.messageId || i} className={m.senderType === 'USER' ? styles.userMsgWrap : styles.aiMsgWrap}>
                  {m.senderType === 'USER' ? (
                    <div className={styles.userMsg}>{m.content}</div>
                  ) : (
                    <div className={styles.aiMsg}>
                     <ChatAiMessage content={m.content} metadata={m.metadata} isNew={m.isNew} hideSources={true} />

                    </div>
                  )}
                </div>
              ))
            )}
            {loading && (
              <div className={styles.aiMsgWrap}>
                <div className={styles.typing}>
                  <span></span><span></span><span></span>
                </div>
              </div>
            )}
          </div>

          <div className={styles.footer}>
            {context && (
              <div className={styles.activeContextBar}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
                Hỏi về: {context.title}
              </div>
            )}
            <form className={styles.inputArea} onSubmit={handleSend}>
              <input 
                type="text" 
                placeholder="Nhập câu hỏi của bạn..." 
                value={input}
                onChange={e => setInput(e.target.value)}
                className={styles.input}
              />
              <button type="submit" className={styles.sendBtn} disabled={!input.trim() || loading}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
