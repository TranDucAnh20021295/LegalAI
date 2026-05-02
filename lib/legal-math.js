/* ============================================
   LegalAI — Legal Math Utilities
   ============================================ */

export const SELF_DEDUCT = 15.5;   // triệu/tháng
export const DEP_DEDUCT = 6.2;     // triệu/người/tháng
export const INS_RATE = 0.105;     // 10.5%
export const BASE_SALARY = 2.34;   // triệu/tháng

export const PIT_CONFIG = {
  SELF_DEDUCT,
  DEP_DEDUCT,
  INS_RATE,
  BASE_SALARY,
};

export const INS_CAP = BASE_SALARY * 20;

export const PIT_BRACKETS = [
  { width: 5,        rate: 0.05, label: '≤ 5 triệu',     range: 'Đến 5' },
  { width: 10,       rate: 0.10, label: '5–15 triệu',    range: 'Trên 5–15' },
  { width: 20,       rate: 0.15, label: '15–35 triệu',   range: 'Trên 15–35' },
  { width: 35,       rate: 0.20, label: '35–70 triệu',   range: 'Trên 35–70' },
  { width: Infinity, rate: 0.25, label: '> 70 triệu',    range: 'Trên 70' },
];

/**
 * Tính thuế TNCN theo biểu thuế lũy tiến 5 bậc (Luật 109/2025/QH15)
 */
export function calculatePIT(taxable) {
  if (taxable <= 0) return { total: 0, brackets: PIT_BRACKETS.map(() => 0) };
  let rem = taxable, total = 0;
  const brackets = PIT_BRACKETS.map(b => {
    if (rem <= 0) return 0;
    const chunk = Math.min(rem, b.width);
    const tax = chunk * b.rate;
    total += tax; rem -= chunk;
    return tax;
  });
  return { total, brackets };
}

/**
 * Format tiền tệ (triệu đồng)
 */
export function formatMil(n) {
  return n <= 0 ? '0 tr' : n.toFixed(2).replace(/\.?0+$/, '') + ' tr';
}

export function formatMilFull(n) {
  if (n <= 0) return '0 đ';
  const val = n * 1000000;
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
}
