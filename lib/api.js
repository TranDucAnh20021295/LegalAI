import axios from 'axios';
import { getUserToken, getAdminToken } from './auth-storage';

const API_URL = typeof window !== 'undefined' ? '' : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');
const baseURL = API_URL ? `${API_URL}/api` : '/api';

const userApi = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

const adminApi = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

userApi.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = getUserToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

adminApi.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = getAdminToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export const authAPI = {
  register: async (data) => {
    const response = await userApi.post('/auth/register', data);
    return response.data;
  },

  login: async (data) => {
    const response = await userApi.post('/auth/login', data);
    return response.data;
  },

  getMe: async () => {
    const response = await userApi.get('/auth/me');
    return response.data;
  },

  /** Dùng token admin (trang /admin/*), không dùng chung với user. */
  getMeAdmin: async () => {
    const response = await adminApi.get('/auth/me');
    return response.data;
  },

  logout: async () => {
    await userApi.post('/auth/logout').catch(() => {});
  },

  logoutAdmin: async () => {
    await adminApi.post('/auth/logout').catch(() => {});
  },

  updateProfile: async (data) => {
    const response = await userApi.patch('/auth/me', data);
    return response.data;
  },

  googleLogin: () => {
    window.location.href = API_URL ? `${API_URL}/api/auth/google` : '/api/auth/google';
  },

  forgotPassword: async (email) => {
    const response = await userApi.post('/auth/forgot-password', { email });
    return response.data;
  },

  resetPassword: async (token, newPassword) => {
    const response = await userApi.post('/auth/reset-password', { token, newPassword });
    return response.data;
  },

  changePassword: async (currentPassword, newPassword) => {
    const response = await userApi.post('/auth/change-password', { currentPassword, newPassword });
    return response.data;
  },

  changePasswordAdmin: async (currentPassword, newPassword) => {
    const response = await adminApi.post('/auth/change-password', { currentPassword, newPassword });
    return response.data;
  },
};

export const chatAPI = {
  listConversations: async () => {
    const response = await userApi.get('/chat/conversations');
    return response.data;
  },
  createConversation: async (title) => {
    const response = await userApi.post('/chat/conversations', { title: title || 'Cuộc hội thoại mới' });
    return response.data;
  },
  getConversation: async (id) => {
    const response = await userApi.get(`/chat/conversations/${id}`);
    return response.data;
  },
  renameConversation: async (id, title) => {
    const response = await userApi.patch(`/chat/conversations/${id}`, { title });
    return response.data;
  },
  deleteConversation: async (id) => {
    await userApi.delete(`/chat/conversations/${id}`);
  },
  getMessages: async (conversationId) => {
    const response = await userApi.get(`/chat/conversations/${conversationId}/messages`);
    return response.data;
  },
  sendMessage: async (conversationId, content, senderType = 'USER', documentId = null) => {
    const payload = { content, senderType };
    if (documentId) {
      payload.documentId = documentId;
      payload.document_id = documentId; // Hỗ trợ cả snake_case cho Backend
    }
    const response = await userApi.post(`/chat/conversations/${conversationId}/messages`, payload);
    return response.data;
  },
  askAnonymous: async (content, documentId = null) => {
    const payload = { content };
    if (documentId) {
      payload.documentId = documentId;
      payload.document_id = documentId;
    }
    const response = await userApi.post('/chat/conversations/ask-anonymous', payload);
    return response.data;
  },


  getSubscriptionMe: async () => {
    const response = await userApi.get('/chat/subscriptions/me', {
      params: { _t: Date.now() },
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    });
    return response.data;
  },
  checkoutSubscription: async (plan) => {
    const response = await userApi.post('/chat/subscriptions/checkout', { plan });
    return response.data;
  },
  adminListUsersWithSubscription: async () => {
    const response = await adminApi.get('/chat/subscriptions/admin/users');
    return response.data;
  },
  adminGrantSubscription: async (userId, plan) => {
    const response = await adminApi.post('/chat/subscriptions/admin/grant', {
      userId: String(userId || '').trim(),
      plan,
    });
    return response.data;
  },
  adminRevokeSubscription: async (userId) => {
    const response = await adminApi.post('/chat/subscriptions/admin/revoke', {
      userId: String(userId || '').trim(),
    });
    return response.data;
  },
  adminGetConfig: async () => {
    const response = await adminApi.get('/chat/subscriptions/admin/config');
    return response.data;
  },
  adminUpdateConfig: async (key, value) => {
    const response = await adminApi.put(`/chat/subscriptions/admin/config/${encodeURIComponent(key)}`, { value });
    return response.data;
  },
  adminGetUsage: async () => {
    const response = await adminApi.get('/chat/subscriptions/admin/usage');
    return response.data;
  },
  adminGetUsageStats: async (period = 30) => {
    const response = await adminApi.get(`/chat/subscriptions/admin/usage/stats?period=${period}`);
    return response.data;
  },
  adminCrawlerStart: async () => {
    const response = await adminApi.post('/chat/subscriptions/admin/crawler/start');
    return response.data;
  },
  adminCrawlerStatus: async () => {
    const response = await adminApi.get('/chat/subscriptions/admin/crawler/status');
    return response.data;
  },
  adminCrawlerStop: async () => {
    const response = await adminApi.post('/chat/subscriptions/admin/crawler/stop');
    return response.data;
  },
};

export const documentAPI = {
  search: async (keyword, limit = 50, searchIn = 'all', exact = false, config = {}) => {
    const params = new URLSearchParams();
    if (keyword) params.set('keyword', keyword);
    params.set('limit', limit);
    if (searchIn) params.set('searchIn', searchIn);
    if (exact) params.set('exact', 'true');
    const response = await userApi.get(`/documents/search?${params}`, config);
    return response.data;
  },
  filter: async (field, limit = 50) => {
    const params = new URLSearchParams();
    if (field) params.set('field', field);
    params.set('limit', limit);
    const response = await userApi.get(`/documents/filter?${params}`);
    return response.data;
  },
  getDetail: async (documentId) => {
    const id = encodeURIComponent(String(documentId || '').trim());
    const response = await userApi.get(`/documents/${id}`);
    return response.data;
  },
  searchSemantic: async (query, limit = 24, config = {}) => {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const response = await userApi.get(`/documents/search/semantic?${params}`, config);
    return response.data;
  },
  searchSemanticDocs: async (query, limit = 24, config = {}) => {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const response = await userApi.get(`/documents/search/semantic/docs?${params}`, config);
    return response.data;
  },
  updateDocument: async (documentId, data) => {
    const response = await userApi.put(`/documents/${documentId}`, data);
    return response.data;
  },
  deleteDocument: async (documentId) => {
    const response = await userApi.delete(`/documents/${documentId}`);
    return response.data;
  },
  indexChunks: async (documentId) => {
    const response = await userApi.post('/documents/chunks/index', { documentId });
    return response.data;
  },
  splitAndIndex: async (documentId) => {
    const response = await userApi.post(`/documents/${documentId}/split-and-index`);
    return response.data;
  },
  indexAll: async () => {
    const response = await userApi.post('/documents/index-all');
    return response.data;
  },
};

export const adminAPI = {
  listUsers: async () => {
    const response = await adminApi.get('/auth/admin/users');
    return response.data;
  },
  setUserActive: async (userId, active) => {
    const response = await adminApi.patch(`/auth/admin/users/${userId}/active`, { active: !!active });
    return response.data;
  },
  updateUser: async (userId, data) => {
    const response = await adminApi.patch(`/auth/admin/users/${userId}`, data);
    return response.data;
  },
};

export default userApi;
