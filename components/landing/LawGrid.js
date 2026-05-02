'use client';

import React from 'react';
import LawCard from './LawCard';
import styles from './LawGrid.module.css';

export default function LawGrid({ 
  laws, 
  loading,
  activeCat, 
  filterCat, 
  catLabels, 
  searchQuery, 
  clearSearch,
  openLaw
}) {
  return (
    <main className={styles.main}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>
          <span>📚 {searchQuery ? 'Kết quả tìm kiếm' : 'Văn bản pháp luật mới nhất'}</span>
        </h2>
      </div>

      {searchQuery && (
        <div className={styles.searchInfoBar}>
          <span className={styles.searchInfoText}>Kết quả tìm kiếm cho: "{searchQuery}"</span>
          <button className={styles.clearSearchBtn} onClick={clearSearch}>✕ Xóa lọc</button>
        </div>
      )}

      <div className={styles.catTabs}>
        {Object.entries(catLabels).map(([id, label]) => (
          <button
            key={id}
            className={`${styles.catTab} ${activeCat === id ? styles.catTabActive : ''}`}
            onClick={() => filterCat(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.lawGrid}>
        {loading ? (
          <div className={styles.noResult}>
             <p>Đang tra cứu dữ liệu...</p>
          </div>
        ) : laws.length > 0 ? (
          laws.map(law => (
            <LawCard key={law.documentId || law.id} law={law} onClick={() => openLaw(law)} />
          ))
        ) : (
          <div className={styles.noResult}>
            <span className={styles.noResultIcon}>🔍</span>
            <p>Không tìm thấy văn bản nào phù hợp.</p>
          </div>
        )}
      </div>
    </main>
  );
}
