const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const Subscription = require('../models/Subscription');
const pool = require('../config/database');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');


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
let currentCrawlerProcess = null;
let crawlerStopRequested = false;
const activeCrawlerProcesses = new Set();

function assertCrawlerNotStopped() {
  if (crawlerStopRequested) {
    throw new Error('Tiến trình bị dừng bởi người dùng.');
  }
}

function getCrawlerStopFlagPath(dataPath) {
  return path.join(dataPath || path.resolve(__dirname, '../../../legal-crawler'), '.crawler_stop');
}

function writeCrawlerStopFlag(dataPath) {
  try {
    fs.writeFileSync(getCrawlerStopFlagPath(dataPath), String(Date.now()), 'utf8');
  } catch {
    // ignore
  }
}

function clearCrawlerStopFlag(dataPath) {
  try {
    const flag = getCrawlerStopFlagPath(dataPath);
    if (fs.existsSync(flag)) fs.unlinkSync(flag);
  } catch {
    // ignore
  }
}

function safeKillChild(proc) {
  if (!proc?.pid || proc.pid === process.pid) return;

  try {
    proc.kill();
  } catch {
    // ignore
  }

  if (process.platform === 'win32') {
    // Chỉ kill đúng PID con — KHÔNG dùng /T để tránh làm chết chat-service/gateway
    spawn('taskkill', ['/PID', String(proc.pid), '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    }).unref();
  }
}

async function killAllCrawlerProcesses() {
  const procs = [...activeCrawlerProcesses];
  if (currentCrawlerProcess && !procs.includes(currentCrawlerProcess)) {
    procs.push(currentCrawlerProcess);
  }

  for (const proc of procs) {
    safeKillChild(proc);
  }

  activeCrawlerProcesses.clear();
  currentCrawlerProcess = null;
}

function runPython(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    if (crawlerStopRequested) {
      reject(new Error('Tiến trình bị dừng bởi người dùng.'));
      return;
    }

    const isNodeEmbed = cmd === 'node' || path.basename(String(cmd)).toLowerCase().startsWith('node');
    const command = isNodeEmbed ? process.execPath : cmd;

    const proc = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    activeCrawlerProcesses.add(proc);
    currentCrawlerProcess = proc;

    proc.stdout.on('data', (data) => {
      const txt = data.toString().trim();
      if (txt) crawlerState.logs.push(...txt.split('\n'));
      if (crawlerState.logs.length > 500) crawlerState.logs = crawlerState.logs.slice(-500);
    });
    proc.stderr.on('data', (data) => {
      const txt = data.toString().trim();
      if (txt) crawlerState.logs.push(...txt.split('\n').map((l) => `[ERR] ${l}`));
      if (crawlerState.logs.length > 500) crawlerState.logs = crawlerState.logs.slice(-500);
    });
    proc.on('close', (code) => {
      activeCrawlerProcesses.delete(proc);
      if (currentCrawlerProcess === proc) currentCrawlerProcess = null;

      if (crawlerStopRequested || code === null) {
        reject(new Error('Tiến trình bị dừng bởi người dùng.'));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Thoát với mã lỗi ${code}`));
        return;
      }
      resolve();
    });
    proc.on('error', (err) => {
      activeCrawlerProcesses.delete(proc);
      if (currentCrawlerProcess === proc) currentCrawlerProcess = null;
      reject(err);
    });
  });
}

function detectRealCategory(docDir) {
  let meta = {};
  const metaPath = path.join(docDir, 'metadata.json');
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch (e) {
      meta = {};
    }
  }

  const folderName = path.basename(docDir).toLowerCase();
  const title = String(meta.title || '').toLowerCase();
  const docNum = String(meta.document_number || meta.documentNumber || '').toLowerCase();

  if (folderName.includes('vbhn') || docNum.includes('vbhn') || title.includes('hợp nhất') || folderName.includes('hop nhat')) {
    return 'Văn bản hợp nhất';
  }
  if (title.includes('hiến pháp') || folderName.includes('hien phap')) return 'Hiến pháp';
  if (title.includes('bộ luật') || folderName.includes('bo luat')) return 'Bộ luật';
  if (title.includes('nghị định') || folderName.includes('nghi dinh') || docNum.includes('nđ-cp') || folderName.includes('nd-cp')) {
    return 'Nghị định';
  }
  if (title.includes('thông tư liên tịch') || folderName.includes('thong tu lien tich')) return 'Thông tư liên tịch';
  if (title.includes('thông tư') || folderName.includes('thong tu') || docNum.includes('tt-')) return 'Thông tư';
  if (title.includes('nghị quyết liên tịch') || folderName.includes('nghi quyet lien tich')) return 'Nghị quyết liên tịch';
  if (title.includes('nghị quyết') || folderName.includes('nghi quyet') || docNum.includes('nq-')) return 'Nghị quyết';
  if (title.includes('lệnh') || folderName.includes('lenh') || docNum.includes('l-')) return 'Lệnh';
  if (title.includes('pháp lệnh') || folderName.includes('phap lenh') || docNum.includes('pl-')) return 'Pháp lệnh';
  if (title.includes('quyết định') || folderName.includes('quyet dinh') || docNum.includes('qd-') || docNum.includes('qđ-')) {
    return 'Quyết định';
  }
  if (title.includes('luật') || folderName.includes('luat') || docNum.includes('luật')) return 'Luật';

  return 'Văn bản khác';
}

function moveDocDirsOutOfVanBanMoi(vanBanMoiDir) {
  if (!fs.existsSync(vanBanMoiDir)) return { moved: 0, failed: 0 };

  let moved = 0;
  let failed = 0;
  for (const entry of fs.readdirSync(vanBanMoiDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const docDir = path.join(vanBanMoiDir, entry.name);
    const category = detectRealCategory(docDir);
    const destParent = path.join(path.dirname(vanBanMoiDir), category);
    const destDir = path.join(destParent, entry.name);

    try {
      fs.mkdirSync(destParent, { recursive: true });
      if (fs.existsSync(destDir)) {
        fs.rmSync(destDir, { recursive: true, force: true });
      }
      fs.renameSync(docDir, destDir);
      crawlerState.logs.push(`📦 Đã chuyển ${path.basename(path.dirname(vanBanMoiDir))}/van_ban_moi/${entry.name} -> ${category}/`);
      moved += 1;
    } catch (e) {
      failed += 1;
      crawlerState.logs.push(`⚠️ Không thể chuyển ${entry.name} khỏi van_ban_moi: ${e.message}`);
    }
  }

  return { moved, failed };
}

function collectDocumentIdsFromArticlesDir(articlesDir) {
  if (!fs.existsSync(articlesDir)) return [];

  const ids = new Set();
  for (const entry of fs.readdirSync(articlesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const docDir = path.join(articlesDir, entry.name);
    const metaPath = path.join(docDir, 'metadata.json');
    let meta = {};

    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch {
        meta = {};
      }
    }

    let docId = String(meta.document_number || entry.name || '').trim();
    const url = String(meta.url || '');
    if (url.includes('ItemID=')) {
      docId = url.split('ItemID=')[1].split('&')[0].trim();
    }

    if (docId) ids.add(docId);
  }

  return [...ids];
}

function loadImportManifestDocumentIds(dataPath) {
  const manifestPath = path.join(dataPath, '.crawler-last-import-document-ids.json');
  if (!fs.existsSync(manifestPath)) return [];

  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return (Array.isArray(parsed) ? parsed : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function loadHomepageDocumentIds(dataPath) {
  const manifestPath = path.join(dataPath, '.crawler-homepage-document-ids.json');
  if (!fs.existsSync(manifestPath)) return [];

  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return (Array.isArray(parsed) ? parsed : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeDocNumberForMatch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function docFolderMatchesAllowlist(docDir, allowedIds) {
  if (!allowedIds.length) return true;

  const entryName = path.basename(docDir);
  const metaPath = path.join(docDir, 'metadata.json');
  let meta = {};
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {
      meta = {};
    }
  }

  const candidates = [
    meta.document_number,
    entryName,
  ].map(normalizeDocNumberForMatch).filter(Boolean);

  return allowedIds.some((allowed) => {
    const needle = normalizeDocNumberForMatch(allowed);
    if (!needle) return false;
    return candidates.some((candidate) => candidate.includes(needle) || needle.includes(candidate));
  });
}

/** Chỉ giữ văn bản thuộc manifest trang chủ trong các thư mục van_ban_moi tạm. */
function pruneVanBanMoiStaging(dataPath, allowedIds) {
  const roots = [
    path.join(dataPath, 'newvbpl_data', 'van_ban_moi'),
    path.join(dataPath, 'vbplmd', 'van_ban_moi'),
    path.join(dataPath, 'vbplmid', 'van_ban_moi'),
    path.join(dataPath, 'vbpl_articles', 'van_ban_moi'),
  ];

  let removed = 0;
  let kept = 0;

  for (const vanBanMoiDir of roots) {
    if (!fs.existsSync(vanBanMoiDir)) continue;

    for (const entry of fs.readdirSync(vanBanMoiDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;

      const docDir = path.join(vanBanMoiDir, entry.name);
      if (docFolderMatchesAllowlist(docDir, allowedIds)) {
        kept += 1;
        continue;
      }

      try {
        fs.rmSync(docDir, { recursive: true, force: true });
        removed += 1;
      } catch (e) {
        crawlerState.logs.push(`⚠️ Không xóa được ${path.relative(dataPath, docDir)}: ${e.message}`);
      }
    }
  }

  return { removed, kept };
}

function getTargetDocumentIdsForEmbed(dataPath) {
  const homepageIds = loadHomepageDocumentIds(dataPath);
  if (homepageIds.length > 0) {
    return [...new Set(homepageIds)];
  }

  const fromManifest = loadImportManifestDocumentIds(dataPath);
  return [...new Set(fromManifest)];
}

router.post('/admin/crawler/start', requireAdmin, async (req, res) => {
  if (crawlerState.isRunning) {
    return res.status(400).json({ message: 'Hệ thống đang cập nhật rồi!' });
  }
  
  crawlerStopRequested = false;
  crawlerState.isRunning = true;
  crawlerState.logs = ['[Hệ thống] Bắt đầu quá trình cập nhật VBPL tự động...'];
  res.json({ message: 'Đã bắt đầu tiến trình cập nhật.' });

  const dataPath = path.resolve(__dirname, '../../../legal-crawler');
  clearCrawlerStopFlag(dataPath);
  for (const manifestName of [
    '.crawler-homepage-document-ids.json',
    '.crawler-last-import-document-ids.json',
  ]) {
    try {
      const manifestPath = path.join(dataPath, manifestName);
      if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
    } catch {
      // ignore
    }
  }
  const codePath = path.resolve(__dirname, '../crawler');
  const pythonPath = path.join(codePath, 'venv', 'Scripts', 'python.exe');

  try {
    crawlerState.currentTask = 'CRAWL_NEW_DOCS';
    crawlerState.logs.push('======================================');
    crawlerState.logs.push('[1/5] Đang kiểm tra và tải văn bản mới nhất từ trang chủ...');
    assertCrawlerNotStopped();
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

    const homepageIds = loadHomepageDocumentIds(dataPath);
    if (homepageIds.length > 0) {
      const pruneResult = pruneVanBanMoiStaging(dataPath, homepageIds);
      crawlerState.logs.push(
        `🧹 Dọn van_ban_moi tạm: giữ ${pruneResult.kept}, xóa ${pruneResult.removed}.`
      );
    }

    crawlerState.currentTask = 'CONVERT_MD';
    crawlerState.logs.push('======================================');
    crawlerState.logs.push('[2/5] Chuyển đổi định dạng Word/PDF sang Markdown...');
    assertCrawlerNotStopped();
    await runPython(pythonPath, ['-u', path.join(codePath, 'convert_to_md.py'), '--update'], dataPath);

    crawlerState.currentTask = 'SPLIT_AND_SYNC';
    crawlerState.logs.push('======================================');
    crawlerState.logs.push('[3/5] Phân tách Điều luật...');
    assertCrawlerNotStopped();
    await runPython(pythonPath, ['-u', path.join(codePath, 'split_by_articles.py'), '--update'], dataPath);

    crawlerState.currentTask = 'IMPORT_DB';
    crawlerState.logs.push('======================================');
    crawlerState.logs.push('[4/5] Đồng bộ Văn bản và Điều luật vào Database...');
    assertCrawlerNotStopped();
    await runPython(pythonPath, ['-u', path.join(codePath, 'import_vbplmd.py'), '--update'], dataPath);
    assertCrawlerNotStopped();
    await runPython(pythonPath, ['-u', path.join(codePath, 'import_articles_pg.py'), '--update'], dataPath);

    crawlerState.currentTask = 'EMBEDDING';
    crawlerState.logs.push('======================================');
    crawlerState.logs.push('[5/5] Đang tạo Vector Embedding cho các Điều luật mới...');
    assertCrawlerNotStopped();
    const docServicePath = path.resolve(__dirname, '../../document-service');
    const manifestIds = loadImportManifestDocumentIds(dataPath);
    const targetDocumentIds = getTargetDocumentIdsForEmbed(dataPath);

    if (targetDocumentIds.length === 0) {
      throw new Error(
        'Không có documentId để nhúng. Kiểm tra .crawler-homepage-document-ids.json hoặc bước [4/5].'
      );
    }

    const targetIdsFile = path.join(docServicePath, '.crawler-target-document-ids.json');
    fs.writeFileSync(targetIdsFile, JSON.stringify(targetDocumentIds, null, 2), 'utf8');
    const scopeLabel = homepageIds.length > 0
      ? `trang chủ: ${homepageIds.length}`
      : `manifest import: ${manifestIds.length}`;
    crawlerState.logs.push(
      `🎯 TARGETED: ${targetDocumentIds.length} văn bản (${scopeLabel})`
    );
    crawlerState.logs.push(`[Embed] node embed_all.js --document-ids-file ${targetIdsFile}`);
    await runPython(
      process.execPath,
      ['embed_all.js', '--document-ids-file', targetIdsFile],
      docServicePath
    );
    try {
      fs.unlinkSync(targetIdsFile);
    } catch {
      // ignore
    }

    // PHÂN LOẠI FILE SAU KHI CẬP NHẬT HOÀN TẤT
    crawlerState.logs.push('======================================');
    crawlerState.logs.push('[Hệ thống] Đang chuyển văn bản mới sang thư mục loại tương ứng...');
    const foldersToOrganize = [
      path.join(dataPath, 'newvbpl_data', 'van_ban_moi'),
      path.join(dataPath, 'vbplmd', 'van_ban_moi'),
      path.join(dataPath, 'vbplmid', 'van_ban_moi'),
      path.join(dataPath, 'vbpl_articles', 'van_ban_moi')
    ];

    for (const folder of foldersToOrganize) {
      const result = moveDocDirsOutOfVanBanMoi(folder);
      if (result.moved > 0 || result.failed > 0) {
        crawlerState.logs.push(`📁 ${path.basename(dataPath)}/${path.relative(dataPath, folder).replace(/\\/g, '/')}: chuyển ${result.moved}, lỗi ${result.failed}`);
      }
    }

    crawlerState.logs.push('======================================');
    crawlerState.logs.push('✅ QUÁ TRÌNH CẬP NHẬT HOÀN TẤT THÀNH CÔNG!');
  } catch (err) {
    if (crawlerStopRequested || err.message.includes('dừng bởi người dùng')) {
      crawlerState.logs.push('🛑 Đã dừng cập nhật theo yêu cầu Admin.');
    } else {
      crawlerState.logs.push(`❌ Cập nhật thất bại tại bước ${crawlerState.currentTask}: ${err.message}`);
    }
  } finally {
    crawlerStopRequested = false;
    crawlerState.isRunning = false;
    crawlerState.currentTask = '';
    currentCrawlerProcess = null;
    activeCrawlerProcesses.clear();
  }
});

router.get('/admin/crawler/status', requireAdmin, (req, res) => {
  res.json(crawlerState);
});

router.post('/admin/crawler/stop', requireAdmin, (req, res) => {
  if (!crawlerState.isRunning) {
    return res.status(400).json({ message: 'Không có tiến trình nào đang chạy.' });
  }

  crawlerStopRequested = true;
  crawlerState.isRunning = false;
  crawlerState.currentTask = '';

  const dataPath = path.resolve(__dirname, '../../../legal-crawler');
  writeCrawlerStopFlag(dataPath);

  const alreadyLogged = crawlerState.logs.some((l) => l.includes('Nhận lệnh dừng từ Admin'));
  if (!alreadyLogged) {
    crawlerState.logs.push('⚠️ [Hệ thống] Nhận lệnh dừng từ Admin. Đang tắt tiến trình...');
  }

  res.json({ message: 'Đã gửi lệnh dừng tới hệ thống.', isRunning: false });

  setImmediate(() => {
    killAllCrawlerProcesses()
      .then(() => {
        crawlerState.logs.push('🛑 Đã gửi tín hiệu tắt tiến trình crawler.');
      })
      .catch((err) => {
        crawlerState.logs.push(`⚠️ Lỗi khi tắt tiến trình crawler: ${err.message}`);
      });
  });
});

module.exports = router;
