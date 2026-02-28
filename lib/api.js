import axios from 'axios';

const API_URL = typeof window !== 'undefined' ? '' : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');
const baseURL = API_URL ? `${API_URL}/api` : '/api';

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export const authAPI = {
  register: async (data) => {
    const response = await api.post('/auth/register', data);
    return response.data;
  },
  
  login: async (data) => {
    const response = await api.post('/auth/login', data);
    return response.data;
  },
  
  getMe: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },

  logout: async () => {
    await api.post('/auth/logout').catch(() => {});
  },

  updateProfile: async (data) => {
    const response = await api.patch('/auth/me', data);
    return response.data;
  },
  
  googleLogin: () => {
    window.location.href = API_URL ? `${API_URL}/api/auth/google` : '/api/auth/google';
  },

  forgotPassword: async (email) => {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
  },

  resetPassword: async (token, newPassword) => {
    const response = await api.post('/auth/reset-password', { token, newPassword });
    return response.data;
  },

  changePassword: async (currentPassword, newPassword) => {
    const response = await api.post('/auth/change-password', { currentPassword, newPassword });
    return response.data;
  },
};

export const chatAPI = {
  listConversations: async () => {
    const response = await api.get('/chat/conversations');
    return response.data;
  },
  createConversation: async (title) => {
    const response = await api.post('/chat/conversations', { title: title || 'Cuộc hội thoại mới' });
    return response.data;
  },
  getConversation: async (id) => {
    const response = await api.get(`/chat/conversations/${id}`);
    return response.data;
  },
  renameConversation: async (id, title) => {
    const response = await api.patch(`/chat/conversations/${id}`, { title });
    return response.data;
  },
  deleteConversation: async (id) => {
    await api.delete(`/chat/conversations/${id}`);
  },
  getMessages: async (conversationId) => {
    const response = await api.get(`/chat/conversations/${conversationId}/messages`);
    return response.data;
  },
  sendMessage: async (conversationId, content, senderType = 'USER') => {
    const response = await api.post(`/chat/conversations/${conversationId}/messages`, { content, senderType });
    return response.data;
  },
};

export const documentAPI = {
  search: async (keyword, limit = 50) => {
    const params = new URLSearchParams();
    if (keyword) params.set('keyword', keyword);
    params.set('limit', limit);
    const response = await api.get(`/documents/search?${params}`);
    return response.data;
  },
  filter: async (field, limit = 50) => {
    const params = new URLSearchParams();
    if (field) params.set('field', field);
    params.set('limit', limit);
    const response = await api.get(`/documents/filter?${params}`);
    return response.data;
  },
  getDetail: async (documentId) => {
    const response = await api.get(`/documents/${documentId}`);
    return response.data;
  },
  searchSemantic: async (query, limit = 10) => {
    const params = new URLSearchParams({ q: query, limit });
    const response = await api.get(`/documents/search/semantic?${params}`);
    return response.data;
  },
  indexChunks: async (documentId) => {
    const response = await api.post('/documents/chunks/index', { documentId });
    return response.data;
  },
  splitAndIndex: async (documentId) => {
    const response = await api.post(`/documents/${documentId}/split-and-index`);
    return response.data;
  },
  indexAll: async () => {
    const response = await api.post('/documents/index-all');
    return response.data;
  },
};

export default api;
