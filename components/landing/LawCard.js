'use client';

import React from 'react';
import styles from './LawGrid.module.css';

export default function LawCard({ law, onClick }) {
  const isNew = law.tags?.includes('new');
  
  // Trạng thái hiển thị theo màu (vàng cho chưa có hiệu lực)
  let status = law.status || law.Status || law.trang_thai;
  
  if (!status || status === '—') {
    // Thử đoán trạng thái dựa trên ngày hiệu lực
    if (law.effectiveDate && law.effectiveDate !== '—') {
       try {
         const [d, m, y] = law.effectiveDate.split('/');
         const effDate = new Date(y, m - 1, d);
         const now = new Date();
         if (effDate > now) status = 'Chưa có hiệu lực';
         else status = 'Còn hiệu lực';
       } catch {
         status = 'Đang cập nhật';
       }
    } else {
      status = 'Đang cập nhật';
    }
  }

  const statusLower = status.toLowerCase();
  let statusClass = styles.statusNormal;
  if (statusLower.includes('chưa có hiệu lực')) statusClass = styles.statusActive;
  else if (statusLower.includes('hết hiệu lực')) statusClass = styles.statusExpired;
  else if (statusLower.includes('còn hiệu lực')) statusClass = styles.statusValid;

  return (
    <div className={styles.lawCard} onClick={onClick}>
      <div className={styles.cardLeft}>
        <div className={styles.cardMeta}>
          {isNew && <span className={styles.tagNew}>MỚI</span>}
        </div>
        <h3 className={styles.cardTitle}>
          {law.documentNumber && <span className={styles.docNum}>{law.documentNumber}</span>}
          {law.title}
        </h3>
      </div>
      
      <div className={styles.cardRight}>
        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>Trạng thái:</span>
          <span className={statusClass}>
            {status}
          </span>
        </div>
        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>Ngày ban hành:</span>
          <span className={styles.metaValue}>{law.issuedDate || law.date || '—'}</span>
        </div>
        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>Ngày hiệu lực:</span>
          <span className={styles.metaValue}>{law.effectiveDate || '—'}</span>
        </div>
      </div>
    </div>
  );
}

function getBg(cat) {
  const bgs = {
    thue: '#e6f7ef',
    'doanh-nghiep': '#eff6ff',
    'lao-dong': '#fff7ed',
    'dat-dai': '#f5f3ff',
    'hinh-su': '#fff1f2'
  };
  return bgs[cat] || '#f3f4f6';
}
