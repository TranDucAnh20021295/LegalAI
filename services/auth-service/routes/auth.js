const express = require('express');
const crypto = require('crypto');
const passport = require('passport');
const { sendResetEmail } = require('../config/email');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const AuthenticationToken = require('../models/AuthenticationToken');

const router = express.Router();

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:8000/api/auth/google/callback',
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let user = await User.findByEmail(profile.emails[0].value);
          if (!user) {
            user = await User.register({
              fullName: profile.displayName,
              email: profile.emails[0].value,
              loginProvider: 'GOOGLE',
              role: 'USER',
            });
          } else if (user.loginProvider !== 'GOOGLE') {
            return done(null, false, { message: 'Email already registered with different provider' });
          }
          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
}

passport.serializeUser((user, done) => done(null, user.userId));
passport.deserializeUser(async (userId, done) => {
  try {
    const user = await User.findById(userId);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

async function getAuthUserId(req) {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const session = await AuthenticationToken.validateToken(token);
  return session ? session.userId : null;
}

async function requireAdmin(req, res, next) {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: 'Vui lòng đăng nhập' });
    const user = await User.findById(userId);
    if (!user) return res.status(401).json({ message: 'Người dùng không tồn tại' });
    if (user.role !== 'ADMIN') return res.status(403).json({ message: 'Không có quyền' });
    req.adminUser = user;
    next();
  } catch (e) {
    return res.status(500).json({ message: 'Lỗi server' });
  }
}

router.post('/register', async (req, res) => {
  try {
    const { fullName, email, password } = req.body;
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin' });
    }
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: 'Email đã được đăng ký' });
    }
    const user = await User.register({ fullName, email, password, loginProvider: 'LOCAL', role: 'USER' });
    const { tokenValue } = await AuthenticationToken.generateToken(user.userId);
    res.status(201).json({
      message: 'Đăng ký thành công',
      token: tokenValue,
      user: {
        userId: user.userId,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        loginProvider: user.loginProvider,
      },
    });
  } catch (error) {
    console.error('[Auth] Register error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập email và mật khẩu' });
    }
    const user = await User.login(email, password);
    if (!user) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
    }
    if (user.loginProvider !== 'LOCAL') {
      return res.status(401).json({ message: `Vui lòng đăng nhập bằng ${user.loginProvider}` });
    }
    const { tokenValue } = await AuthenticationToken.generateToken(user.userId);
    res.json({
      message: 'Đăng nhập thành công',
      token: tokenValue,
      user: {
        userId: user.userId,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        loginProvider: user.loginProvider,
      },
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (token) await User.logout(token);
    res.json({ message: 'Đã đăng xuất' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
});

router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${process.env.CLIENT_URL || 'http://localhost:3000'}/?error=google_auth_failed`,
  }),
  async (req, res) => {
    const { tokenValue } = await AuthenticationToken.generateToken(req.user.userId);
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/auth/callback?token=${tokenValue}`);
  }
);

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Vui lòng nhập email' });
    const user = await User.findByEmail(email);
    if (!user || user.loginProvider !== 'LOCAL') {
      return res.json({ message: 'Nếu email tồn tại, bạn sẽ nhận được link đặt lại mật khẩu' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await User.setResetToken(email, token, expiresAt);
    const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const resetLink = `${baseUrl}/reset-password?token=${token}`;
    const sent = await sendResetEmail(email, resetLink).catch(() => false);
    if (!sent) return res.status(500).json({ message: 'Không thể gửi email. Vui lòng kiểm tra cấu hình SMTP.' });
    res.json({ message: 'Đã gửi link đặt lại mật khẩu vào email của bạn' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
});

router.post('/change-password', async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: 'Vui lòng đăng nhập' });
    const user = await User.findById(userId);
    if (!user) return res.status(401).json({ message: 'Người dùng không tồn tại' });
    if (user.loginProvider !== 'LOCAL') {
      return res.status(400).json({ message: 'Tài khoản đăng nhập Google không thể đổi mật khẩu' });
    }
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }
    const isValid = await User.verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) return res.status(401).json({ message: 'Mật khẩu hiện tại không đúng' });
    await User.resetPassword(user.userId, newPassword);
    res.json({ message: 'Đổi mật khẩu thành công' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Vui lòng nhập token và mật khẩu mới' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 6 ký tự' });
    }
    const user = await User.findByResetToken(token);
    if (!user) {
      return res.status(400).json({ message: 'Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn' });
    }
    await User.resetPassword(user.userId, newPassword);
    res.json({ message: 'Đặt lại mật khẩu thành công' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
});

