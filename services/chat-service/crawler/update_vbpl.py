#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
update_vbpl.py — Cập nhật văn bản pháp luật mới từ vbpl.vn

Cấu trúc bảng DB:
  • LegalDocuments      — Toàn văn mỗi văn bản (1 row = 1 văn bản)
  • vbpl_articles_data  — Từng Điều luật tách riêng (1 row = 1 Điều)
  • DocumentChunks      — Chunks nhỏ dùng cho vector embedding/RAG

Luồng:
  1. Scrape trang "Văn bản mới" trên vbpl.vn để lấy danh sách (số hiệu, ItemID, url, title...)
  2. Check LegalDocuments: bỏ qua những văn bản đã có trong DB
  3. Với các văn bản CHƯA có: tải file về thư mục newvbpl_data/van_ban_moi/<tên>
  4. Chuyển file sang Markdown (convert_to_md.py → vbplmd/)
  5. Tách Điều (split_by_articles.py → vbpl_articles/)
  6. Import toàn văn vào LegalDocuments (import_vbplmd.py)
  7. Import từng Điều vào vbpl_articles_data (import_articles_pg.py)
  8. Phân loại category bằng AI (classify_documents.py)
  9. Tạo embeddings cho DocumentChunks mới (embed_all.js)

Chạy: venv\Scripts\python.exe update_vbpl.py [--max N] [--dry-run]
"""

import os
import re
import sys
import json
import time
import shutil
import argparse
import subprocess
import urllib.parse
from pathlib import Path
from datetime import datetime

import requests
from bs4 import BeautifulSoup
import psycopg2

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# ─────────────────────── CẤU HÌNH ───────────────────────────
DB_CONFIG = {
    'host':     'localhost',
    'port':     5433,
    'user':     'postgres',
    'password': '123456',
    'dbname':   'legal_ai',
}

BASE_URL     = 'https://vbpl.vn'
LIST_URL     = 'https://vbpl.vn/TW/Pages/vbpq-van-ban-moi.aspx'   # Trang "Văn bản mới"
OUTPUT_DIR   = Path('newvbpl_data') / 'van_ban_moi'
VBPLMD_DIR   = Path('vbplmd') / 'van_ban_moi'
ARTICLES_DIR = Path('vbpl_articles') / 'van_ban_moi'

EMBED_SCRIPT = Path('..') / 'services' / 'document-service' / 'embed_all.js'

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
    'Referer': 'https://vbpl.vn/',
}

# ─────────────────────── TIỆN ÍCH ────────────────────────────
def sanitize(name: str, max_len=80) -> str:
    name = re.sub(r'[\x00-\x1f\\/:*?"<>|]', '_', str(name))
    name = name.strip().replace('\n', '_').replace('\r', '_')
    return name[:max_len] if len(name) > max_len else name


def sleep_jitter(base=1.5):
    import random
    time.sleep(base * random.uniform(0.7, 1.5))


# ─────────────────────── STEP 1: SCRAPE DANH SÁCH ────────────
def scrape_new_list(max_docs=50) -> list[dict]:
    """Lấy danh sách văn bản mới từ vbpl.vn (tối đa max_docs)."""
    print(f'\n[1] Đang lấy danh sách văn bản mới từ {LIST_URL} ...')
    docs = []
    page = 1
    session = requests.Session()
    session.headers.update(HEADERS)

    while len(docs) < max_docs:
        try:
            url = LIST_URL if page == 1 else f'{LIST_URL}?Page={page}'
            resp = session.get(url, timeout=30, verify=False)
            resp.raise_for_status()
            resp.encoding = 'utf-8'
            soup = BeautifulSoup(resp.text, 'lxml')
        except Exception as e:
            print(f'  [!] Lỗi khi load trang {page}: {e}')
            break

        # Cấu trúc mới (Ant Design/React) — tìm card văn bản
        items = soup.select('div[class*="DocumentInfoCard_card"]')
        if not items:
            # Cấu trúc cũ — tìm trong bảng hoặc ul.danh-sach
            items = soup.select('div.item, tr.item, ul.list-item li')

        if not items:
            print(f'  Không tìm thấy văn bản ở trang {page}, dừng.')
            break

        found_on_page = 0
        for item in items:
            if len(docs) >= max_docs:
                break

            # --- Tiêu đề & URL ---
            title_tag = (
                item.select_one('a[class*="titleValue"], a[class*="title"]') or
                item.select_one('p.title a') or
                item.select_one('a[href*="ItemID="]') or
                item.select_one('a')
            )
            if not title_tag:
                continue

            title = title_tag.get_text(strip=True)
            href  = title_tag.get('href', '')
            if not href:
                continue
            full_url = href if href.startswith('http') else urllib.parse.urljoin(BASE_URL, href)

            # --- ItemID (dùng làm documentId) ---
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(full_url).query)
            item_id = qs.get('ItemID', [None])[0]
            if not item_id:
                # Thử lấy từ URL dạng /vbpq-toanvan.aspx?ItemID=12345
                m = re.search(r'ItemID=(\d+)', full_url)
                item_id = m.group(1) if m else None

            # --- Số hiệu ---
            doc_num = ''
            for span in item.select('span[class*="metadataValue"], span[class*="doc-number"]'):
                parent_text = (span.parent or span).get_text(strip=True).lower()
                if 'số hiệu' in parent_text or 'số ký hiệu' in parent_text:
                    doc_num = span.get_text(strip=True)
                    break
            if not doc_num:
                # fallback: lấy từ text của link (vd "Luật 109/2025/QH15")
                m = re.search(r'(\d+/\d{4}/[A-ZĐÀ-ỹ-]+)', title, re.UNICODE)
                if m:
                    doc_num = m.group(1)

            # --- Ngày ban hành ---
            issued_date = ''
            for span in item.select('span[class*="metadataValue"]'):
                parent_text = (span.parent or span).get_text(strip=True).lower()
                if 'ban hành' in parent_text:
                    issued_date = span.get_text(strip=True)
                    break

            docs.append({
                'item_id':    item_id,
                'doc_num':    doc_num,
                'title':      title,
                'url':        full_url,
                'issued_date': issued_date,
            })
            found_on_page += 1

        print(f'  Trang {page}: {found_on_page} văn bản, tổng {len(docs)}')

        # Phân trang
        next_btn = soup.select_one('a.next, li.next a, a[class*="next"]')
        if not next_btn:
            break
        page += 1
        sleep_jitter(1)

    print(f'  → Tổng cộng {len(docs)} văn bản mới từ vbpl.vn')
    return docs


# ─────────────────────── STEP 2: CHECK DB ─────────────────────
def filter_not_in_db(docs: list[dict]) -> list[dict]:
    """Trả về list các văn bản CHƯA có trong DB."""
    print('\n[2] Kiểm tra DB ...')
    if not docs:
        return []
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur  = conn.cursor()

        new_docs = []
        for d in docs:
            found = False
            # Ưu tiên check theo ItemID (documentId chính xác nhất)
            if d['item_id']:
                cur.execute(
                    'SELECT 1 FROM "LegalDocuments" WHERE "documentId" = %s LIMIT 1',
                    (d['item_id'],)
                )
                found = cur.fetchone() is not None

            # Nếu không có ItemID hoặc không tìm thấy theo ID, check theo số hiệu
            if not found and d['doc_num']:
                cur.execute(
                    'SELECT 1 FROM "LegalDocuments" WHERE "documentNumber" = %s LIMIT 1',
                    (d['doc_num'],)
                )
                found = cur.fetchone() is not None

            if found:
                print(f'  [SKIP] Đã có trong DB: {d["doc_num"] or d["item_id"]} — {d["title"][:60]}')
            else:
                print(f'  [NEW ] Chưa có:         {d["doc_num"] or d["item_id"]} — {d["title"][:60]}')
                new_docs.append(d)

        cur.close()
        conn.close()
        print(f'  → {len(new_docs)}/{len(docs)} văn bản cần crawl về')
        return new_docs
    except Exception as e:
        print(f'  [!] Lỗi kết nối DB: {e}')
        print('  → Bỏ qua bước check DB, crawl tất cả')
        return docs


# ─────────────────────── STEP 3: CRAWL FILE ───────────────────
def _get_download_url(session, detail_url: str) -> str | None:
    """Lấy link tải file (docx/pdf) từ trang chi tiết."""
    try:
        resp = session.get(detail_url, timeout=30, verify=False)
        resp.encoding = 'utf-8'
        soup = BeautifulSoup(resp.text, 'lxml')

        # Tìm link trực tiếp đến file đính kèm
        for a in soup.find_all('a', href=True):
            href = a['href']
            # Ưu tiên .docx > .doc > .pdf
            if any(ext in href.lower() for ext in ['.docx', '.doc', '.pdf']):
                return href if href.startswith('http') else urllib.parse.urljoin(BASE_URL, href)

        # Tìm link qua tab "Tải về"
        tai_ve = soup.find('a', string=re.compile('Tải về', re.I))
        if tai_ve:
            tab_url = urllib.parse.urljoin(BASE_URL, tai_ve.get('href', ''))
            resp2 = session.get(tab_url, timeout=30, verify=False)
            soup2 = BeautifulSoup(resp2.text, 'lxml')
            for a in soup2.find_all('a', href=True):
                href = a['href']
                if any(ext in href.lower() for ext in ['.docx', '.doc', '.pdf']):
                    return href if href.startswith('http') else urllib.parse.urljoin(BASE_URL, href)
    except Exception as e:
        print(f'    [!] Lỗi lấy link tải: {e}')
    return None


def crawl_files(docs: list[dict], dry_run=False) -> list[dict]:
    """Tải file về cho mỗi văn bản, lưu vào OUTPUT_DIR/<folder>."""
    print(f'\n[3] Đang crawl {len(docs)} văn bản về {OUTPUT_DIR} ...')
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers.update(HEADERS)

    crawled = []
    for i, d in enumerate(docs, 1):
        folder_name = sanitize(f'{d["doc_num"] or d["item_id"] or "vb"}_{d["title"][:40]}')
        folder = OUTPUT_DIR / folder_name
        folder.mkdir(parents=True, exist_ok=True)

        # Lưu metadata.json
        meta = {
            'document_number': d['doc_num'],
            'title':           d['title'],
            'url':             d['url'],
            'issued_date':     d['issued_date'],
            'item_id':         d['item_id'],
        }
        with open(folder / 'metadata.json', 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

        if dry_run:
            print(f'  [{i}/{len(docs)}] [DRY] {folder_name}')
            crawled.append(d)
            continue

        # Lấy link tải
        dl_url = _get_download_url(session, d['url'])
        if not dl_url:
            print(f'  [{i}/{len(docs)}] [SKIP] Không tìm được link tải: {d["title"][:60]}')
            continue

        # Tải file
        ext = Path(urllib.parse.urlparse(dl_url).path).suffix.lower() or '.docx'
        file_name = sanitize(d['doc_num'] or d['title'][:60]) + ext
        file_path = folder / file_name

        try:
            with session.get(dl_url, stream=True, timeout=120, verify=False) as r:
                r.raise_for_status()
                with open(file_path, 'wb') as f:
                    for chunk in r.iter_content(65536):
                        f.write(chunk)
            size_kb = file_path.stat().st_size // 1024
            print(f'  [{i}/{len(docs)}] [OK] {file_name} ({size_kb} KB)')
            crawled.append({**d, 'file_path': str(file_path), 'folder': str(folder)})
        except Exception as e:
            print(f'  [{i}/{len(docs)}] [ERR] {d["title"][:60]}: {e}')

        sleep_jitter(1.5)

    print(f'  → Đã tải {len(crawled)} văn bản')
    return crawled


# ─────────────────────── BƯỚC 4–9: PIPELINE ──────────────────
def run_step(desc: str, cmd: list[str], cwd: Path | None = None):
    print(f'\n{"=" * 50}')
    print(f'  {desc}')
    print('=' * 50)
    result = subprocess.run(cmd, cwd=str(cwd) if cwd else None)
    if result.returncode != 0:
        print(f'  [!] Bước "{desc}" kết thúc với mã lỗi {result.returncode}')
    else:
        print(f'  [OK] Hoàn tất: {desc}')


def run_pipeline(crawler_root: Path):
    py = str(crawler_root / 'venv' / 'Scripts' / 'python.exe')
    node = 'node'

    # 4. Convert sang Markdown
    run_step(
        '[4/7] Convert file → Markdown',
        [py, 'convert_to_md.py', '--input', 'newvbpl_data'],
        cwd=crawler_root,
    )

    # 5. Tách Điều
    run_step(
        '[5/7] Tách Điều',
        [py, 'split_by_articles.py', '--update', '--target', 'van_ban_moi'],
        cwd=crawler_root,
    )

    # 6. Import toàn văn vào bảng LegalDocuments
    run_step(
        '[6/8] Import toàn văn → LegalDocuments',
        [py, 'import_vbplmd.py', '--update', '--target', 'van_ban_moi'],
        cwd=crawler_root,
    )

    # 7. Import từng Điều luật vào bảng vbpl_articles_data
    run_step(
        '[7/8] Import từng Điều → vbpl_articles_data',
        [py, 'import_articles_pg.py', '--update', '--target', 'van_ban_moi'],
        cwd=crawler_root,
    )

    # 8. Phân loại AI
    run_step(
        '[7/7] Phân loại category bằng AI',
        [py, 'classify_documents.py'],
        cwd=crawler_root,
    )

    # 9. Tạo embeddings
    embed_path = crawler_root / '..' / 'services' / 'document-service'
    run_step(
        '[8/8] Tạo embeddings (resume mode)',
        [node, 'embed_all.js'],
        cwd=embed_path.resolve(),
    )


# ─────────────────────── MAIN ─────────────────────────────────
def main():
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    parser = argparse.ArgumentParser(description='Cập nhật VBPL mới từ vbpl.vn')
    parser.add_argument('--max',     type=int, default=50, help='Số văn bản tối đa cần scrape (mặc định 50)')
    parser.add_argument('--dry-run', action='store_true',  help='Chỉ hiện danh sách, không tải file')
    parser.add_argument('--no-embed', action='store_true', help='Bỏ qua bước tạo embedding')
    args = parser.parse_args()

    crawler_root = Path(__file__).parent.resolve()

    print('╔══════════════════════════════════════════════╗')
    print('║   CẬP NHẬT VĂN BẢN PHÁP LUẬT MỚI (VBPL)   ║')
    print(f'║   {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}                           ║')
    print('╚══════════════════════════════════════════════╝')

    # 1. Scrape danh sách mới
    all_new = scrape_new_list(max_docs=args.max)
    if not all_new:
        print('\n[!] Không lấy được danh sách văn bản mới. Kết thúc.')
        return

    # 2. Lọc những cái chưa có trong DB
    to_crawl = filter_not_in_db(all_new)
    if not to_crawl:
        print('\n✓ Tất cả văn bản mới đã có trong DB. Không cần cập nhật.')
        return

    if args.dry_run:
        print(f'\n[DRY-RUN] Sẽ crawl {len(to_crawl)} văn bản:')
        for d in to_crawl:
            print(f'  • {d["doc_num"] or d["item_id"]} — {d["title"][:70]}')
        return

    # 3. Crawl file về
    crawled = crawl_files(to_crawl, dry_run=False)
    if not crawled:
        print('\n[!] Không tải được văn bản nào. Kết thúc.')
        return

    # 4–9. Pipeline convert → split → import → embed
    run_pipeline(crawler_root)

    print('\n╔══════════════════════════════════════════════╗')
    print('║            HOÀN TẤT CẬP NHẬT!               ║')
    print(f'║   Đã xử lý {len(crawled)} văn bản mới             ║')
    print('╚══════════════════════════════════════════════╝')


if __name__ == '__main__':
    main()
