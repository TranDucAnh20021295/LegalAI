'use client';

import React, { useState, useEffect, useRef } from 'react';
import { documentAPI } from '@/lib/api';
import styles from './LandingHero.module.css';

/** Xóa Markdown syntax để hiển thị text thuần */
function stripMd(text) {
  if (!text) return '';
  return String(text)
    .replace(/<[\s\S]*?>/g, ' ')          // HTML tags
    .replace(/#{1,6}\s+/g, '')             // ## heading
    .replace(/\*\*(.*?)\*\*/g, '$1')       // **bold**
    .replace(/\*(.*?)\*/g, '$1')           // *italic*
    .replace(/\\([.!?,;:\)\(\[\]\*\_])/g, '$1') // backslash escapes
    .replace(/\s+/g, ' ')
    .trim();
}

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function LandingHero({
  searchQuery,
  setSearchQuery,
  searchIn,
  setSearchIn,
  exactMatch,
  setExactMatch,
  filterCat,
  stats
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const wrapRef = useRef(null);
  const debouncedQuery = useDebounce(searchQuery, 500);
  const abortControllerRef = useRef(null);

  // Live keyword search (title hoặc số hiệu, không dùng semantic)
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.trim().length < 2) {
      setResults([]);
      setDropdownOpen(false);
      return;
    }

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    setSearching(true);
    setDropdownOpen(true);

    documentAPI.search(debouncedQuery.trim(), 8, searchIn, exactMatch, { signal: abortControllerRef.current.signal })
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setResults(list.slice(0, 8));
      })
      .catch((err) => {
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        setResults([]);
      })
      .finally(() => { 
        if (!abortControllerRef.current?.signal.aborted) setSearching(false); 
      });

    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [debouncedQuery, searchIn, exactMatch]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setDropdownOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (doc) => {
    if (doc.documentId) {
      window.open(`/vbpl/${doc.documentId}`, '_blank');
    }
    setDropdownOpen(false);
    setSearchQuery('');
  };

  return (
    <section className={styles.hero}>
      <div className={styles.heroBg} />
      <div className={styles.heroInner}>
        <h1 className={styles.heroTitle}>Thư viện Pháp luật AI chuyên nghiệp</h1>
        <p className={styles.heroSub}>Tra cứu hàng ngàn văn bản, tính toán thuế chính xác và giải đáp pháp luật cùng Trợ lý AI.</p>

        <div className={styles.searchRel} ref={wrapRef}>
          <div className={styles.searchBar}>
            <div className={styles.searchInputWrap}>
              {searching ? (
                <div className={styles.searchIcon} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.3)', borderTop: '2px solid white', borderRadius: '50%', animation: 'landingSpin 1s linear infinite' }} />
                </div>
              ) : (
                <svg className={styles.searchIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              )}
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Nhập từ khóa tìm kiếm văn bản pháp luật..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => { if (results.length > 0) setDropdownOpen(true); }}
                autoComplete="off"
              />
              <button className={styles.searchBtnMain}>
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                Tìm kiếm
              </button>
            </div>
          </div>

          <div className={styles.searchFilters}>
            <span className={styles.filterLabel}>Tìm kiếm trong:</span>
            <label className={styles.filterOption}>
              <input type="radio" name="searchIn" value="all" checked={searchIn === 'all'} onChange={() => setSearchIn('all')} />
              Tất cả
            </label>
            <label className={styles.filterOption}>
              <input type="radio" name="searchIn" value="title" checked={searchIn === 'title'} onChange={() => setSearchIn('title')} />
              Tiêu đề văn bản
            </label>
            <label className={styles.filterOption}>
              <input type="radio" name="searchIn" value="number" checked={searchIn === 'number'} onChange={() => setSearchIn('number')} />
              Số hiệu văn bản
            </label>
            <div className={styles.filterDivider} />
            <label className={styles.filterOption}>
              <input type="checkbox" checked={exactMatch} onChange={e => setExactMatch(e.target.checked)} />
              Chính xác cụm từ trên
            </label>
          </div>

          {dropdownOpen && (
            <div className={`${styles.searchDropdown} ${styles.searchDropdownShow}`}>
              {results.length === 0 && !searching && (
                <div style={{ padding: '14px 16px', color: '#9ca3af', fontSize: 13 }}>Không tìm thấy kết quả cho "{debouncedQuery}"</div>
              )}
              {results.map((r, i) => (
                <div key={r.documentId || i} className={styles.searchResultItem} onClick={() => handleSelect(r)}>
                  <span className={styles.resultBadge}>{r.documentType || r.field || 'VB'}</span>
                  <div>
                    <div className={styles.resultTitle}>{r.title || r.documentNumber || 'Văn bản pháp luật'}</div>
                    {r.documentNumber && (
                      <div className={styles.resultDesc}>{r.documentNumber}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>


      </div>
    </section>
  );
}
