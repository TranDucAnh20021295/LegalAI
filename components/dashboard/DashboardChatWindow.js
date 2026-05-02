'use client';

import React, { useRef, useEffect } from 'react';
import ChatAiMessage from './ChatAiMessage';
import styles from './DashboardChat.module.css';

export default function DashboardChatWindow({ messages, sending, user }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  if (messages.length === 0) {
    return (
      <div className={styles.welcome}>
        <div className={styles.welcomeInner}>
          <div className={styles.welcomeIcon}>⚖️</div>
          <h1 className={styles.welcomeTitle}>Xin chào, {user?.fullName?.split(' ').pop() || 'bạn'}!</h1>
          <p className={styles.welcomeSub}>Tôi là trợ lý pháp luật AI. Hãy đặt câu hỏi cho tôi.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.msgScroll}>
      {messages.map((m, i) => (
        <div key={i} className={m.senderType === 'USER' ? styles.msgUser : styles.msgAi}>
          {m.senderType === 'USER' ? (
            m.content
          ) : (
            <ChatAiMessage content={m.content} metadata={m.metadata} />
          )}
        </div>
      ))}
      {sending && (
        <div className={styles.typingWrap}>
          <span className="typing-dots"><span></span><span></span><span></span></span>
        </div>
      )}
      <div ref={scrollRef} />
    </div>
  );
}