router.patch('/me', async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: 'Không có token' });
    const user = await User.findById(userId);
    if (!user) return res.status(401).json({ message: 'Người dùng không tồn tại' });
    const { fullName, email } = req.body;
    if (email && email !== user.email) {
      const existing = await User.findByEmail(email);
      if (existing) return res.status(400).json({ message: 'Email đã được sử dụng' });
    }
    const updateData = {};
    if (fullName !== undefined) updateData.fullName = fullName;
    if (email !== undefined) updateData.email = email;
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'Không có dữ liệu cập nhật' });
    }
    const updated = await User.updateProfile(userId, updateData);
    res.json({
      userId: updated.userId,
      fullName: updated.fullName,
      email: updated.email,
      role: updated.role,
      loginProvider: updated.loginProvider,
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: 'Không có token' });
    const user = await User.findById(userId);
    if (!user) return res.status(401).json({ message: 'Người dùng không tồn tại' });
    res.json({
      userId: user.userId,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      loginProvider: user.loginProvider,
    });
  } catch (error) {
    res.status(401).json({ message: 'Token không hợp lệ' });
  }
});

// Admin: quản lý active user
router.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.findAll();
    res.json(users);
  } catch (error) {
    console.error('[Auth][Admin] list users:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

router.patch('/admin/users/:userId/active', requireAdmin, async (req, res) => {
  try {
    const { active } = req.body || {};
    if (typeof active !== 'boolean') {
      return res.status(400).json({ message: 'Thiếu active (boolean)' });
    }
    const updated = await User.setActive(req.params.userId, active);
    if (!updated) return res.status(404).json({ message: 'Không tìm thấy user' });
    res.json(updated);
  } catch (error) {
    console.error('[Auth][Admin] set active:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// Admin: cập nhật thông tin user (không áp dụng cho tài khoản ADMIN)
router.patch('/admin/users/:userId', requireAdmin, async (req, res) => {
  try {
    const { fullName, email, password } = req.body || {};
    const target = await User.findById(req.params.userId);
    if (!target) return res.status(404).json({ message: 'Không tìm thấy user' });
    if (target.role === 'ADMIN') {
      return res.status(403).json({ message: 'Không thể chỉnh sửa tài khoản admin' });
    }

    const payload = {};
    if (typeof fullName === 'string') {
      const t = fullName.trim();
      if (!t) return res.status(400).json({ message: 'Họ tên không được để trống' });
      payload.fullName = t;
    }
    if (typeof email === 'string') {
      const t = email.trim();
      if (!t) return res.status(400).json({ message: 'Email không được để trống' });
      const existing = await User.findByEmail(t);
      if (existing && existing.userId !== req.params.userId) {
        return res.status(400).json({ message: 'Email đã được sử dụng' });
      }
      payload.email = t;
    }
    if (typeof password === 'string' && password.length > 0) {
      if (password.length < 6) {
        return res.status(400).json({ message: 'Mật khẩu ít nhất 6 ký tự' });
      }
      payload.password = password;
    }

    if (Object.keys(payload).length === 0) {
      return res.json({
        userId: target.userId,
        fullName: target.fullName,
        email: target.email,
        role: target.role,
        loginProvider: target.loginProvider,
        isActive: target.isActive,
      });
    }

    const updated = await User.update(req.params.userId, payload);
    res.json(updated);
  } catch (error) {
    console.error('[Auth][Admin] patch user:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

module.exports = router;
