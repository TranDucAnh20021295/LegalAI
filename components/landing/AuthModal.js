'use client';

import React from 'react';
import styles from './AuthModal.module.css';
import LoginForm from '../auth/LoginForm';
import RegisterForm from '../auth/RegisterForm';
import ForgotPasswordForm from '../auth/ForgotPasswordForm';

export default function AuthModal({
  authOpen,
  closeAuth,
  authTab,
  setAuthTab,
  user
}) {
  if (!authOpen) return null;

  return (
    <div className={styles.authOverlay}>
      <div className={styles.authModal}>
        <div className={styles.authHeaderGreen}>
          <div className={styles.authHeaderIcon}>
            {authTab === 'login' ? '🔐' : authTab === 'register' ? '✨' : '📧'}
          </div>
          <h2 className={styles.authHeaderTitle}>
            {authTab === 'login' ? 'Chào mừng trở lại'
              : authTab === 'register' ? 'Đăng ký tài khoản'
              : 'Khôi phục mật khẩu'}
          </h2>
          <p className={styles.authHeaderSub}>
            {authTab === 'login' ? 'Đăng nhập để truy cập đầy đủ tính năng'
              : authTab === 'register' ? 'Tham gia cộng đồng pháp luật Việt Nam'
              : 'Chúng tôi sẽ giúp bạn lấy lại mật khẩu'}
          </p>
          <button className={styles.authCloseBtn} onClick={closeAuth}>✕</button>
        </div>

        <div className={styles.authBody}>
          {authTab !== 'forgot' && (
            <div className={styles.authTabs}>
              <button 
                className={`${styles.authTab} ${authTab === 'login' ? styles.authTabActive : ''}`} 
                onClick={() => setAuthTab('login')}
              >
                Đăng nhập
              </button>
              <button 
                className={`${styles.authTab} ${authTab === 'register' ? styles.authTabActive : ''}`} 
                onClick={() => setAuthTab('register')}
              >
                Đăng ký
              </button>
            </div>
          )}

          {authTab === 'login' && <LoginForm modalMode={true} onForgot={() => setAuthTab('forgot')} />}
          {authTab === 'register' && <RegisterForm modalMode={true} />}
          {authTab === 'forgot' && <ForgotPasswordForm onBack={() => setAuthTab('login')} />}
        </div>
      </div>
    </div>
  );
}
