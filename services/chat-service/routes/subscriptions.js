const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const Subscription = require('../models/Subscription');
const pool = require('../config/database');
const { spawn } = require('child_process');
const path = require('path');

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

// Admin: lấy toàn bộ cấu hình hệ thống
router.get('/admin/config', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`SELECT key, value, "updatedAt" FROM system_config ORDER BY key`);
    res.json(result.rows);
  } catch (error) {
    console.error('[Chat][Config] get:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// Admin: cập nhật một cấu hình
router.put('/admin/config/:key', requireAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    if (value === undefined) return res.status(400).json({ message: 'Thiếu value' });
    await pool.query(
      `INSERT INTO system_config (key, value, "updatedAt")
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
      [key, String(value)]
    );
    
    // Xóa Cache trong Redis để RAG cập nhật lập tức
    try {
      const redisClient = require('../lib/redis');
      if (redisClient.isReady) await redisClient.del('system_config_cache');
    } catch(err) {
      console.warn('[Redis] Không thể xóa cache:', err.message);
    }

    res.json({ key, value, updated: true });
  } catch (error) {
    console.error('[Chat][Config] update:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// Admin: thống kê lượt chat hôm nay
router.get('/admin/usage', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u."userId", u.email, u."fullName", d.count, d.date
      FROM daily_chat_usage d
      JOIN users u ON u."userId" = d."userId"
      WHERE d.date = CURRENT_DATE
      ORDER BY d.count DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('[Chat][Usage] get:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// Admin: Thống kê nâng cao (Biểu đồ + Top user)
router.get('/admin/usage/stats', requireAdmin, async (req, res) => {
  try {
    const period = req.query.period || '30'; // Mặc định 30 ngày
    const days = parseInt(period, 10) || 30;

    // 1. Dữ liệu biểu đồ (Số câu hỏi theo từng ngày)
    const chartRes = await pool.query(`
      SELECT 
        TO_CHAR(date, 'DD/MM') as label,
        SUM(count) as value
      FROM daily_chat_usage
      WHERE date >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY date
      ORDER BY date ASC
    `);

    // 2. Tổng số câu hỏi trong giai đoạn
    const totalRes = await pool.query(`
      SELECT SUM(count) as total FROM daily_chat_usage
      WHERE date >= CURRENT_DATE - INTERVAL '${days} days'
    `);

    // 3. Top user trong giai đoạn
    const topRes = await pool.query(`
      SELECT u.email, u."fullName", SUM(d.count) as "totalCount"
      FROM daily_chat_usage d
      JOIN users u ON u."userId" = d."userId"
      WHERE d.date >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY u.email, u."fullName"
      ORDER BY "totalCount" DESC
      LIMIT 10
    `);

    res.json({
      chartData: chartRes.rows,
      totalQuestions: totalRes.rows[0]?.total || 0,
      topUsers: topRes.rows,
    });
  } catch (error) {
    console.error('[Chat][UsageStats] get:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// ── Admin Crawler API ──
let crawlerState = { isRunning: false, currentTask: '', logs: [] };
let currentCrawlerProcess = null; // Lưu reference tới process đang chạy

function runPython(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd });
    currentCrawlerProcess = proc; 
    proc.stdout.on('data', data => {
      const txt = data.toString().trim();
      if(txt) crawlerState.logs.push(...txt.split('\n'));
      if(crawlerState.logs.length > 500) crawlerState.logs = crawlerState.logs.slice(-500);
    });
    proc.stderr.on('data', data => {
      const txt = data.toString().trim();
      if(txt) crawlerState.logs.push(...txt.split('\n').map(l => `[ERR] ${l}`));
      if(crawlerState.logs.length > 500) crawlerState.logs = crawlerState.logs.slice(-500);
    });
    proc.on('close', code => {
      currentCrawlerProcess = null;
      if (code !== 0) {
        if (code === null) reject(new Error('Tiến trình bị dừng bởi người dùng.'));
        else reject(new Error(`Thoát với mã lỗi ${code}`));
      }
      else resolve();
    });
  });
}

router.post('/admin/crawler/start', requireAdmin, async (req, res) => {
  if (crawlerState.isRunning) {
    return res.status(400).json({ message: 'Hệ thống đang cập nhật rồi!' });
  }
  
  crawlerState.isRunning = true;
  crawlerState.logs = ['[Hệ thống] Bắt đầu quá trình cập nhật VBPL tự động...'];
  res.json({ message: 'Đã bắt đầu tiến trình cập nhật.' });

  // Đường dẫn tới thư mục dữ liệu legal-crawler, thư mục code crawler và python trong venv mới
  const dataPath = path.resolve(__dirname, '../../../legal-crawler');
  const codePath = path.resolve(__dirname, '../crawler');
  const pythonPath = path.join(codePath, 'venv', 'Scripts', 'python.exe');

  try {
    crawlerState.currentTask = 'CRAWL_NEW_DOCS';
    crawlerState.logs.push('======================================');
    crawlerState.logs.push('[1/5] Đang kiểm tra và tải văn bản mới nhất từ trang chủ...');
    await runPython(pythonPath, ['-u', path.join(codePath, 'crawler.py'), '--homepage-new', '--output', 'newvbpl_data'], dataPath);

    // Kiểm tra xem có văn bản mới không
    const hasNewDocs = crawlerState.logs.some(l => l.includes('CRAWLER_SIGNAL: NEW_DOCS_COUNT'));
    const noNewDocs = crawlerState.logs.some(l => l.includes('CRAWLER_SIGNAL: NO_NEW_DOCS'));

    if (noNewDocs && !hasNewDocs) {
      crawlerState.logs.push('--------------------------------------');
      crawlerState.logs.push('ℹ️ KHÔNG CÓ VĂN BẢN PHÁP LUẬT MỚI NÀO ĐƯỢC TÌM THẤY.');
      crawlerState.logs.push('✅ QUÁ TRÌNH KẾT THÚC SỚM.');
      crawlerState.logs.push('======================================');
      return;
    }

    crawlerState.currentTask = 'CONVERT_MD';
    crawlerState.logs.push('======================================');
    crawlerState.logs.push('[2/5] Chuyển đổi định dạng Word/PDF sang Markdown...');
    await runPython(pythonPath, ['-u', path.join(codePath, 'convert_to_md.py'), '--update'], dataPath);

    crawlerState.currentTask = 'SPLIT_AND_SYNC';
    crawlerState.logs.push('======================================');
    crawlerState.logs.push('[3/5] Phân tách Điều luật...');
    await runPython(pythonPath, ['-u', path.join(codePath, 'split_by_articles.py'), '--update'], dataPath);

    crawlerState.currentTask = 'IMPORT_DB';
    crawlerState.logs.push('======================================');
    crawlerState.logs.push('[4/5] Đồng bộ Văn bản và Điều luật vào Database...');
    await runPython(pythonPath, ['-u', path.join(codePath, 'import_vbplmd.py'), '--update'], dataPath);
    await runPython(pythonPath, ['-u', path.join(codePath, 'import_articles_pg.py'), '--update'], dataPath);

    crawlerState.currentTask = 'EMBEDDING';
    crawlerState.logs.push('======================================');
    crawlerState.logs.push('[5/5] Đang tạo Vector Embedding cho các Điều luật mới...');
    // Gọi script Node.js từ trong service
    const docServicePath = path.resolve(__dirname, '../../document-service');
    await runPython('node', ['embed_all.js', '--recent-limit', '1000'], docServicePath);

    crawlerState.logs.push('======================================');
    crawlerState.logs.push('✅ QUÁ TRÌNH CẬP NHẬT HOÀN TẤT THÀNH CÔNG!');
  } catch (err) {
    crawlerState.logs.push(`❌ Cập nhật thất bại tại bước ${crawlerState.currentTask}: ${err.message}`);
  } finally {
    crawlerState.isRunning = false;
    crawlerState.currentTask = '';
  }
});

router.get('/admin/crawler/status', requireAdmin, (req, res) => {
  res.json(crawlerState);
});

router.post('/admin/crawler/stop', requireAdmin, (req, res) => {
  if (!crawlerState.isRunning || !currentCrawlerProcess) {
    return res.status(400).json({ message: 'Không có tiến trình nào đang chạy.' });
  }

  try {
    // Kill toàn bộ group process (nếu cần trên linux là -pid, windows là taskkill)
    if (process.platform === 'win32') {
      const { exec } = require('child_process');
      exec(`taskkill /pid ${currentCrawlerProcess.pid} /T /F`);
    } else {
      currentCrawlerProcess.kill('SIGINT');
    }
    
    crawlerState.logs.push('⚠️ [Hệ thống] Nhận lệnh dừng từ Admin. Đang tắt tiến trình...');
    res.json({ message: 'Đã gửi lệnh dừng tới hệ thống.' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi khi dừng tiến trình: ' + err.message });
  }
});

module.exports = router;
