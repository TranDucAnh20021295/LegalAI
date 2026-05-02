const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const { mountListen } = require('../graceful-listen');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));

// Service URLs
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:5001';
const DOCUMENT_SERVICE_URL = process.env.DOCUMENT_SERVICE_URL || 'http://localhost:5002';
const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || 'http://localhost:5003';

app.use('/api/auth', createProxyMiddleware({
  target: AUTH_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/api/auth': '/auth',
  },
  onError: (err, req, res) => {
    const msg = err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET'
      ? 'Auth Service chưa chạy. Vui lòng khởi động lại (npm run dev) hoặc kiểm tra port 5001.'
      : 'Service temporarily unavailable';
    res.status(503).json({ message: msg });
  },
}));

app.use('/api/documents', createProxyMiddleware({
  target: DOCUMENT_SERVICE_URL,
  changeOrigin: true,
  proxyTimeout: 300000,
  timeout: 300000,
  pathRewrite: { '^/api/documents': '/documents' },
  onError: (err, req, res) => {
    const msg = err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET'
      ? 'Document Service chưa chạy.'
      : 'Service temporarily unavailable';
    res.status(503).json({ message: msg });
  },
}));

app.use('/api/chat', createProxyMiddleware({
  target: CHAT_SERVICE_URL,
  changeOrigin: true,
  proxyTimeout: 300000,
  timeout: 300000,
  pathRewrite: { '^/api/chat': '' },
  onError: (err, req, res) => {
    const msg = err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' ? 'Chat Service chưa chạy.' : 'Service temporarily unavailable';
    res.status(503).json({ message: msg });
  },
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'api-gateway',
    message: 'API Gateway is running',
    services: {
      auth: AUTH_SERVICE_URL,
      documents: DOCUMENT_SERVICE_URL,
      chat: CHAT_SERVICE_URL,
    }
  });
});

// Root
app.get('/', (req, res) => {
  res.json({ 
    message: 'Legal AI System API Gateway',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      documents: '/api/documents',
      chat: '/api/chat',
      health: '/health',
    }
  });
});

const PORT = Number(process.env.PORT) || 8000;

mountListen(app, PORT, 'api-gateway', () => {
  console.log(`Gateway: http://localhost:${PORT} -> Auth: ${AUTH_SERVICE_URL}, Documents: ${DOCUMENT_SERVICE_URL}, Chat: ${CHAT_SERVICE_URL}`);
});
