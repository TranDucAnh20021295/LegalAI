const AUTH_SERVICE_URL = (process.env.AUTH_SERVICE_URL || 'http://localhost:5001').replace(/\/$/, '');
const AUTH_TIMEOUT_MS = Number(process.env.AUTH_TIMEOUT_MS) || 8000;

async function authMiddleware(req, res, next) {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Vui lòng đăng nhập' });

  try {
    // Validate token + lấy user từ auth-service (đúng DB)
    const resp = await fetch(`${AUTH_SERVICE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (!resp.ok) return res.status(401).json({ message: 'Token không hợp lệ' });
    const me = await resp.json();
    req.userId = me.userId != null ? String(me.userId).trim() : null;
    req.userRole = me.role != null ? String(me.role).trim() : '';
    next();
  } catch (e) {
    console.error('[Chat] authMiddleware error:', e.message);
    return res.status(503).json({ message: 'Auth Service chưa sẵn sàng' });
  }
}

module.exports = { authMiddleware };
