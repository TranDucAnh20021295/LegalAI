const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const Subscription = require('../models/Subscription');
const pool = require('../config/database');

const router = express.Router();
router.use(authMiddleware);

router.get('/me', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    const sub = await Subscription.findActiveByUserId(req.userId);
    if (!sub) {
      return res.json({ active: false });
    }
    return res.json({
      active: true,
      subscriptionId: sub.subscriptionId,
      plan: sub.plan,
      startsAt: sub.startsAt,
      endsAt: sub.endsAt,
    });
  } catch (error) {
    console.error('[Chat][Subscriptions] get me:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

router.post('/checkout', async (req, res) => {
  try {
    if (String(req.userRole || '').toUpperCase() !== 'ADMIN') {
      return res.status(403).json({
        message: 'Kích hoạt gói do quản trị viên thực hiện sau khi nhận thanh toán.',
      });
    }
    const plan = req.body?.plan === 'month' ? 'month' : null;
    if (!plan) {
      return res.status(400).json({ message: 'Chỉ hỗ trợ gói 1 tháng' });
    }

    const sub = await Subscription.createOrReplace(req.userId, plan);
    res.status(201).json({
      active: true,
      subscriptionId: sub.subscriptionId,
      plan: sub.plan,
      startsAt: sub.startsAt,
      endsAt: sub.endsAt,
      message: 'Thanh toán (mock) thành công',
    });
  } catch (error) {
    console.error('[Chat][Subscriptions] checkout:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

async function requireAdmin(req, res, next) {
  try {
    if (String(req.userRole || '').toUpperCase() !== 'ADMIN') {
      return res.status(403).json({ message: 'Không có quyền' });
    }
    return next();
  } catch (e) {
    return res.status(500).json({ message: 'Lỗi server' });
  }
}

// Admin: danh sách user kèm gói hiện tại (nếu còn hạn)
router.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT 
        u."userId",
        u."fullName",
        u.email,
        u.role,
        u."isActive",
        u."createdAt",
        u."updatedAt",
        s.plan as "subPlan",
        s."startsAt" as "subStartsAt",
        s."endsAt" as "subEndsAt"
      FROM users u
      LEFT JOIN LATERAL (
        SELECT plan, "startsAt", "endsAt"
        FROM chat_subscriptions
        WHERE TRIM(BOTH FROM "userId"::text) = TRIM(BOTH FROM u."userId"::text)
          AND "endsAt" > CURRENT_TIMESTAMP
        ORDER BY "endsAt" DESC
        LIMIT 1
      ) s ON true
      WHERE u.role = 'USER'
      ORDER BY u."createdAt" DESC
      `
    );
    const rows = (result.rows || []).map((row) => ({
      userId: row.userId ?? row.userid,
      fullName: row.fullName ?? row.fullname,
      email: row.email,
      role: row.role,
      isActive: row.isActive ?? row.isactive,
      createdAt: row.createdAt ?? row.createdat,
      updatedAt: row.updatedAt ?? row.updatedat,
      subPlan: row.subPlan ?? row.subplan,
      subStartsAt: row.subStartsAt ?? row.substartsat,
      subEndsAt: row.subEndsAt ?? row.subendsat,
    }));
    res.json(rows);
  } catch (error) {
    console.error('[Chat][Subscriptions][Admin] list users:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// Admin: cấp gói 1 tháng
router.post('/admin/grant', requireAdmin, async (req, res) => {
  try {
    const plan = req.body?.plan === 'month' ? 'month' : null;
    const userId = Subscription.normalizeUserId(req.body?.userId);
    if (!userId) return res.status(400).json({ message: 'Thiếu userId' });
    if (!plan) return res.status(400).json({ message: 'Chỉ hỗ trợ gói 1 tháng' });

    const sub = await Subscription.createOrReplace(userId, plan);
    res.status(201).json({
      userId,
      active: true,
      plan: sub.plan,
      startsAt: sub.startsAt,
      endsAt: sub.endsAt,
    });
  } catch (error) {
    console.error('[Chat][Subscriptions][Admin] grant:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// Admin: hủy gói (set endsAt về hiện tại)
router.post('/admin/revoke', requireAdmin, async (req, res) => {
  try {
    const userId = Subscription.normalizeUserId(req.body?.userId);
    if (!userId) return res.status(400).json({ message: 'Thiếu userId' });
    const r = await pool.query(
      `UPDATE chat_subscriptions
       SET "endsAt" = CURRENT_TIMESTAMP
       WHERE TRIM(BOTH FROM "userId"::text) = $1`,
      [userId]
    );
    if (r.rowCount === 0) {
      console.warn('[Chat][Subscriptions][Admin] revoke: không có dòng chat_subscriptions cho userId=', userId);
    }
    res.json({ userId, active: false, message: 'Đã hủy gói', revokedRows: r.rowCount });
  } catch (error) {
    console.error('[Chat][Subscriptions][Admin] revoke:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

module.exports = router;

