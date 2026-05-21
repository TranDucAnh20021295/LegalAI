#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Crawler để thu thập dữ liệu từ website vbpl.vn
"""

import os
import re
import sys
import json
import time
import argparse
from pathlib import Path
from urllib.parse import urljoin, urlparse, parse_qs, urlsplit, urlunsplit, quote, unquote
from typing import Dict, List, Optional, Union

import requests
from bs4 import BeautifulSoup
from requests.exceptions import RequestException
import random
from typing import Dict, List, Optional, Union, Callable
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        import codecs
        sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')


class VBPLCrawler:
    """Crawler cho website vbpl.vn"""
    
    BASE_URL = "https://vbpl.vn/TW/Pages/vanban.aspx"
    BASE_DOWNLOAD_URL = "https://vbpl.vn"
    
    @staticmethod
    def _value_looks_like_vn_date(value: str) -> bool:
        """True nếu chuỗi chỉ là ngày dạng dd/mm/yyyy (trang vbpl hay ghi sau nhãn 'Hiệu lực:')."""
        if not value or not str(value).strip():
            return False
        return bool(re.match(r"^\d{1,2}/\d{1,2}/\d{4}$", str(value).strip()))
    
    @classmethod
    def _extract_downloadfile_paths(cls, text: str) -> List[str]:
        paths = []
        if not text: return paths
        for match in re.finditer(r"downloadfile\(\s*['\"](.*?)['\"]\s*,\s*['\"](.*?)['\"]\s*\)", text):
            paths.append(match.group(2))
        return paths

    def __init__(self, output_dir: str = 'vbpl_data', delay: float = 1.0, proxies: Optional[List[str]] = None):
        self.BASE_URL = 'https://vbpl.vn/'
        self.BASE_DOWNLOAD_URL = 'https://vbpl.vn/'
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        self.delay = delay
        self.proxies = proxies or []
        self.current_proxy_idx = 0
        
        self.session = requests.Session()
        self.user_agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
            "Mozilla/5.0 (Apple) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15"
        ]
        
        # Playwright resources
        self._playwright = None
        self._browser = None
        self._context = None
        self._set_random_headers()

    def _init_browser(self):
        """Khởi tạo trình duyệt Playwright nếu chưa có."""
        if not self._browser:
            self._playwright = sync_playwright().start()
            self._browser = self._playwright.chromium.launch(
                headless=True,
                args=['--disable-blink-features=AutomationControlled']
            )
            self._context = self._browser.new_context(
                viewport={'width': 1280, 'height': 800},
                user_agent=self.session.headers['User-Agent']
            )

    def close(self):
        """Đóng tài nguyên trình duyệt."""
        if self._context:
            self._context.close()
        if self._browser:
            self._browser.close()
        if self._playwright:
            self._playwright.stop()
        
    def sanitize_filename(self, filename: str) -> str:
        """
        Làm sạch tên file để tương thích với Windows, loại bỏ xuống dòng và ký tự điều khiển
        
        Args:
            filename: Tên file gốc
            
        Returns:
            Tên file đã được làm sạch
        """
        if not filename:
            return "vanban"
        # Thay thế các ký tự không hợp lệ (\ / : * ? " < > | và các ký tự điều khiển 0-31) thành _
        filename = re.sub(r'[\x00-\x1f\\/:*?"<>|]', '_', filename)
        # Loại bỏ các khoảng trắng và xuống dòng dư thừa
        filename = filename.replace('\n', '_').replace('\r', '_').strip()
        # Giới hạn độ dài tên để tránh lỗi đường dẫn quá dài trên Windows (MAX_PATH = 260)
        # 90 ký tự là con số an toàn để cộng dồn cả folder cha và folder con
        if len(filename) > 90:
            filename = filename[:90].strip()
        return filename
    
    def _set_random_headers(self):
        """Thay đổi User-Agent và các header ngẫu nhiên để tránh bị phát hiện."""
        import random
        ua = random.choice(self.user_agents)
        self.session.headers.update({
            'User-Agent': ua,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'Cache-Control': 'max-age=0',
            'Referer': 'https://vbpl.vn/',
        })
        
        # Nếu có danh sách proxy, xoay vòng proxy
        if self.proxies:
            proxy = self.proxies[self.current_proxy_idx]
            self.session.proxies = {"http": proxy, "https": proxy}
            self.current_proxy_idx = (self.current_proxy_idx + 1) % len(self.proxies)

    def _sleep_with_jitter(self):
        """Nghỉ ngơi với một chút ngẫu nhiên (jitter) để giả lập hành vi người dùng."""
        import random
        jitter_delay = self.delay * random.uniform(0.7, 1.5)
        time.sleep(jitter_delay)

    def get_page(self, url: str, retries: Optional[int] = None) -> Optional[BeautifulSoup]:
        """
        Lấy nội dung trang web với cơ chế thử lại. 
        Nếu retries là None thì thử lại vô hạn cho các lỗi có thể hồi phục.
        """
        attempt = 0
        from requests.exceptions import RequestException
        # Bỏ qua cảnh báo SSL không an toàn khi dùng verify=False
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        
        while True:
            attempt += 1
            if retries is not None and attempt > retries + 1:
                print(f"  Đã vượt quá số lần thử lại tối đa ({retries}), bỏ qua trang {url}")
                return None
            try:
                self._sleep_with_jitter()
                if attempt % 5 == 0:
                    self._set_random_headers()
                
                # verify=False để bỏ qua lỗi chứng chỉ SSL thường gặp ở site gov
                response = self.session.get(url, timeout=60, verify=False)
                
                if response.status_code in (401, 403, 429, 500, 502, 503, 504):
                    if retries is not None and attempt > retries:
                        print(f"  Lỗi {response.status_code} trang {url}, dừng thử lại.")
                        return None
                    wait = min(600.0, max(self.delay * 5, self.delay * (2 ** min(attempt, 8))))
                    print(f"  Lỗi {response.status_code} trang {url}, chờ {wait:.0f}s (lần {attempt})...")
                    time.sleep(wait)
                    continue
                
                if response.status_code == 404:
                    if attempt <= 3 and (retries is None or attempt <= retries):
                        time.sleep(self.delay * 2)
                        continue
                    return None
                
                response.raise_for_status()
                response.encoding = 'utf-8'
                return BeautifulSoup(response.text, 'lxml')
                
            except (RequestException, Exception) as e:
                if retries is not None and attempt > retries:
                    print(f"  Lỗi truy cập trang {url} ({type(e).__name__}), dừng thử lại.")
                    return None
                wait = min(300.0, self.delay * (2 + attempt))
                print(f"  Lỗi truy cập trang {url} ({type(e).__name__}). Chờ {wait:.0f}s (lần {attempt})...")
                time.sleep(wait)
                continue

    
    def extract_document_types(self) -> List[Dict[str, str]]:
        """
        Trích xuất danh sách các loại văn bản từ trang chính.
        Thử lại vô hạn nếu không tìm thấy kết quả.
        """
        attempt = 0
        while True:
            attempt += 1
            print(f"Đang lấy danh sách các loại văn bản (lần {attempt})...")
            # Thử lấy từ trang Văn bản Trung ương trực tiếp vì nó đầy đủ nhất
            target_url = urljoin(self.BASE_URL, '/TW/Pages/vbpq.aspx')
            soup = self.get_page(target_url)
            if not soup:
                time.sleep(30)
                continue
            
            document_types = []
            # Cấu trúc menu bên trái trong trang Văn bản Trung ương
            links = soup.select('div.listLoaiVanBan a, ul.list-group a, #left-menu a')
            if not links:
                links = soup.find_all('a', href=True)
            for link in links:
                href = link.get('href', '')
                if 'idLoaiVanBan=' in href or 'idLoaiVanBan=' in str(link):
                    if not href.startswith('http'):
                        href = urljoin(self.BASE_URL, href)
                    
                    full_url = href
                    parsed = urlparse(full_url)
                    params = parse_qs(parsed.query)
                    
                    if 'idLoaiVanBan' in params and 'dvid' in params:
                        doc_type_name = link.get_text(strip=True)
                        if not doc_type_name:
                            doc_type_name = link.get('title', '') or link.get('alt', '')
                        
                        if doc_type_name:
                            document_types.append({
                                'name': doc_type_name,
                                'url': full_url,
                                'idLoaiVanBan': params['idLoaiVanBan'][0],
                                'dvid': params['dvid'][0]
                            })
            
            if not document_types:
                selects = soup.find_all('select')
                for select in selects:
                    options = select.find_all('option')
                    for option in options:
                        value = option.get('value', '')
                        if 'idLoaiVanBan=' in value or value.isdigit():
                            doc_type_name = option.get_text(strip=True)
                            if doc_type_name and doc_type_name != '-- Chọn --':
                                if value.isdigit():
                                    full_url = f"{self.BASE_URL}?idLoaiVanBan={value}&dvid=13"
                                else:
                                    full_url = urljoin(self.BASE_URL, value)
                                
                                parsed = urlparse(full_url)
                                params = parse_qs(parsed.query)
                                if 'idLoaiVanBan' in params:
                                    document_types.append({
                                        'name': doc_type_name,
                                        'url': full_url,
                                        'idLoaiVanBan': params['idLoaiVanBan'][0],
                                        'dvid': params.get('dvid', ['13'])[0]
                                    })
            
            if document_types:
                return document_types
                
            # Lưu HTML để debug nếu không tìm thấy gì
            debug_file = "debug_homepage.html"
            with open(debug_file, "w", encoding="utf-8") as f:
                f.write(soup.prettify())
            print(f"  Không tìm thấy loại văn bản nào, đã lưu HTML vào {debug_file} để kiểm tra. Chờ 60s thử lại...")
            time.sleep(60)
            self._set_random_headers()
        
        document_types = []
        
        # Tìm các link đến các loại văn bản
        # Các link có dạng: vanban.aspx?idLoaiVanBan=16&dvid=13
        # Hoặc có thể nằm trong menu, dropdown, hoặc danh sách
        links = soup.find_all('a', href=True)
        
        for link in links:
            href = link.get('href', '')
            # Kiểm tra cả href trực tiếp và href tương đối
            if 'idLoaiVanBan=' in href or 'idLoaiVanBan=' in str(link):
                if not href.startswith('http'):
                    href = urljoin(self.BASE_URL, href)
                
                full_url = href
                parsed = urlparse(full_url)
                params = parse_qs(parsed.query)
                
                if 'idLoaiVanBan' in params and 'dvid' in params:
                    doc_type_name = link.get_text(strip=True)
                    # Nếu không có text, thử lấy từ title hoặc các thuộc tính khác
                    if not doc_type_name:
                        doc_type_name = link.get('title', '') or link.get('alt', '')
                    
                    if doc_type_name:
                        document_types.append({
                            'name': doc_type_name,
                            'url': full_url,
                            'idLoaiVanBan': params['idLoaiVanBan'][0],
                            'dvid': params['dvid'][0]
                        })
        
        # Thử tìm các link trong menu hoặc sidebar mới (Ant Design)
        if not document_types:
            nav_links = soup.select('ul[class*="ant-menu"] a, div[class*="SideBar"] a')
            for link in nav_links:
                href = link.get('href', '')
                text = link.get_text(strip=True)
                if 'idLoaiVanBan=' in href or 'tim-kiem-van-ban' in href:
                    if text and len(text) > 2:
                        full_url = urljoin(self.BASE_URL, href)
                        parsed = urlparse(full_url)
                        params = parse_qs(parsed.query)
                        loai_id = params.get('idLoaiVanBan', [None])[0]
                        if loai_id:
                            document_types.append({
                                'name': text,
                                'url': full_url,
                                'idLoaiVanBan': loai_id,
                                'dvid': params.get('dvid', ['13'])[0]
                            })

        # Nếu không tìm thấy qua link, thử tìm trong select/option (Cấu trúc cũ)
        if not document_types:
            selects = soup.find_all('select')
            for select in selects:
                options = select.find_all('option')
                for option in options:
                    value = option.get('value', '')
                    if 'idLoaiVanBan=' in value or value.isdigit():
                        doc_type_name = option.get_text(strip=True)
                        if doc_type_name and doc_type_name != '-- Chọn --':
                            # Tạo URL từ value
                            if value.isdigit():
                                full_url = f"{self.BASE_URL}?idLoaiVanBan={value}&dvid=13"
                            else:
                                full_url = urljoin(self.BASE_URL, value)
                            
                            parsed = urlparse(full_url)
                            params = parse_qs(parsed.query)
                            if 'idLoaiVanBan' in params:
                                document_types.append({
                                    'name': doc_type_name,
                                    'url': full_url,
                                    'idLoaiVanBan': params['idLoaiVanBan'][0],
                                    'dvid': params.get('dvid', ['13'])[0]
                                })
        
        # Loại bỏ trùng lặp
        seen = set()
        unique_types = []
        for doc_type in document_types:
            key = (doc_type['idLoaiVanBan'], doc_type['dvid'])
            if key not in seen:
                seen.add(key)
                unique_types.append(doc_type)
        
        print(f"Tìm thấy {len(unique_types)} loại văn bản")
        for dt in unique_types:
            print(f"  - {dt['name']}")
        return unique_types
    
    def crawl_homepage_new(self, check_db_func: Optional[Callable] = None) -> List[Dict]:
        """
        Crawl danh sách văn bản mới từ trang chủ dùng Playwright để render JS.
        """
        print(f"Đang kiểm tra văn bản mới tại {self.BASE_URL}...")
        self._init_browser()
        page = self._context.new_page()
        Stealth().apply_stealth_sync(page)
        
        try:
            page.goto(self.BASE_URL, wait_until="networkidle", timeout=60000)
            # Đợi section văn bản mới xuất hiện
            page.wait_for_selector('div[class*="DocumentListHome_list"]', timeout=30000)
            html = page.content()
            soup = BeautifulSoup(html, 'html.parser')
            
            new_docs = []
            # Selector chuẩn xác cho mục Văn bản mới (DocumentListHome_list__JFQaL)
            new_items = soup.select('.DocumentListHome_list__JFQaL .ant-list-item')
            
            if not new_items:
                # Fallback dùng partial match nếu hash class thay đổi
                new_items = soup.select('div[class*="DocumentListHome_list__"] .ant-list-item')
                if not new_items:
                    print("  [Thông báo] Không tìm thấy văn bản mới nào trên trang chủ.")
                    return []

            print(f"  [Crawler] Phát hiện {len(new_items)} mục trong khu vực văn bản mới.")
            for idx, item in enumerate(new_items):
                try:
                    # Tìm link tiêu đề - Đây là thông tin quan trọng nhất
                    # Trích xuất thông tin thông minh từ các cột
                    columns = item.select('div[class*="column"]')
                    doc_number = ""
                    issue_date = ""
                    effective_date = ""
                    title_link = None
                    
                    for col in columns:
                        text = col.get_text(strip=True)
                        label = col.select_one('span[class*="mobileLabel"]')
                        label_text = label.get_text(strip=True).lower() if label else ""
                        value_el = col.select_one('span[class*="value"]')
                        val_text = value_el.get_text(strip=True) if value_el else text
                        
                        if 'ban hành' in label_text or 'ban hành' in text.lower():
                            issue_date = val_text.replace('Ngày ban hành:', '').strip()
                        elif 'hiệu lực' in label_text or 'hiệu lực' in text.lower():
                            effective_date = val_text.replace('Ngày hiệu lực:', '').replace('Hiệu lực:', '').strip()
                        elif not doc_number and '/' in text and any(c.isdigit() for c in text):
                            doc_number = val_text.strip()
                        
                        # Cột tiêu đề
                        if col.select_one('a'):
                            title_link = col.select_one('a')
                    
                    if not title_link:
                        print(f"    [Cảnh báo] Không tìm thấy link tiêu đề cho mục thứ {idx+1}")
                        continue
                    
                    # Làm sạch dữ liệu
                    title = title_link.get_text(strip=True)
                    if doc_number: doc_number = doc_number.split('\n')[0].strip()
                    
                    # Nếu số hiệu quá dài hoặc trống, dùng regex lấy từ title
                    if not doc_number or len(doc_number) > 50:
                        match = re.search(r'([0-9]{1,5}/[0-9]{4}/[A-ZĐ-]+)', title)
                        if match: doc_number = match.group(1)
                    
                    url = urljoin(self.BASE_URL, title_link.get('href', ''))
                    
                    # Log số hiệu văn bản tìm thấy
                    print(f"    [OK] Đã bóc tách: {doc_number if doc_number else 'N/A'} | {title[:50]}...")
                    
                    new_docs.append({
                        'document_number': doc_number,
                        'issued_date': issue_date,
                        'effective_date': effective_date,
                        'title': title,
                        'url': url,
                        'download_url': url # Link detail page để vào lấy file sau
                    })
                except Exception as e:
                    print(f"    [Lỗi mục {idx+1}] {e}")
                    continue
                    
            return new_docs
        except Exception as e:
            print(f"  [Lỗi Playwright Homepage] {e}")
            return []
        finally:
            page.close()
                    
        # 2. Fallback về cấu trúc table cũ nếu không tìm thấy item theo kiểu mới
        if not new_docs:
            tables = soup.find_all('table')
            target_table = None
            for table in tables:
                txt = table.get_text().replace('\xa0', ' ').lower()
                if 'số ký hiệu' in txt and 'tên văn bản' in txt:
                    target_table = table
                    break
            
            if target_table:
                rows = target_table.find_all('tr')[1:]
                print(f"  [Crawler] Phát hiện {len(rows)} văn bản trong mục 'Văn bản mới' (Giao diện cũ).")
                for row in rows:
                    cols = row.find_all('td')
                    if len(cols) < 3: continue
                    
                    doc_number = cols[0].get_text(strip=True)
                    issue_date = cols[1].get_text(strip=True)
                    title_link = cols[2].find('a')
                    
                    if not title_link: continue
                    title = title_link.get_text(strip=True)
                    detail_url = urljoin(self.BASE_URL, title_link.get('href', ''))
                    
                    print(f"  [Tìm thấy] Số hiệu: {doc_number} | Tiêu đề: {title[:70]}...")
                    
                    if check_db_func and check_db_func(doc_number):
                        continue
                        
                    doc_info = {
                        'document_number': doc_number,
                        'issued_date': issue_date,
                        'title': title,
                        'url': detail_url,
                        'download_url': self._get_download_url_from_detail_page(detail_url)
                    }
                    new_docs.append(doc_info)

        if not new_docs:
            print("  [Thông báo] Không tìm thấy văn bản mới nào trên trang chủ.")
            
        return new_docs

    def _get_download_url_from_detail_page(self, detail_url):
        """
        Truy cập trang chi tiết, tìm mục 'Tải về' và lấy link file (Ưu tiên docx, pdf)
        """
        # Thử lấy trực tiếp trang chi tiết trước
        soup = self.get_page(detail_url)
        if not soup: return None
        
        # 1. Thử tìm link downloadfile(...) trong trang hiện tại
        download_links = soup.find_all('a', href=re.compile(r"downloadfile\("))
        if download_links:
            extracted = self._extract_downloadfile_paths(download_links[0].get('href', ''))
            if extracted: return urljoin(self.BASE_DOWNLOAD_URL, extracted[0])
            
        # 2. Thử tìm tab 'Tải về'. Thường là link có dạng ItemID=...&tab=tai-ve
        # Hoặc tìm thẻ <a> có chứa text 'Tải về'
        tai_ve_tab = soup.find('a', string=re.compile(r'Tải về', re.I))
        if tai_ve_tab:
            tab_url = urljoin(self.BASE_URL, tai_ve_tab.get('href', ''))
            tab_soup = self.get_page(tab_url)
            if tab_soup:
                d_links = tab_soup.find_all('a', href=re.compile(r"downloadfile\("))
                if d_links:
                    extracted = self._extract_downloadfile_paths(d_links[0].get('href', ''))
                    if extracted: return urljoin(self.BASE_DOWNLOAD_URL, extracted[0])
                
                # Tìm link trực tiếp đến file
                all_links = tab_soup.find_all('a', href=True)
                for l in all_links:
                    h = l.get('href', '').lower()
                    if any(ext in h for ext in ['.doc', '.docx', '.pdf']):
                        return urljoin(self.BASE_DOWNLOAD_URL, l.get('href'))

        return None
    
    def extract_documents_from_page(self, soup: Optional[BeautifulSoup], url: str) -> List[Dict[str, str]]:
        """
        Trích xuất danh sách văn bản từ một trang. 
        Nếu soup đã được truyền vào, sử dụng soup đó thay vì tải mới.
        
        Args:
            soup: Đối tượng BeautifulSoup đã tải sẵn (nếu có)
            url: URL của trang
            
        Returns:
            List các dict chứa thông tin văn bản
        """
        if not soup:
            soup = self.get_page(url)
            
        if not soup:
            return []
        
        documents = []
        
        # Tìm các div có class="item" (Cấu trúc cũ)
        items = soup.find_all('div', class_='item')
        
        # Tìm các thẻ chứa class "DocumentInfoCard_card" (Cấu trúc mới 2024/2025)
        new_items = soup.select('div[class*="DocumentInfoCard_card"]')
        
        if not items and new_items:
            print(f"  [Crawler] Phát hiện cấu trúc website mới (Ant Design). Đang xử lý {len(new_items)} bản ghi.")
            for item in new_items:
                try:
                    title_link = item.select_one('a[class*="DocumentInfoCard_titleValue"]')
                    if not title_link: continue
                    
                    full_title = title_link.get_text(strip=True)
                    href = title_link.get('href', '')
                    full_url = urljoin(self.BASE_URL, href)
                    
                    # Trích xuất số hiệu từ metadata spans
                    meta_spans = item.select('span[class*="DocumentInfoCard_metadataValue"]')
                    doc_number = ""
                    item_metadata = {}
                    
                    for span in meta_spans:
                        text = span.get_text(strip=True)
                        parent_text = span.parent.get_text(strip=True).lower()
                        if 'số hiệu' in parent_text:
                            doc_number = text
                        elif 'ban hành' in parent_text:
                            item_metadata['issued_date'] = text
                        elif 'hiệu lực' in parent_text:
                            item_metadata['effective_date'] = text
                        elif 'trạng thái' in parent_text:
                            item_metadata['status'] = text
                    
                    # Tách loại văn bản từ tiêu đề nếu possible
                    doc_type = ""
                    if " " in full_title:
                        doc_type = full_title.split(" ", 1)[0]
                    
                    # Tiêu đề thực tế thường là phần sau số hiệu
                    # Nhưng để an toàn ta giữ nguyên hoặc xử lý chuỗi
                    
                    documents.append({
                        'title': full_title,
                        'document_number': doc_number,
                        'url': full_url,
                        'document_type': doc_type,
                        'download_url': None,
                        'item_metadata': item_metadata
                    })
                except: continue
            return documents

        for item in items:
            try:
                # Tìm link đến trang chi tiết trong <p class="title">
                title_p = item.find('p', class_='title')
                if title_p:
                    link = title_p.find('a', href=True)
                    if link:
                        href = link.get('href', '')
                        # Link có dạng: /TW/Pages/vbpq-toanvan.aspx?ItemID=... hoặc /TW/Pages/vbpq-van-ban-goc.aspx?ItemID=...
                        if 'vbpq' in href and 'ItemID=' in href:
                            if not href.startswith('http'):
                                full_url = urljoin(self.BASE_URL, href)
                            else:
                                full_url = href
                            
                            # Lấy số ký hiệu từ link text (ví dụ: "Bộ luật 45/2019/QH14")
                            doc_number = link.get_text(strip=True)
                            
                            # Lấy tiêu đề từ div.des (ví dụ: "Bộ Luật lao động")
                            des_div = item.find('div', class_='des')
                            doc_title = ''
                            if des_div:
                                p_tag = des_div.find('p')
                                if p_tag:
                                    doc_title = p_tag.get_text(strip=True)
                            
                            # Nếu không có tiêu đề, dùng số ký hiệu
                            if not doc_title:
                                doc_title = doc_number
                            
                            # Trích xuất metadata từ item (Ban hành, Hiệu lực, Trạng thái)
                            # Có thể nằm trong các <p> hoặc <div> trong item
                            item_metadata = {}
                            
                            # Tìm các <p> có chứa "Ban hành:", "Hiệu lực:", "Trạng thái:"
                            all_ps = item.find_all('p')
                            for p in all_ps:
                                text = p.get_text(strip=True)
                                if ':' in text:
                                    parts = text.split(':', 1)
                                    if len(parts) == 2:
                                        label = parts[0].strip().lower()
                                        value = parts[1].strip()
                                        
                                        if 'ban hành' in label:
                                            item_metadata['issued_date'] = value
                                        elif 'hiệu lực' in label and 'ngày' not in label:
                                            # "Hiệu lực: 01/01/2018" là ngày hiệu lực, không phải trạng thái
                                            if VBPLCrawler._value_looks_like_vn_date(value):
                                                item_metadata['effective_date'] = value
                                            else:
                                                item_metadata['status'] = value
                                        elif 'ngày' in label and 'hiệu lực' in label:
                                            item_metadata['effective_date'] = value
                                        elif 'trạng thái' in label:
                                            item_metadata['status'] = value
                                        elif 'cơ quan' in label:
                                            item_metadata['issuing_agency'] = value
                            
                            # Nếu không tìm thấy trong <p>, thử tìm trong <div>
                            if not item_metadata.get('issued_date'):
                                all_divs = item.find_all('div')
                                for div in all_divs:
                                    text = div.get_text(strip=True)
                                    # Tìm pattern "Ban hành:20/11/2019"
                                    match = re.search(r'Ban hành[:\s]+(\d{2}/\d{2}/\d{4})', text, re.I)
                                    if match:
                                        item_metadata['issued_date'] = match.group(1)
                                    
                                    # Tìm "Hiệu lực:01/01/2021"
                                    match = re.search(r'Hiệu lực[:\s]+(\d{2}/\d{2}/\d{4})', text, re.I)
                                    if match and not item_metadata.get('effective_date'):
                                        item_metadata['effective_date'] = match.group(1)
                                    
                                    # Tìm "Trạng thái:..."
                                    match = re.search(r'Trạng thái[:\s]+([^Hiệu]+?)(?:Hiệu|$)', text, re.I)
                                    if match and not item_metadata.get('status'):
                                        item_metadata['status'] = match.group(1).strip()
                                    
                                    # Tìm "Cơ quan ban hành:..."
                                    match = re.search(r'Cơ quan ban hành[:\s]+(.+)', text, re.I)
                                    if match and not item_metadata.get('issuing_agency'):
                                        item_metadata['issuing_agency'] = match.group(1).strip()
                            
                            # Tìm link download trong item
                            download_url = None
                            
                            # Trường hợp 1: Link trực tiếp downloadfile
                            download_link = item.find('a', href=re.compile(r"downloadfile\("))
                            if download_link:
                                href_attr = download_link.get('href', '')
                                extracted = self._extract_downloadfile_paths(href_attr)
                                if extracted:
                                    download_url = urljoin(self.BASE_DOWNLOAD_URL, extracted[0])
                            
                            # Trường hợp 2: Link trong divShowDialogDownload
                            if not download_url:
                                # Tìm div có id="divShowDialogDownload_..."
                                dialog_div = item.find('div', id=re.compile(r'divShowDialogDownload_\d+'))
                                if dialog_div:
                                    # Tìm link trong ul.fileAttack
                                    file_ul = dialog_div.find('ul', class_='fileAttack')
                                    if file_ul:
                                        file_link = file_ul.find('a', href=re.compile(r"downloadfile\("))
                                        if file_link:
                                            href_attr = file_link.get('href', '')
                                            extracted = self._extract_downloadfile_paths(href_attr)
                                            if extracted:
                                                download_url = urljoin(self.BASE_DOWNLOAD_URL, extracted[0])
                            
                            # Trường hợp 3: Tìm link có chứa /TW/Lists/vbpq/Attachments/ hoặc /FileData/
                            # Tìm tất cả các loại file: .doc, .docx, .pdf, .zip, .rar, v.v.
                            if not download_url:
                                all_links = item.find_all('a', href=True)
                                for a_link in all_links:
                                    href_attr = a_link.get('href', '')
                                    link_text = a_link.get_text(strip=True).lower()
                                    
                                    # Kiểm tra link có chứa đường dẫn Attachments
                                    if '/TW/Lists/vbpq/Attachments/' in href_attr or '/FileData/TW/Lists/vbpq/Attachments/' in href_attr:
                                        # Ưu tiên file .doc, .docx, .pdf, nhưng cũng lấy .zip nếu không có
                                        if href_attr.startswith('http'):
                                            download_url = href_attr
                                        else:
                                            download_url = urljoin(self.BASE_DOWNLOAD_URL, href_attr)
                                        
                                        # Nếu đã có file .doc/.docx/.pdf, dừng lại
                                        if any(ext in href_attr.lower() for ext in ['.doc', '.docx', '.pdf']):
                                            break
                                        # Nếu là .zip và chưa có file nào, tiếp tục tìm file tốt hơn
                                        elif '.zip' in href_attr.lower() and not download_url:
                                            download_url = urljoin(self.BASE_DOWNLOAD_URL, href_attr) if not href_attr.startswith('http') else href_attr
                                
                                # Nếu vẫn chưa có, lấy file đầu tiên tìm thấy
                                if not download_url:
                                    for a_link in all_links:
                                        href_attr = a_link.get('href', '')
                                        if '/TW/Lists/vbpq/Attachments/' in href_attr or '/FileData/TW/Lists/vbpq/Attachments/' in href_attr:
                                            if href_attr.startswith('http'):
                                                download_url = href_attr
                                            else:
                                                download_url = urljoin(self.BASE_DOWNLOAD_URL, href_attr)
                                            break
                            
                            documents.append({
                                'title': doc_title,
                                'document_number': doc_number,
                                'url': full_url,
                                'download_url': download_url,
                                'item_metadata': item_metadata  # Metadata từ trang danh sách
                            })
            except Exception as e:
                # Bỏ qua item lỗi, tiếp tục với item khác
                continue
        
        # Nếu không tìm thấy qua div.item, thử cách cũ (tìm link trực tiếp)
        if not documents:
            links = soup.find_all('a', href=True)
            for link in links:
                href = link.get('href', '')
                if 'vanban.aspx?id=' in href or 'vbpq' in href and 'ItemID=' in href:
                    if not href.startswith('http'):
                        full_url = urljoin(self.BASE_URL, href)
                    else:
                        full_url = href
                    
                    doc_title = link.get_text(strip=True)
                    if doc_title and len(doc_title) > 3:
                        documents.append({
                            'title': doc_title,
                            'document_number': '',
                            'url': full_url,
                            'download_url': None
                        })
        
        # Loại bỏ trùng lặp
        seen = set()
        unique_docs = []
        for doc in documents:
            if doc['url'] not in seen:
                seen.add(doc['url'])
                unique_docs.append(doc)
        
        return unique_docs
    
    def get_all_documents(self, doc_type_url: str, max_pages: Optional[int] = None) -> List[Dict[str, str]]:
        """
        Lấy tất cả văn bản từ một loại văn bản (có phân trang)
        
        Args:
            doc_type_url: URL của loại văn bản
            max_pages: Số trang tối đa (None = tất cả)
            
        Returns:
            List tất cả văn bản (đã loại bỏ trùng lặp)
        """
        all_documents = []
        seen_urls = set()  # Track URLs đã thấy để tránh trùng lặp
        page = 1
        consecutive_empty = 0  # Đếm số trang trống liên tiếp
        
        while True:
            if max_pages and page > max_pages:
                break
                
            # Thêm tham số phân trang vào URL
            # Website dùng Page=2, Page=3, ... (không phải PageIndex)
            if page == 1:
                page_url = doc_type_url
            else:
                if '?' in doc_type_url:
                    # Kiểm tra xem đã có tham số Page chưa
                    if 'Page=' in doc_type_url:
                        page_url = re.sub(r'Page=\d+', f'Page={page}', doc_type_url)
                    else:
                        page_url = f"{doc_type_url}&Page={page}"
                else:
                    page_url = f"{doc_type_url}?Page={page}"
            
            print(f"  Đang lấy trang {page}...")
            documents = self.extract_documents_from_page(page_url)
            
            if not documents:
                consecutive_empty += 1
                # Nếu 2 trang liên tiếp không có gì, dừng
                if consecutive_empty >= 2:
                    print(f"  Không có văn bản trong {consecutive_empty} trang liên tiếp, dừng phân trang")
                    break
                # Nếu trang đầu không có gì, dừng
                if page == 1:
                    break
                page += 1
                continue
            
            consecutive_empty = 0  # Reset counter
            
            # Loại bỏ trùng lặp trong trang hiện tại và với các trang trước
            new_documents = []
            for doc in documents:
                doc_url = doc.get('url', '')
                if doc_url and doc_url not in seen_urls:
                    seen_urls.add(doc_url)
                    new_documents.append(doc)
            
            if new_documents:
                all_documents.extend(new_documents)
                print(f"  Tìm thấy {len(new_documents)} văn bản mới (tổng: {len(all_documents)})")
            else:
                print(f"  Trang {page} không có văn bản mới (có thể trùng lặp)")
                # Nếu không có văn bản mới, có thể đã hết hoặc lặp lại
                consecutive_empty += 1
                if consecutive_empty >= 2:
                    break
            
            # Kiểm tra xem còn trang tiếp theo không
            # Chỉ kiểm tra nếu có documents trong trang này
            if new_documents:
                # Tìm link phân trang trong HTML đã lấy (không cần request lại)
                # Lấy soup từ lần request gần nhất
                soup = self.get_page(page_url)
                if soup:
                    # Tìm nút phân trang - tìm link có Page= hoặc số trang
                    pagination_links = soup.find_all('a', href=True)
                    has_next = False
                    next_page_num = page + 1
                    
                    # Tìm link có chứa Page= số tiếp theo
                    for link in pagination_links:
                        href = link.get('href', '')
                        text = link.get_text(strip=True)
                        
                        # Kiểm tra link có chứa Page= số tiếp theo
                        if f'Page={next_page_num}' in href or f'&Page={next_page_num}' in href:
                            has_next = True
                            break
                        
                        # Kiểm tra text là số trang tiếp theo
                        if text.isdigit() and int(text) == next_page_num:
                            # Kiểm tra href có chứa Page=
                            if 'Page=' in href:
                                has_next = True
                                break
                        
                        # Tìm text "Trang sau", "Next", ">"
                        if re.search(r'Trang sau|Next|Tiếp|>', text, re.I):
                            if 'Page=' in href:
                                has_next = True
                                break
                    
                    if not has_next:
                        print(f"  Không tìm thấy trang tiếp theo (Page={next_page_num}), dừng phân trang")
                        break
            
            page += 1
        
        print(f"  Tổng cộng: {len(all_documents)} văn bản (đã loại bỏ trùng lặp)")
        return all_documents
    
    def extract_document_metadata(self, doc_url: str) -> Optional[Dict]:
        """
        Trích xuất metadata từ trang chi tiết văn bản
        
        Args:
            doc_url: URL trang chi tiết văn bản
            
        Returns:
            Dict chứa metadata hoặc None nếu lỗi
        """
        soup = self.get_page(doc_url, retries=1) # Chỉ thử 1 lần cho metadata chi tiết
        if not soup:
            return None
        
        metadata = {
            'url': doc_url,
            'title': '',
            'document_number': '',
            'document_type': '',
            'issued_date': '',
            'effective_date': '',
            'expiry_date': '',
            'status': '',
            'issuing_agency': ''
        }
        
        # Trích xuất từ div.vbInfo - đây là nơi chứa metadata chính
        vb_info = soup.find('div', class_='vbInfo')
        if vb_info:
            ul = vb_info.find('ul')
            if ul:
                lis = ul.find_all('li')
                for li in lis:
                    span = li.find('span')
                    if span:
                        label = span.get_text(strip=True)
                        # Lấy value - có thể là text sau span hoặc text của li
                        value = li.get_text(strip=True)
                        # Loại bỏ label khỏi value
                        if label:
                            value = value.replace(label, '').strip()
                        
                        label_lower = label.lower()
                        
                        # Xử lý các trường hợp
                        if 'hiệu lực' in label_lower and 'ngày' not in label_lower:
                            # "Hiệu lực: Hết hiệu lực..." hoặc nhầm lẫn "Hiệu lực: dd/mm/yyyy"
                            if VBPLCrawler._value_looks_like_vn_date(value):
                                metadata['effective_date'] = value
                            else:
                                metadata['status'] = value
                        elif 'ngày có hiệu lực' in label_lower or 'ngày hiệu lực' in label_lower:
                            # "Ngày có hiệu lực: 01/01/2021"
                            metadata['effective_date'] = value
                        elif 'ngày hết hiệu lực' in label_lower:
                            metadata['expiry_date'] = value
                        elif 'ban hành' in label_lower:
                            # "Ban hành: 20/11/2019"
                            metadata['issued_date'] = value
                        elif 'cơ quan' in label_lower:
                            metadata['issuing_agency'] = value
                        elif not label and value:
                            # Nếu không có label, có thể là số ký hiệu (ví dụ: "Bộ luật 45/2019/QH14")
                            if not metadata.get('document_number'):
                                metadata['document_number'] = value
        
        # Nếu không tìm thấy trong vbInfo, thử các cách khác
        if not metadata.get('document_number'):
            # Tìm trong các li không có span (có thể là số ký hiệu)
            if vb_info:
                ul = vb_info.find('ul')
                if ul:
                    for li in ul.find_all('li'):
                        span = li.find('span')
                        if not span or not span.get_text(strip=True):
                            text = li.get_text(strip=True)
                            if text and not metadata.get('document_number'):
                                metadata['document_number'] = text
                                break
        
        # Trích xuất tiêu đề - thử nhiều selector
        if not metadata.get('title'):
            title_elem = (soup.find('h1') or 
                         soup.find('h2') or 
                         soup.find(class_=re.compile(r'title|heading', re.I)) or
                         soup.find(id=re.compile(r'title|heading', re.I)))
            if title_elem:
                metadata['title'] = title_elem.get_text(strip=True)
            else:
                # Fallback: lấy từ title tag
                title_tag = soup.find('title')
                if title_tag:
                    metadata['title'] = title_tag.get_text(strip=True)
        
        # Thử tìm trong table nếu chưa có đủ thông tin
        if not metadata.get('issued_date') or not metadata.get('effective_date'):
            info_tables = soup.find_all('table')
            for table in info_tables:
                rows = table.find_all('tr')
                for row in rows:
                    cells = row.find_all(['td', 'th'])
                    if len(cells) >= 2:
                        label = cells[0].get_text(strip=True).lower()
                        value = cells[1].get_text(strip=True)
                        
                        if not value:
                            continue
                        
                        if 'ngày ban hành' in label and not metadata.get('issued_date'):
                            metadata['issued_date'] = value
                        elif 'ngày hiệu lực' in label and not metadata.get('effective_date'):
                            metadata['effective_date'] = value
                        elif 'ngày hết hiệu lực' in label and not metadata.get('expiry_date'):
                            metadata['expiry_date'] = value
                        elif 'trạng thái' in label and not metadata.get('status'):
                            metadata['status'] = value
                        elif 'cơ quan' in label and not metadata.get('issuing_agency'):
                            metadata['issuing_agency'] = value
        
        return metadata
    
    @staticmethod
    def _best_preferred_attachment_url(urls: List[str]) -> Optional[str]:
        """Chọn URL đính kèm tốt nhất: .docx > .pdf > .doc > còn lại."""
        if not urls:
            return None
        ranked: List[tuple] = []
        rest: List[str] = []
        for u in urls:
            p = urlparse(u).path.lower()
            if p.endswith('.docx'):
                ranked.append((0, u))
            elif p.endswith('.pdf'):
                ranked.append((1, u))
            elif p.endswith('.doc'):
                ranked.append((2, u))
            else:
                rest.append(u)
        if ranked:
            ranked.sort(key=lambda x: x[0])
            return ranked[0][1]
        return rest[0] if rest else None
    
    def find_all_document_download_links(self, doc_url: str) -> list[str]:
        """
        Tìm TẤT CẢ các link tải file trong trang chi tiết văn bản (duyệt html).
        Trả về danh sách link (ưu tiên doc, docx, pdf trước).
        """
        soup = self.get_page(doc_url)
        if not soup:
            return []
            
        all_links = []
        
        def add_link(href: str):
            if not href:
                return
            if 'downloadfile' in href:
                extracted = self._extract_downloadfile_paths(href)
                if extracted:
                    for p in extracted:
                        all_links.append(urljoin(self.BASE_DOWNLOAD_URL, p))
            elif '/TW/Lists/vbpq/Attachments/' in href or '/FileData/TW/Lists/vbpq/Attachments/' in href:
                if href.startswith('http'):
                    all_links.append(href)
                else:
                    all_links.append(urljoin(self.BASE_DOWNLOAD_URL, href))
                    
        from urllib.parse import urljoin
        
        # 1. Javascript scripts
        for script in soup.find_all('script'):
            if script.string:
                for file_path in self._extract_downloadfile_paths(script.string):
                    all_links.append(urljoin(self.BASE_DOWNLOAD_URL, file_path))
                    
        # 2. HTML links
        for link in soup.find_all('a', href=True):
            add_link(link.get('href', ''))
            
        seen = set()
        unique_links = []
        for link in all_links:
            if link and link not in seen:
                seen.add(link)
                unique_links.append(link)
                
        preferred_files = []
        other_files = []
        for f in unique_links:
            if any(ext in f.lower() for ext in ['.doc', '.docx', '.pdf']):
                preferred_files.append(f)
            else:
                other_files.append(f)
                
        return preferred_files + other_files
        
    @staticmethod
    def _encode_url_path(url: str) -> str:
        """Mã hóa path (khoảng trắng, Unicode) — vbpl hay trả path có dấu và space."""
        parts = urlsplit(url)
        if not parts.scheme or not parts.netloc:
            return url
        path = quote(unquote(parts.path), safe='/')
        return urlunsplit((parts.scheme, parts.netloc, path, parts.query, parts.fragment))
    
    @staticmethod
    def _short_vanban_goc_urls(url: str) -> List[str]:
        """
        Một số link gộp tên hiển thị dài sau mã VanBanGoc_*.ext nhưng file thực chỉ là mã + ext.
        Ví dụ: .../VanBanGoc_144.2025.QH15 Luật Sửa đổi....pdf -> .../VanBanGoc_144.2025.QH15.pdf
        """

    
    def download_file(self, try_url: str, filepath: Path) -> bool:
        """
        Tải file từ URL chính xác đã đưa vào.
        """
        attempt = 0
        response = None
        import requests
        import time
        while True:
            attempt += 1
            try:
                time.sleep(self.delay)
                response = self.session.get(try_url, timeout=90, stream=True)
                
                if response.status_code in (500, 502, 504):
                    # Lỗi server nội bộ, bỏ qua ngay theo yêu cầu
                    print(f"  Lỗi server {response.status_code}, bỏ qua file này.")
                    return False
                
                if response.status_code in (429, 503):
                    # Quá tải tạm thời, thử lại vô hạn
                    wait = min(300.0, max(self.delay * 5, self.delay * (2 ** min(attempt, 8))))
                    print(f"  Server quá tải (HTTP {response.status_code}), chờ {wait:.0f}s thử lại (lần {attempt})...")
                    time.sleep(wait)
                    continue

                if response.status_code in (400, 401, 404):
                    print(f"  Lỗi {response.status_code}: {try_url}")
                    return False
                
                response.raise_for_status()
                break
                
            except requests.exceptions.Timeout as e:
                # Nếu đã thử 2 lần (gồm 1 lần ban đầu và 1 lần thử lại) mà vẫn timeout thì đổi link khác
                if attempt >= 2:
                    print(f"    Link này bị Timeout liên tiếp, thử link khác...")
                    return False
                wait = 2.0
                print(f"    Lỗi Timeout (lần {attempt}). Thử lại link này một lần nữa sau {wait}s...")
                time.sleep(wait)
                continue
            except requests.exceptions.RequestException as e:
                # Lỗi kết nối thường là do server chặn hoặc đứt đoạn, thử lại 1 lần rồi đổi link
                if attempt >= 2:
                    print(f"    Lỗi kết nối liên tiếp ở link này, thử link khác...")
                    return False
                wait = 2.0
                print(f"    Lỗi kết nối (lần {attempt}). Thử lại link này sau {wait}s...")
                time.sleep(wait)
                continue
        
        try:
            with open(filepath, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            if filepath.exists() and filepath.stat().st_size > 0:
                return True
            else:
                print(f"  File tải về rỗng: {try_url}")
                return False
        except Exception as e:
            print(f"  Lỗi khi ghi file {try_url}: {e}")
            return False

    
    # Đuôi file coi là đã crawl xong (không tải lại nếu cùng URL và file > 0 byte)
    _DOWNLOADED_CONTENT_EXTS = frozenset({
        '.doc', '.docx', '.pdf', '.txt', '.zip', '.rar', '.7z',
    })
    
    def _folder_has_downloaded_content(self, folder: Path) -> bool:
        """Có ít nhất một file nội dung hợp lệ (đuôi cho phép, kích thước > 0)."""
        if not folder.is_dir():
            return False
        try:
            for p in folder.iterdir():
                if not p.is_file() or p.name == 'metadata.json':
                    continue
                if p.name.startswith('.'):
                    continue
                if p.suffix.lower() in self._DOWNLOADED_CONTENT_EXTS:
                    try:
                        if p.stat().st_size > 0:
                            return True
                    except OSError:
                        continue
        except OSError:
            return False

    def _content_base_filename(self, metadata: Dict) -> str:
        """Tên file nội dung (không đuôi), đã sanitize."""
        content_filename = metadata.get('title', 'content')
        if not content_filename or content_filename == 'content':
            content_filename = metadata.get('document_number', 'content')
        if len(content_filename) > 150:
            parts = re.split(r'[-:]', content_filename, 1)
            content_filename = parts[0].strip()
            if len(content_filename) > 150:
                content_filename = content_filename[:150]
        return self.sanitize_filename(content_filename)
    
    def get_detailed_metadata(self, doc_basic: Dict) -> Dict:
        """
        Truy cập trang chi tiết để lấy metadata theo đúng yêu cầu của USER.
        Sử dụng logic click tab và quét label chuẩn trên giao diện Next.js.
        """
        metadata = {
            "url": doc_basic.get('url'),
            "title": doc_basic.get('title'),
            "document_number": doc_basic.get('document_number'),
            "issued_date": doc_basic.get('issued_date', ''),
            "effective_date": "",
            "status": "",
            "issuing_agency": ""
        }
        
        detail_url = doc_basic.get('url')
        if not detail_url: return metadata
        
        self._init_browser()
        page = self._context.new_page()
        Stealth().apply_stealth_sync(page)
        try:
            # 1. Tải trang và click tab Thuộc tính
            page.goto(detail_url, wait_until="networkidle", timeout=60000)
            
            try:
                attr_tab = page.get_by_role("tab", name="Thuộc tính")
                if attr_tab.is_visible():
                    attr_tab.click()
                    page.wait_for_timeout(1000) # Chờ render
            except: pass

            # 2. Quét các thẻ div chứa label và value
            all_text = page.inner_text('body')
            
            def extract_val(label_name):
                try:
                    lines = all_text.split('\n')
                    for i, line in enumerate(lines):
                        line_clean = line.strip()
                        if label_name.lower() in line_clean.lower():
                            # TH1: Nhãn và giá trị trên cùng dòng (Số hiệu: 140/...)
                            if ':' in line_clean:
                                val = line_clean.split(':', 1)[1].strip()
                                if val: return val
                            
                            # TH2: Giá trị nằm ở dòng tiếp theo
                            if i + 1 < len(lines):
                                next_line = lines[i+1].strip()
                                if next_line and len(next_line) < 100: # Tránh lấy nhầm đoạn văn dài
                                    return next_line
                            
                            # TH3: Nhãn và giá trị dính liền nhưng có khoảng cách (Ngày có hiệu lực 16/04/2026)
                            # Thử dùng regex lấy ngày tháng ngay sau nhãn
                            import re
                            match = re.search(r'(\d{1,2}/\d{1,2}/\d{4})', line_clean[len(label_name):])
                            if match: return match.group(1)
                except: pass
                return ""

            original_doc_number = metadata.get('document_number', '')
            doc_type_prefix = extract_val("Loại văn bản")
            doc_num_only = extract_val("Số hiệu") or original_doc_number
            
            # Ghép thành số hiệu đầy đủ: [Loại văn bản] [Số hiệu]
            if doc_type_prefix and doc_num_only:
                if doc_type_prefix.lower() not in doc_num_only.lower():
                    metadata['document_number'] = f"{doc_type_prefix} {doc_num_only}"
                else:
                    metadata['document_number'] = doc_num_only
            else:
                known_prefixes = ('Luật ', 'Nghị định ', 'Thông tư ', 'Quyết định ', 'Nghị quyết ', 'Chỉ thị ', 'Văn bản hợp nhất ')
                if original_doc_number.startswith(known_prefixes) and not str(doc_num_only).startswith(known_prefixes):
                    metadata['document_number'] = original_doc_number
                else:
                    metadata['document_number'] = doc_num_only or original_doc_number

            metadata['issued_date'] = extract_val("Ngày ban hành") or metadata['issued_date']
            metadata['effective_date'] = extract_val("Ngày có hiệu lực") or extract_val("Ngày hiệu lực")
            metadata['status'] = extract_val("Tình trạng hiệu lực") or extract_val("Trạng thái")
            metadata['issuing_agency'] = extract_val("Cơ quan ban hành")

            print(f"    -> Đã bóc tách metadata chi tiết.")
        except Exception as e:
            print(f"    [Lỗi bóc tách chi tiết] {e}")
        finally:
            page.close()
        return metadata

    def save_document(self, doc_type_name: str, metadata: Dict, content_url: Optional[str] = None, update_mode: bool = False):
        """
        Lưu văn bản vào thư mục, hỗ trợ tải file qua Playwright nếu cần.
        """
        doc_number = metadata.get('document_number', '')
        # Chuẩn hóa: Loại bỏ tiền tố loại văn bản để folder name luôn thống nhất (ví dụ: 'Nghị định 140' -> '140')
        clean_num = doc_number
        prefixes = ['Nghị định', 'Thông tư', 'Quyết định', 'Luật', 'Nghị quyết', 'Chỉ thị', 'Thông tư liên tịch']
        for pfix in prefixes:
            if clean_num.startswith(pfix):
                clean_num = clean_num[len(pfix):].strip()
                break
        
        doc_folder_name = self.sanitize_filename(clean_num if clean_num and 'không số' not in clean_num.lower() else metadata.get('title', 'Unknown'))
        if len(doc_folder_name) > 150: doc_folder_name = doc_folder_name[:150]
        
        doc_type_dir = self.output_dir / self.sanitize_filename(doc_type_name)
        doc_folder = doc_type_dir / doc_folder_name
        
        doc_type_dir.mkdir(exist_ok=True)
        doc_folder.mkdir(parents=True, exist_ok=True)
        
        # Luôn ghi đè metadata mới nhất (để cập nhật trạng thái, ngày tháng...)
        with open(doc_folder / 'metadata.json', 'w', encoding='utf-8') as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)

        # Log chẩn đoán đường dẫn
        print(f"    -> Đang kiểm tra file tại: {doc_folder.absolute()}")

        # Kiểm tra nếu đã có file nội dung rồi thì bỏ qua bước tải file (tiết kiệm thời gian)
        if self._folder_has_downloaded_content(doc_folder):
            print(f"    -> [OK] File nội dung đã tồn tại. Bỏ qua bước tải lại file.")
            return "METADATA_UPDATED"
            
        success = False
        detail_url = metadata.get('url')
        
        # THỰC HIỆN TẢI FILE QUA PLAYWRIGHT (Xử lý giao diện mới)
        if detail_url:
            self._init_browser()
            page = self._context.new_page()
            Stealth().apply_stealth_sync(page)
            try:
                print(f"    [Playwright] Đang vào trang chi tiết để tải file...")
                page.goto(detail_url, wait_until="networkidle", timeout=60000)
                
                # TRÍCH XUẤT THÊM METADATA TỪ TRANG CHI TIẾT (Ngày hiệu lực, Ngày đăng công báo...)
                try:
                    # Đợi bảng thuộc tính (nếu có)
                    prop_rows = page.query_selector_all('tr:has(td)')
                    for row in prop_rows:
                        cells = row.query_selector_all('td')
                        if len(cells) >= 2:
                            key = cells[0].inner_text().strip().lower()
                            val = cells[1].inner_text().strip()
                            if 'hiệu lực' in key and 'hết' not in key:
                                metadata['effective_date'] = val
                            elif 'hết hiệu lực' in key:
                                metadata['expired_date'] = val
                            elif 'đăng công báo' in key:
                                metadata['gazette_date'] = val
                            elif 'loại văn bản' in key:
                                metadata['document_type'] = val
                            elif 'nguồn thu thập' in key:
                                metadata['source'] = val
                            elif 'tình trạng' in key or 'trạng thái' in key:
                                metadata['status'] = val
                    print(f"    -> Đã cập nhật thêm thuộc tính (bao gồm trạng thái) từ trang chi tiết.")
                except: pass
                
                # Tìm và click vào tab "Tải về"
                tab_selectors = [
                    'div[role="tab"]:has-text("Tải về")',
                    '#rc-tabs-0-tab-tai-ve',
                    'text="Tải về"',
                    '.ant-tabs-tab-btn:has-text("Tải về")'
                ]
                
                tab_found = False
                for selector in tab_selectors:
                    try:
                        if page.is_visible(selector, timeout=5000):
                            page.click(selector)
                            tab_found = True
                            print(f"    -> Đã click vào tab Tải về.")
                            break
                    except: continue
                
                if tab_found:
                    time.sleep(2) # Chờ nội dung tab load
                    
                    # Tìm các nút tải
                    download_buttons = page.query_selector_all('button:has(svg), a:has(svg), .ant-btn:has(svg)')
                    if not download_buttons:
                        download_buttons = page.query_selector_all('button[aria-label*="tải"], button:has-text("Tải")')

                    for btn in download_buttons:
                        try:
                            if not btn.is_visible(): continue
                            print(f"    -> Đang thử click nút tải...")
                            with page.expect_download(timeout=30000) as download_info:
                                btn.click()
                            download = download_info.value
                            raw_filename = download.suggested_filename or "document.pdf"
                            suggested_filename = self.sanitize_filename(raw_filename)
                            raw_suffix = Path(raw_filename).suffix
                            if raw_suffix and not Path(suggested_filename).suffix:
                                max_base_len = max(1, 90 - len(raw_suffix))
                                suggested_filename = f"{Path(suggested_filename).stem[:max_base_len].strip()}{raw_suffix}"
                            elif not Path(suggested_filename).suffix:
                                suggested_filename = f"{suggested_filename[:86].strip()}.pdf"
                            target_path = doc_folder / suggested_filename
                            download.save_as(target_path)
                            print(f"    [Thành công] Đã tải: {suggested_filename} ({target_path.stat().st_size} bytes)")
                            success = True
                            metadata['download_url_actual'] = download.url
                            # Ghi đè metadata đã được làm giàu
                            with open(doc_folder / 'metadata.json', 'w', encoding='utf-8') as f:
                                json.dump(metadata, f, ensure_ascii=False, indent=2)
                            break
                        except: continue
                else:
                    print("    [Cảnh báo] Không tìm thấy tab 'Tải về' trên trang này.")
            except Exception as e:
                print(f"    [Lỗi Playwright] {e}")
            finally:
                page.close()

        if not success:
            print(f"    Bỏ qua vì tất cả các phương thức tải đều lỗi.")
            try:
                if not self._folder_has_downloaded_content(doc_folder):
                    import shutil
                    shutil.rmtree(doc_folder)
            except: pass


    def crawl_document_type(self, doc_type: Dict, max_pages: Optional[int] = None, 
                            max_docs: Optional[int] = None, skip_docs: int = 0, start_page: int = 1, update_mode: bool = False):
        """
        Crawl một loại văn bản
        
        Args:
            doc_type: Dict chứa thông tin loại văn bản
            max_pages: Số trang tối đa
            max_docs: Số văn bản tối đa
            skip_docs: Bỏ qua N văn bản đầu tiên (từ trang bắt đầu)
            start_page: Trang bắt đầu (mặc định 1)
        """
        doc_type_name = doc_type['name']
        doc_type_url = doc_type['url']
        
        print(f"\n{'='*60}")
        print(f"Crawling loại văn bản: {doc_type_name}")
        print(f"URL: {doc_type_url}")
        if skip_docs > 0:
            print(f"Bỏ qua {skip_docs} văn bản đầu tiên.")
        print(f"{'='*60}")
        
        # Crawl theo kiểu cuốn chiếu (Trang nào tải luôn trang đó)
        success_count = 0
        error_count = 0
        total_found = 0
        page = start_page
        
        while True:
            print(f"  --- Đang xử lý Trang {page} ---")
            page_url = f"{doc_type_url}&Page={page}"
            
            soup = self.get_page(page_url)
            if not soup:
                # Nếu get_page trả về None, nghĩa là 404 sau nhiều lần thử - đây là dấu hiệu hết trang
                break
            
            page_docs = self.extract_documents_from_page(soup, page_url)
            if not page_docs:
                # Nếu trang bắt đầu nhưng lại rỗng -> có thể bị chặn. Thử lại vô hạn.
                if page == start_page:
                    print(f"  Trang {page} rỗng dữ liệu, chờ 60s thử lại...")
                    time.sleep(60)
                    self._set_random_headers()
                    continue
                # Nếu không phải trang đầu mà rỗng, có thể đã hết dữ liệu thật (404 là dấu hiệu chính)
                break
                
            # Xử lý từng văn bản trong trang hiện tại
            for doc in page_docs:
                total_found += 1
                
                # Logic bỏ qua N văn bản đầu tiên
                if total_found <= skip_docs:
                    if total_found % 500 == 0 or total_found == skip_docs:
                        print(f"  Đã lướt qua {total_found}/{skip_docs} văn bản...")
                    continue
                
                current_idx = total_found
                print(f"\n[{current_idx}] {doc['title']}")
                
                try:
                    # Tạo metadata từ thông tin đã có ở trang danh sách
                    metadata = {
                        'url': doc['url'],
                        'title': doc.get('title', ''),
                        'document_number': doc.get('document_number', ''),
                        'issued_date': '',
                        'effective_date': '',
                        'status': '',
                        'issuing_agency': ''
                    }
                    
                    item_metadata = doc.get('item_metadata', {})
                    if item_metadata:
                        for key, val in item_metadata.items():
                            if val: metadata[key] = val
                    
                    content_url = doc.get('download_url')
                    res = self.save_document(doc_type_name, metadata, content_url, update_mode=update_mode)
                    if res == "EXISTED":
                        print(f"  [Update] Gặp văn bản đã tồn tại ({doc.get('title')}), dừng crawl danh mục này.")
                        return # Kết thúc crawl danh mục này vì phần sau đều là văn bản cũ
                    success_count += 1
                except Exception as e:
                    print(f"  Lỗi khi xử lý văn bản ở mục {doc_type_name}: {e}")
                    error_count += 1
                
                if max_docs and success_count >= max_docs:
                    print(f"  Đã đạt giới hạn tối đa {max_docs} văn bản.")
                    return

            # Kiểm tra phân trang tiếp theo (Cải tiến cơ chế nhận diện)
            has_next = False
            next_page_num = page + 1
            
            # Tìm trong toàn bộ các thẻ link (<a>) của trang
            for a in soup.find_all('a', href=True):
                href = a.get('href', '')
                text = a.get_text().strip()
                
                # Link có chứa số trang tiếp theo (ví dụ: Page=2) hoặc text là số trang tiếp theo
                if f'Page={next_page_num}' in href or text == str(next_page_num):
                    has_next = True
                    break
                
                # Link có chứa ký hiệu điều hướng "Tiếp theo"
                if re.search(r'Trang sau|Next|Tiếp|>', text, re.I):
                    if 'Page=' in href: # Đảm bảo link này thực sự có tham số chuyển trang
                        has_next = True
                        break
            
            if not has_next:
                print(f"  Hết danh sách phân trang cho mục {doc_type_name}.")
                break
            
            if max_pages and page >= max_pages:
                print(f"  Đã đạt giới hạn {max_pages} trang.")
                break
                
            page += 1
        
        print(f"\n{'='*60}")
        print(f"Hoàn thành: {success_count} thành công, {error_count} lỗi")
        print(f"{'='*60}")
        return success_count
    
    def crawl(self, doc_type_filter: Optional[str] = None, max_pages: Optional[int] = None, 
              max_docs: Optional[int] = None, skip_pages: int = 0, skip_docs: int = 0, update_mode: bool = False):
        """
        Crawl tất cả các loại văn bản
        
        Args:
            doc_type_filter: Chỉ crawl loại văn bản này (None = tất cả)
            max_pages: Số trang tối đa cho mỗi loại
            max_docs: Số văn bản tối đa cho mỗi loại
            skip_pages: Số trang bỏ qua từ đầu (áp dụng cho mỗi loại)
            skip_docs: Số lượng văn bản bỏ qua (áp dụng cho mỗi loại, đếm từ sau khi skip trang)
        """
        print("Bắt đầu crawl từ vbpl.vn...")
        print(f"Thư mục lưu dữ liệu: {self.output_dir.absolute()}")
        
        # Lấy danh sách loại văn bản
        try:
            document_types = self.extract_document_types()
        except Exception as e:
            print(f"Lỗi khi lấy danh sách loại văn bản: {e}")
            return
        
        if not document_types:
            print("Không tìm thấy loại văn bản nào!")
            print("Có thể website đã thay đổi cấu trúc hoặc có vấn đề kết nối.")
            return
        
        # Lưu danh sách gốc để hiển thị khi lỗi
        all_document_types = document_types.copy()
        
        # Lọc theo doc_type_filter nếu có
        if doc_type_filter:
            filter_lower = doc_type_filter.lower().strip()
            filtered_types = []
            for dt in document_types:
                name_lower = dt['name'].lower().strip()
                # Match chính xác (để tránh "Luật" match "Bộ luật")
                if name_lower == filter_lower:
                    filtered_types.append(dt)
            
            document_types = filtered_types
            if not document_types:
                print(f"Không tìm thấy loại văn bản: {doc_type_filter}")
                print(f"Các loại văn bản có sẵn: {[dt['name'] for dt in all_document_types]}")
                return
        
        # Danh sách các loại văn bản cần bỏ qua hoàn toàn
        skip_types = ["Hiến pháp", "Bộ luật", "Luật", "Pháp lệnh", "Lệnh", "Nghị quyết", "Nghị quyết liên tịch", "Quyết định","Thông tư", "Thông tư liên tịch"]
        
        # Crawl từng loại văn bản
        total_types = len(document_types)
        total_success_count = 0
        for idx, doc_type in enumerate(document_types, 1):
            name_clean = doc_type['name'].strip()
            
            # Kiểm tra bỏ qua (Không phân biệt hoa thường, xóa khoảng trắng thừa)
            if not doc_type_filter and any(s.strip().lower() == name_clean.lower() for s in skip_types):
                print(f"\n[Bỏ qua] Loại văn bản: {name_clean} (nằm trong danh sách skip_types)")
                continue
            
            # Logic bỏ qua N trang hoặc M văn bản
            final_start_page = skip_pages + 1
            final_skip_docs = skip_docs
            
            # Chỉ hardcode fallback nếu không truyền skip_docs từ command line
            if final_start_page == 1 and final_skip_docs == 0:
                if doc_type['name'] == "Quyết định":
                    final_skip_docs = 6110
                elif doc_type['name'] == "Thông tư":
                    final_skip_docs = 1792

            try:
                print(f"\n\n{'#'*60}")
                print(f"Loại văn bản {idx}/{total_types}: {doc_type['name']}")
                print(f"{'#'*60}")
                # Nhận về số lượng thành công từ hàm con
                cat_success = self.crawl_document_type(doc_type, max_pages, max_docs, skip_docs=final_skip_docs, start_page=final_start_page, update_mode=update_mode)
                total_success_count += (cat_success or 0)
            except Exception as e:
                print(f"Lỗi khi crawl loại văn bản {doc_type['name']}: {e}")
                continue
        
        print(f"\n\n{'='*60}")
        print("Hoàn thành crawl tất cả!")
        print(f"Dữ liệu được lưu tại: {self.output_dir.absolute()}")
        # Thêm signal cho hệ thống quản trị nếu không có gì mới
        if update_mode and total_success_count == 0:
            print("CRAWLER_SIGNAL: NO_NEW_DOCS")
        elif total_success_count > 0:
            print(f"CRAWLER_SIGNAL: NEW_DOCS_COUNT={total_success_count}")
        print(f"{'='*60}")


def main():
    parser = argparse.ArgumentParser(description='Crawler cho website vbpl.vn')
    parser.add_argument('--output', '-o', default='vbpl_data', 
                       help='Thư mục lưu dữ liệu (mặc định: vbpl_data)')
    parser.add_argument('--max-pages', type=int, 
                       help='Số trang tối đa cho mỗi loại văn bản')
    parser.add_argument('--max-docs', type=int,
                       help='Số văn bản tối đa cho mỗi loại văn bản')
    parser.add_argument('--type', '-t',
                       help='Chỉ crawl loại văn bản cụ thể (ví dụ: "Bộ luật")')
    parser.add_argument('--skip-pages', type=int, default=0,
                       help='Số lượng trang muốn bỏ qua hoàn toàn')
    parser.add_argument('--skip-docs', type=int, default=0,
                       help='Số lượng văn bản muốn bỏ qua (tính từ trang bắt đầu)')
    parser.add_argument('--delay', type=float, default=1.0,
                       help='Thời gian delay giữa các request (giây, mặc định: 1.0)')
    parser.add_argument('--proxies', nargs='+', 
                       help='Danh sách proxy (ví dụ: http://ip:port)')
    parser.add_argument('--update', action='store_true',
                       help='Chế độ update: tự động dừng khi gặp văn bản đã tồn tại')
    parser.add_argument('--homepage-new', action='store_true',
                       help='Crawl văn bản mới từ trang chủ')
    
    args = parser.parse_args()
    
    crawler = VBPLCrawler(output_dir=args.output, delay=args.delay, proxies=args.proxies)
    
    def format_date_to_db(date_str):
        if not date_str:
            return None
        date_str = str(date_str).strip()
        if date_str in {"--", "-", "N/A", "n/a", "Không xác định"}:
            return None
        # Nếu đã là YYYY-MM-DD thì giữ nguyên
        if re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
            return date_str
        # Nếu là DD/MM/YYYY thì chuyển về YYYY-MM-DD
        match = re.search(r'(\d{1,2})/(\d{1,2})/(\d{4})', date_str)
        if match:
            d, m, y = match.groups()
            return f"{y}-{m.zfill(2)}-{d.zfill(2)}"
        return None
    
    try:
        if args.homepage_new:
            # Mở kết nối DB
            db_conn = None
            try:
                import psycopg2
                db_conn = psycopg2.connect(host='localhost', port=5433, user='postgres', password='123456', dbname='legal_ai')
                print("    [Hệ thống] Kết nối Database thành công.")
            except Exception as e:
                print(f"    [Cảnh báo] Không thể kết nối DB: {e}")

            # 1. Lấy danh sách 10 văn bản từ trang chủ
            new_docs_basic = crawler.crawl_homepage_new()
            
            if not new_docs_basic:
                print("CRAWLER_SIGNAL: NO_NEW_DOCS")
                return
                
            print(f"Đang xử lý {len(new_docs_basic)} văn bản...")
            downloaded_count = 0
            
            for doc_basic in new_docs_basic:
                # 2. Truy cập trang chi tiết để lấy metadata CHUẨN
                print(f"\n{'*'*50}")
                print(f"[*] ĐANG XEM CHI TIẾT: {doc_basic['document_number']}")
                full_metadata = crawler.get_detailed_metadata(doc_basic)
                
                # Hiển thị Metadata bóc tách được dưới dạng JSON (Theo yêu cầu của USER)
                print("\n    --- METADATA THU THẬP ĐƯỢC (JSON) ---")
                print(json.dumps(full_metadata, indent=2, ensure_ascii=False))
                print("    ------------------------------------\n")
                
                # 3. Đối soát DB
                is_new = True
                if db_conn:
                    cur = None
                    try:
                        cur = db_conn.cursor()
                        clean_num = full_metadata['document_number'].strip()
                        print(f"    -> Đang check DB cho số hiệu: '{clean_num}'")
                        
                        # Tìm TẤT CẢ các bản ghi trùng số hiệu để dọn dẹp
                        cur.execute('SELECT status, "effectiveDate", "documentId" FROM "LegalDocuments" WHERE TRIM("documentNumber") ILIKE %s ORDER BY "id" ASC', (clean_num,))
                        rows = cur.fetchall()
                        
                        if rows:
                            is_new = False
                            web_status = full_metadata.get('status', '')
                            web_eff = format_date_to_db(full_metadata.get('effective_date', ''))
                            s_web_status = str(web_status or '').strip()
                            s_web_eff = str(web_eff or '').strip()

                            # Bản ghi đầu tiên sẽ được giữ lại làm bản ghi chính
                            primary_row = rows[0]
                            p_db_status, p_db_eff, p_db_id = primary_row[0], primary_row[1], primary_row[2]
                            
                            if len(rows) > 1:
                                print(f"    -> CẢNH BÁO: Tìm thấy {len(rows)} bản ghi trùng. Đang giữ lại ID: {str(p_db_id).strip()} và xóa các bản ghi thừa...")
                            else:
                                print(f"    -> Đã có trong DB (ID: {str(p_db_id).strip()}). Đang đối soát và cập nhật metadata mới nhất...")
                            
                            # 1. Cập nhật bản ghi chính
                            cur.execute('UPDATE "LegalDocuments" SET status = %s, "effectiveDate" = %s WHERE "documentId" = %s', 
                                       (s_web_status or p_db_status, s_web_eff or p_db_eff, p_db_id))
                            
                            # 2. Xóa tất cả các bản ghi trùng còn lại (nếu có)
                            if len(rows) > 1:
                                for i in range(1, len(rows)):
                                    dup_id = rows[i][2]
                                    cur.execute('DELETE FROM "LegalDocuments" WHERE "documentId" = %s', (dup_id,))
                                    print(f"       [Xóa rác] Đã xóa bản ghi trùng ID: {str(dup_id).strip()}")
                            
                            db_conn.commit()
                            print(f"    -> Đã dọn dẹp và cập nhật xong bản ghi chính.")
                        else:
                            print(f"    -> KHÔNG tìm thấy trong DB. Đây là văn bản mới.")
                    except Exception as e:
                        db_conn.rollback()
                        print(f"    [Lỗi DB Check] {e}")
                    finally:
                        if cur:
                            cur.close()
                else:
                    print("    [Lỗi] Không có kết nối DB để đối soát.")

                # 4. Nếu là văn bản mới thì tải và lưu
                if is_new:
                    crawler.save_document("van_ban_moi", full_metadata, full_metadata['url'])
                    downloaded_count += 1
            
            if db_conn: db_conn.close()
            
            if len(new_docs_basic) > 0:
                print(f"CRAWLER_SIGNAL: NEW_DOCS_COUNT={len(new_docs_basic)}")
            else:
                print("CRAWLER_SIGNAL: NO_NEW_DOCS")
        else:
            crawler.crawl(
                doc_type_filter=args.type,
                max_pages=args.max_pages,
                max_docs=args.max_docs,
                skip_pages=args.skip_pages,
                skip_docs=args.skip_docs,
                update_mode=args.update
            )
    finally:
        crawler.close()


if __name__ == '__main__':
    main()
