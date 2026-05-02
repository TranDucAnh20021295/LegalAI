'use client';

import React from 'react';
import { PIT_BRACKETS, calculatePIT, formatMil, formatMilFull } from '@/lib/legal-math';
import styles from './PitCalculatorModal.module.css';

export default function PitCalculatorModal({
  calcOpen,
  setCalcOpen,
  inputMode,
  setInputMode,
  gross,
  setGross,
  deps,
  setDeps,
  insurance,
  setInsurance,
  otherDeduct,
  setOtherDeduct,
  calculate,
  calcResult,
  liveCalc
}) {
  if (!calcOpen) return null;

  return (
    <div className={styles.calcOverlay} onClick={e => e.target === e.currentTarget && setCalcOpen(false)}>
      <div className={styles.calcModal}>
        <div className={styles.calcHeader}>
          <div className={styles.calcHeaderLeft}>
            <div className={styles.calcHeaderIcon}>📊</div>
            <div>
              <h2 className={styles.calcTitle}>Tính Thuế Thu nhập Cá nhân</h2>
              <div className={styles.calcSubtitle}>Luật số 109/2025/QH15 — Hiệu lực từ 01/01/2026 (5 bậc mới)</div>
            </div>
          </div>
          <button className={styles.calcCloseBtn} onClick={() => setCalcOpen(false)}>✕</button>
        </div>
        <div className={styles.lawBadge}>⚖️ Luật TNCN 109/2025/QH15 &nbsp;|&nbsp; Giảm trừ 15,5 tr/tháng &nbsp;|&nbsp; Người phụ thuộc 6,2 tr/người</div>
        <div className={styles.calcBody}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Nhập theo</label>
            <div className={styles.radioGroup}>
              <button type="button" className={`${styles.radioBtn} ${inputMode === 'month' ? styles.radioBtnActive : ''}`} onClick={() => { setInputMode('month'); liveCalc(); }}>💼 Thu nhập tháng</button>
              <button type="button" className={`${styles.radioBtn} ${inputMode === 'year' ? styles.radioBtnActive : ''}`} onClick={() => { setInputMode('year'); liveCalc(); }}>📅 Thu nhập năm</button>
            </div>
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Tổng thu nhập <span className={styles.hint}>(chưa trừ BHXH)</span></label>
              <div className={styles.inputAddon}>
                <input type="number" className={styles.calcInput} placeholder="VD: 25" min="0" value={gross} onChange={e => { setGross(e.target.value); liveCalc(); }} />
                <span className={styles.inputUnit}>{inputMode === 'month' ? 'triệu/tháng' : 'triệu/năm'}</span>
              </div>
            </div>
            <div className={styles.formGroup}>
              <label>Số người phụ thuộc <span className={styles.hint}>(6,2 tr/người/tháng)</span></label>
              <div className={styles.inputAddon}>
                <input type="number" className={styles.calcInput} placeholder="0" min="0" max="20" value={deps} onChange={e => { setDeps(e.target.value); liveCalc(); }} />
                <span className={styles.inputUnit}>người</span>
              </div>
            </div>
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>BHXH đóng <span className={styles.hint}>(thường 10.5%)</span></label>
              <div className={styles.inputAddon}>
                <input type="number" className={styles.calcInput} placeholder="Tự động" min="0" value={insurance} onChange={e => { setInsurance(e.target.value); liveCalc(); }} />
                <span className={styles.inputUnit}>{inputMode === 'month' ? 'triệu/tháng' : 'triệu/năm'}</span>
              </div>
            </div>
            <div className={styles.formGroup}>
              <label>Giảm trừ khác <span className={styles.hint}>(từ thiện, học phí…)</span></label>
              <div className={styles.inputAddon}>
                <input type="number" className={styles.calcInput} placeholder="0" min="0" value={otherDeduct} onChange={e => { setOtherDeduct(e.target.value); liveCalc(); }} />
                <span className={styles.inputUnit}>triệu/tháng</span>
              </div>
            </div>
          </div>
          <button className={styles.calcBtn} onClick={calculate}>⚡ Tính ngay</button>

          {calcResult && (
            <div className={styles.resultSection}>
              <div className={styles.resultSummary}>
                <div className={styles.resCardPrimary}><div className={styles.resCardLabel}>Thuế phải nộp / tháng</div><div className={styles.resCardValue} style={{ color: '#007a3d' }}>{formatMil(calcResult.taxMonth)}</div></div>
                <div className={styles.resCardSuccess}><div className={styles.resCardLabel}>Thực nhận / tháng</div><div className={styles.resCardValue} style={{ color: '#00a651' }}>{formatMil(calcResult.netMonth)}</div></div>
                <div className={styles.resCardInfo}><div className={styles.resCardLabel}>Thuế cả năm</div><div className={styles.resCardValue} style={{ color: '#2563eb' }}>{formatMil(calcResult.taxYear)}</div></div>
              </div>
              <div className={styles.deductionBreakdown}>
                {[
                  ['(-) Giảm trừ bản thân', formatMil(calcResult.selfDeduct), 'minus'],
                  ['(-) Giảm trừ người phụ thuộc', formatMil(calcResult.depD), 'minus'],
                  ['(-) BHXH/BHYT/BHTN', formatMil(calcResult.ins), 'minus'],
                  ['(-) Giảm trừ khác', formatMil(calcResult.oth), 'minus'],
                ].map(([label, val, cls]) => (
                  <div key={label} className={styles.deductionRow}>
                    <span className={styles.deductionLabel}>{label}</span>
                    <span className={styles.deducMinus}>{val}</span>
                  </div>
                ))}
                <div className={styles.deductionRow}>
                  <span style={{ fontWeight: 700 }}>= Thu nhập tính thuế / tháng</span>
                  <span className={styles.deducResult}>{formatMil(calcResult.taxable)}</span>
                </div>
              </div>
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>📊 Biểu thuế lũy tiến 5 bậc (Luật 109/2025/QH15)</div>
                <table className={styles.bracketTable}>
                  <thead><tr><th>Bậc</th><th>Thu nhập tính thuế (tr/tháng)</th><th>Thuế suất</th><th>Thuế bậc này</th></tr></thead>
                  <tbody>
                    {PIT_BRACKETS.map((b, i) => (
                      <tr key={i} className={calcResult.brackets[i] > 0 ? styles.activeRow : ''}>
                        <td className={calcResult.brackets[i] > 0 ? styles.activeRowFirst : ''}>{i + 1}</td>
                        <td>{b.range}</td>
                        <td><strong>{(b.rate * 100).toFixed(0)}%</strong></td>
                        <td className={styles.taxAmount}>{calcResult.brackets[i] > 0 ? formatMil(calcResult.brackets[i]) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {calcResult.effectiveRate > 0 && (
                  <div style={{ marginTop: 10, fontSize: 13, color: '#6b7280', textAlign: 'right' }}>
                    Thuế suất hiệu quả: <strong style={{ color: '#00a651' }}>{calcResult.effectiveRate.toFixed(1)}%</strong>
                  </div>
                )}
              </div>
              <div className={styles.noteBox}>
                ℹ️ <strong>Lưu ý:</strong> Kết quả tham khảo theo <strong>Luật TNCN 109/2025/QH15</strong>, hiệu lực <strong>01/01/2026</strong>.<br/>
                Biểu thuế 5 bậc mới: 5% → 10% → 15% → 20% → 25% (bậc tối đa giảm từ 35% xuống 25%).<br/>
                Giảm trừ bản thân: <strong>15,5 tr/tháng</strong> | Người phụ thuộc: <strong>6,2 tr/người/tháng</strong>.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
