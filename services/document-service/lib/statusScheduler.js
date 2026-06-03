/**
 * statusScheduler.js
 * 
 * Tự động kiểm tra các văn bản có status "Chưa có hiệu lực",
 * so sánh effectiveDate với ngày hôm nay, và chuyển sang "Còn hiệu lực"
 * nếu ngày hiệu lực đã qua.
 * 
 * Chạy lần đầu khi service khởi động, sau đó lặp lại mỗi ngày lúc 00:05.
 */

const pool = require('../config/database');

const TABLE = process.env.LEGAL_DOCUMENTS_TABLE || 'LegalDocuments';

// Các giá trị status "chưa có hiệu lực" có thể có trong DB
const PENDING_STATUSES = [
  'Chưa có hiệu lực',
  'Chưa có hiệu lực.',
  'chưa có hiệu lực',
  'Chưa hiệu lực',
  'chưa hiệu lực',
];

// Giá trị status sẽ được cập nhật thành
const EFFECTIVE_STATUS = 'Còn hiệu lực';

/**
 * Cố gắng parse ngày từ nhiều định dạng khác nhau.
 * Hỗ trợ: YYYY-MM-DD, DD/MM/YYYY, JS Date toString()
 * Trả về Date object (set về 00:00:00) hoặc null nếu không parse được.
 */
function parseDate(str) {
  if (!str || typeof str !== 'string') return null;
  const s = str.trim();
  if (!s || s === '—' || s === '-' || s === '') return null;

  // Định dạng YYYY-MM-DD (chuẩn ISO, thường từ PostgreSQL DATE type)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.substring(0, 10));
    if (!isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      return d;
    }
  }

  // Định dạng DD/MM/YYYY
  const ddmmyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const d = new Date(
      parseInt(ddmmyyyy[3], 10),
      parseInt(ddmmyyyy[2], 10) - 1,
      parseInt(ddmmyyyy[1], 10)
    );
    if (!isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      return d;
    }
  }

  // Định dạng JS Date.toString(): "Wed Jul 01 2026 00:00:00 GMT+0700 (Indochina Time)"
  // Strip phần tên timezone trong ngoặc đơn trước khi parse
  const stripped = s.replace(/\s*\([^)]+\)\s*$/, '').trim();
  const fallback = new Date(stripped);
  if (!isNaN(fallback.getTime())) {
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  }

  return null;
}

/**
 * Hàm chính: quét và cập nhật status văn bản đã đến ngày hiệu lực.
 * Toàn bộ việc so sánh ngày được thực hiện trong PostgreSQL — tránh vấn đề
 * timezone/locale của Node.js khi parse các chuỗi ngày phức tạp.
 */
async function runStatusUpdate() {
  try {
    const pendingLower = PENDING_STATUSES.map(s => s.toLowerCase());

    // Đếm trước xem có bao nhiêu văn bản cần kiểm tra
    const countRes = await pool.query(
      `SELECT COUNT(*) as cnt FROM "${TABLE}"
       WHERE LOWER(TRIM(status)) = ANY($1::text[])
         AND "effectiveDate" IS NOT NULL
         AND TRIM("effectiveDate"::text) NOT IN ('', '—', '-')`,
      [pendingLower]
    );
    const total = parseInt(countRes.rows[0]?.cnt, 10) || 0;

    if (total === 0) {
      return { checked: 0, updated: 0, skipped: 0 };
    }

    // Cập nhật bằng 1 câu SQL duy nhất — PostgreSQL tự parse và so sánh ngày.
    // effectiveDate được lưu dạng chuỗi JS Date ("Wed Jul 01 2026 00:00:00 GMT+0700 (Indochina Time)")
    // → dùng CASE WHEN với nhiều TO_TIMESTAMP format để convert.
    const updateRes = await pool.query(
      `UPDATE "${TABLE}"
       SET status = $1
       WHERE LOWER(TRIM(status)) = ANY($2::text[])
         AND "effectiveDate" IS NOT NULL
         AND TRIM("effectiveDate"::text) NOT IN ('', '—', '-')
         AND (
           -- Định dạng JS Date.toString: "Wed Jul 01 2026 00:00:00 GMT+0700 (Indochina Time)"
           -- Lấy phần "Mon DD YYYY" = ký tự 4-15
           CASE
             WHEN "effectiveDate"::text ~ '^[A-Za-z]{3} [A-Za-z]{3} \\d{2} \\d{4}'
               THEN TO_DATE(
                 regexp_replace("effectiveDate"::text, '^[A-Za-z]{3} ([A-Za-z]{3} \\d{2} \\d{4}).*', '\\1'),
                 'Mon DD YYYY'
               )
             -- Định dạng YYYY-MM-DD
             WHEN "effectiveDate"::text ~ '^\\d{4}-\\d{2}-\\d{2}'
               THEN TO_DATE(SUBSTRING("effectiveDate"::text, 1, 10), 'YYYY-MM-DD')
             -- Định dạng DD/MM/YYYY
             WHEN "effectiveDate"::text ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$'
               THEN TO_DATE("effectiveDate"::text, 'DD/MM/YYYY')
             ELSE NULL
           END
         ) <= CURRENT_DATE
       RETURNING "documentId", "documentNumber", title, "effectiveDate"`,
      [EFFECTIVE_STATUS, pendingLower]
    );

    const updatedDocs = updateRes.rows;
    const updated = updatedDocs.length;
    const skipped = total - updated;

    return { checked: total, updated, skipped };
  } catch (err) {
    console.error('[StatusScheduler] Lỗi khi cập nhật status:', err.message);
    return { checked: 0, updated: 0, skipped: 0, error: err.message };
  }
}

/**
 * Tính milliseconds còn lại đến 00:05 ngày hôm sau.
 */
function msUntilNextMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 5, 0, 0); // 00:05 để tránh tranh chấp với cron khác
  return next.getTime() - now.getTime();
}

/**
 * Khởi động scheduler:
 * 1. Chạy ngay lập tức khi service start.
 * 2. Lặp lại mỗi ngày lúc 00:05.
 */
function startStatusScheduler() {
  // Chạy ngay lần đầu (delay 5 giây để service init xong)
  setTimeout(async () => {
    await runStatusUpdate();

    // Sau lần đầu, lên lịch chạy mỗi ngày lúc 00:05
    const scheduleNext = async () => {
      const delay = msUntilNextMidnight();

      setTimeout(async () => {
        await runStatusUpdate();
        scheduleNext(); // Lên lịch lần tiếp theo
      }, delay);
    };

    scheduleNext();
  }, 5000);
}

module.exports = { startStatusScheduler, runStatusUpdate };
