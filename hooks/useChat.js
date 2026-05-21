'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI, chatAPI } from '@/lib/api';
import { clearUserToken, getUserToken } from '@/lib/auth-storage';

export function useChat() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [subscription, setSubscription] = useState({ active: false, plan: null, endsAt: null });
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    const token = getUserToken();
    if (!token) { router.push('/'); return; }
    try {
      const data = await authAPI.getMe();
      setUser(data);
    } catch {
      clearUserToken();
      router.push('/');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  useEffect(() => {
    if (!user) return;
    chatAPI.listConversations().then(setConversations).catch(() => setConversations([]));
    
    const syncSub = async () => {
      try {
        const data = await chatAPI.getSubscriptionMe();
        setSubscription({ active: !!data.active, plan: data.plan, endsAt: data.endsAt });
      } catch {
        setSubscription({ active: false, plan: null, endsAt: null });
      } finally {
        setSubscriptionLoading(false);
      }
    };
    syncSub();
  }, [user]);

  useEffect(() => {
    if (!activeConversationId) { setMessages([]); return; }
    chatAPI.getMessages(activeConversationId).then(setMessages).catch(() => setMessages([]));
  }, [activeConversationId]);

  const handleSend = async () => {
    const text = question.trim();
    if (!text || sending) return;
    
    const totalSent = conversations.reduce((acc, c) => acc + (c.messageCount || 0), 0);
    if (!subscription.active && totalSent >= 10) return; // Paywall handled in UI

    setSending(true);
    setQuestion('');
    
    try {
      let convId = activeConversationId;
      if (!convId) {
        const newConv = await chatAPI.createConversation(text.slice(0, 40));
        setConversations(prev => [newConv, ...prev]);
        setActiveConversationId(newConv.conversationId);
        convId = newConv.conversationId;
      }
      
      const res = await chatAPI.sendMessage(convId, text, 'USER');
      setMessages(prev => [...prev, { senderType: 'USER', content: text }, res.aiMessage]);
    } catch (err) {
      console.error(err);
      const errorMsg = err.response?.status === 401 
        ? 'Bạn cần đăng nhập để sử dụng dịch vụ này.' 
        : 'Có lỗi xảy ra, vui lòng thử lại.';
      setMessages(prev => [...prev, { senderType: 'USER', content: text }, { senderType: 'AI', content: errorMsg }]);
    } finally {
      setSending(false);
    }
  };

  const handleLogout = async () => {
    await authAPI.logout().catch(() => {});
    clearUserToken();
    router.replace('/');
  };

  return {
    user, loading, conversations, setConversations,
    activeConversationId, setActiveConversationId,
    messages, setMessages, question, setQuestion,
    sending, handleSend, sidebarCollapsed, setSidebarCollapsed,
    settingsOpen, setSettingsOpen, subscription, subscriptionLoading, handleLogout
  };
}
