import sys, os, json, shutil, subprocess, zipfile, time, tempfile, re
from pathlib import Path
import pdfminer.high_level
from concurrent.futures import ProcessPoolExecutor

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

# ĐƯỜNG DẪN CÔNG CỤ
PANDOC_PATH = r"C:\Users\LENOVO\Downloads\pandoc-3.9.0.2\pandoc.exe"
if not os.path.exists(PANDOC_PATH):
    PANDOC_PATH = r"C:\Users\LENOVO\Downloads\pandoc-3.9.0.2\bin\pandoc.exe"

POSSIBLE_SOFFICE_PATHS = [
    r"C:\Program Files\LibreOffice\program\soffice.exe",
    r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
]
SOFFICE_PATH = "soffice"
for path in POSSIBLE_SOFFICE_PATHS:
    if os.path.exists(path):
        SOFFICE_PATH = path
        break

def safe_remove(file_path, retries=5, delay=1):
    """Xóa file an toàn, thử lại nếu bị chiếm dụng bởi process khác"""
    for i in range(retries):
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
            return True
        except PermissionError:
            time.sleep(delay)
        except Exception:
            break
    return False

def validate_docx(docx_path):
    path = Path(docx_path)
    if not path.exists() or path.stat().st_size == 0: return False
    try:
        with zipfile.ZipFile(docx_path) as zf:
            return zf.testzip() is None
    except: return False

def doc_to_docx_with_retry(doc_path, out_dir):
    try:
        expected_name = Path(doc_path).stem + ".docx"
        docx_path = Path(out_dir) / expected_name
        if docx_path.exists(): safe_remove(docx_path)
        
        subprocess.run([
            SOFFICE_PATH, "--headless", "--convert-to", "docx", "--outdir", str(out_dir), str(doc_path)
        ], capture_output=True, text=True, timeout=90)
        
        if validate_docx(docx_path): return docx_path
    except: pass
    return None

def convert_with_pandoc(input_path, output_path):
    try:
        result = subprocess.run([
            PANDOC_PATH, str(input_path), "-t", "gfm", "-o", str(output_path), "--wrap=none"
        ], capture_output=True, text=True)
        return result.returncode == 0
    except: return False

def save_to_mid(file_path, rel_folder, mid_root):
    try:
        target_folder = Path(mid_root) / rel_folder
        target_folder.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file_path, target_folder / file_path.name)
    except: pass

# --- CẤU HÌNH OCR (Đồng bộ từ fix_errors.py) ---
OCRMYPDF_PATH = r"C:\Users\LENOVO\AppData\Roaming\Python\Python314\Scripts\ocrmypdf.exe"
TESSERACT_DIR = r"D:\Tesseract-OCR"
TESSDATA_DIR = r"D:\Tesseract-OCR\tessdata"
GS_BIN_DIR = r"D:\gs\gs10.07.0\bin"
GS_EXE = r"D:\gs\gs10.07.0\bin\gswin64c.exe"
# --- CẤU HÌNH POPPLER VÀ TESSERACT CHO FLOW MỚI ---
CRAWLER_DATA_DIR = Path(__file__).parent.parent.parent.parent / "legal-crawler"
PDFTOTEXT_PATH = str((CRAWLER_DATA_DIR / "poppler" / "poppler-24.08.0" / "Library" / "bin" / "pdftotext.exe").absolute())
POPPLER_BIN_DIR = CRAWLER_DATA_DIR / "poppler" / "poppler-24.08.0" / "Library" / "bin"
PDFSEPARATE_EXE = str((POPPLER_BIN_DIR / "pdfseparate.exe").absolute())
PDFTOPPM_EXE = str((POPPLER_BIN_DIR / "pdftoppm.exe").absolute())
PDFUNITE_EXE = str((POPPLER_BIN_DIR / "pdfunite.exe").absolute())
TESSERACT_EXE = r"D:\Tesseract-OCR\tesseract.exe"
if not os.path.exists(TESSERACT_EXE):
    TESSERACT_EXE = "tesseract"

os.environ["PATH"] = f"{TESSERACT_DIR};{GS_BIN_DIR};" + os.environ["PATH"]
os.environ["TESSDATA_PREFIX"] = TESSDATA_DIR

def run_ocr_pipeline(pdf_path, target_md_path):
    """Pipeline OCR khôi phục layout cho PDF quét"""
    print(f"    [*] Đang chạy OCR cho PDF ảnh: {pdf_path.name}...", flush=True)
    temp_dir = Path(tempfile.mkdtemp())
    try:
        flat_pdf = temp_dir / "flat.pdf"
        ocr_pdf = temp_dir / "ocred.pdf"

        def run_ocr(source_pdf):
            if ocr_pdf.exists():
                safe_remove(ocr_pdf)
            return subprocess.run([
                OCRMYPDF_PATH,
                "--language", "vie+eng",
                "--jobs", "1",
                "--force-ocr",
                "--invalidate-digital-signatures",
                "--optimize", "1",
                "--output-type", "pdf",
                str(source_pdf),
                str(ocr_pdf.absolute())
            ], capture_output=True, text=True, errors="replace", timeout=1200)

        # OCR trực tiếp trước. Bước flatten bằng Ghostscript có thể làm một số
        # PDF scan của VBPL xấu đi hoặc khiến ocrmypdf fail không cần thiết.
        res = run_ocr(pdf_path.absolute())

        if res.returncode != 0 or not ocr_pdf.exists():
            print(f"      [!] OCR trực tiếp lỗi, thử flatten: {res.stderr[-600:] if res.stderr else res.returncode}", flush=True)
            gs = subprocess.run([
                GS_EXE,
                "-sDEVICE=pdfwrite",
                "-dCompatibilityLevel=1.4",
                "-dNOPAUSE",
                "-dQUIET",
                "-dBATCH",
                f"-sOutputFile={str(flat_pdf.absolute())}",
                str(pdf_path.absolute())
            ], capture_output=True, text=True, errors="replace", timeout=120)
            if gs.returncode != 0 or not flat_pdf.exists():
                print(f"      [!] Ghostscript flatten lỗi: {gs.stderr[-600:] if gs.stderr else gs.returncode}", flush=True)
            else:
                res = run_ocr(flat_pdf.absolute())
        
        if not ocr_pdf.exists():
            print(f"      [!] OCR Thất bại: {pdf_path.name}. {res.stderr[-1000:] if res.stderr else ''}", flush=True)
            return False

        # Thay vì pdftotext (mất định dạng), ta trả về đường dẫn file PDF đã được OCR
        if target_md_path:
            shutil.copy2(str(ocr_pdf), target_md_path)
            return True
    except Exception as e:
        print(f"      [!] Lỗi OCR: {e}")
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
    return False

import win32com.client
import pythoncom
from bs4 import BeautifulSoup
from markdownify import markdownify as md

def read_word_html(html_path):
    """Read Word's filtered HTML with the charset it actually wrote.

    Word on Windows often emits Vietnamese HTML as Windows-1258/ANSI. Reading it
    as UTF-8 with errors='ignore' drops accented bytes, producing text like
    "CHNH PHỦ" instead of "CHÍNH PHỦ".
    """
    raw = Path(html_path).read_bytes()
    if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
        return raw.decode("utf-16")
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw.decode("utf-8-sig")

    head = raw[:4096].decode("ascii", errors="ignore")
    match = re.search(r"charset\s*=\s*['\"]?([\w\-]+)", head, flags=re.I)
    encodings = []
    if match:
        encodings.append(match.group(1))
    encodings.extend(["utf-8-sig", "utf-8", "cp1258", "windows-1258", "cp1252"])

    seen = set()
    for encoding in encodings:
        normalized = encoding.lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
        except LookupError:
            continue
    return raw.decode("utf-8", errors="replace")

def clean_markdown_text(text):
    """Reduce Word/markdownify artifacts while keeping legal document structure."""
    if not text:
        return ""

    def clean_inline(value):
        value = value.replace("**", "").replace("*", "")
        value = re.sub(r"\s+([,.;:])", r"\1", value)
        value = re.sub(r",(?=\S)", ", ", value)
        value = re.sub(r"(?<=[0-9])(?=[A-Za-zÀ-ỹĐđ])", " ", value)
        value = re.sub(r"(?i)điện(?=quốc)", "điện ", value)
        value = re.sub(r"(?i)hành(?=giao)", "hành ", value)
        value = re.sub(r"(?i)tại(?=điều)", "tại ", value)
        value = re.sub(r"(?i)sau(?=khi)", "sau ", value)
        return re.sub(r"\s{2,}", " ", value).strip()

    text = text.replace("\xa0", " ")
    text = re.sub(r"(?:\\_){3,}", "", text)
    text = re.sub(r"_{3,}", "", text)
    text = re.sub(r"[ \t]+", " ", text)

    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped == "#":
            continue
        lines.append(stripped)

    blocks = re.split(r"\n\s*\n", "\n".join(lines))
    cleaned_blocks = []
    for block in blocks:
        block_lines = [line.strip() for line in block.splitlines() if line.strip()]
        if not block_lines:
            continue

        if any(line.startswith("|") for line in block_lines):
            cleaned_blocks.append("\n".join(clean_inline(line) for line in block_lines))
            continue

        joined = " ".join(block_lines)
        # Word frequently splits bold/italic runs mid-word; plain text is better
        # than malformed Markdown such as "ưu đãi****," or "QH15**được".
        cleaned_blocks.append(clean_inline(joined))

    return "\n\n".join(cleaned_blocks).strip() + "\n"

def convert_document_to_md_native(input_path, target_md_path, word_app=None):
    """
    Dùng Microsoft Word (để đọc PDF/DOCX/DOC) -> Lưu HTML -> Dùng markdownify dịch sang MD
    Cách này KHÔNG cần cài Pandoc và giữ bảng biểu siêu chuẩn.
    """
    local_word = False
    word = word_app
    doc = None
    html_path = input_path.parent / f"{input_path.stem}_temp.html"
    if word is None:
        pythoncom.CoInitialize()
        try:
            word = win32com.client.DispatchEx("Word.Application")
            word.Visible = False
            word.DisplayAlerts = 0
            local_word = True
        except Exception as e:
            pythoncom.CoUninitialize()
            print(f"      [!] Lỗi khởi tạo Word: {e}")
            return False
            
    try:
        # Mở file (cho phép Word tự động reflow PDF nếu cần)
        doc = word.Documents.Open(FileName=str(input_path.absolute()), ConfirmConversions=False, ReadOnly=True)
        
        # Lưu ra dạng Web Page, Filtered (mã 10) để HTML siêu sạch
        doc.SaveAs2(FileName=str(html_path.absolute()), FileFormat=10)
        doc.Close(SaveChanges=0)
        
        # Dịch HTML sạch sang Markdown
        html_content = read_word_html(html_path)
            
        soup = BeautifulSoup(html_content, "html.parser")
        # Chuyển thành Markdown, giữ nguyên Bảng (pipe tables) và Header
        markdown_text = clean_markdown_text(md(str(soup), heading_style="ATX", strip=["img"]))
        
        # Lưu file MD cuối cùng
        with open(target_md_path, "w", encoding="utf-8") as f:
            f.write(markdown_text)
            
        return True
    except Exception as e:
        print(f"      [!] Lỗi chuyển đổi Word -> HTML -> MD: {e}")
        return False
    finally:
        try:
            if doc: 
                doc.Close(SaveChanges=0)
                del doc
        except: pass
        if local_word and word:
            try:
                word.Quit()
                del word
            except: pass
            pythoncom.CoUninitialize()
        if html_path.exists():
            safe_remove(html_path)

def convert_pdf_to_docx_via_word(pdf_path, docx_path, word_app=None):
    """Mở PDF bằng Word và lưu thành file .docx để giữ nguyên cấu trúc chữ/bảng biểu"""
    local_word = False
    word = word_app
    doc = None
    if word is None:
        pythoncom.CoInitialize()
        try:
            word = win32com.client.DispatchEx("Word.Application")
            word.Visible = False
            word.DisplayAlerts = 0
            local_word = True
        except Exception as e:
            pythoncom.CoUninitialize()
            print(f"      [!] Lỗi khởi tạo Word -> DOCX: {e}", flush=True)
            return False
            
    try:
        # Mở PDF (Word tự động reflow PDF)
        doc = word.Documents.Open(FileName=str(pdf_path.absolute()), ConfirmConversions=False, ReadOnly=True)
        
        # Lưu ra docx (FileFormat = 16)
        doc.SaveAs2(FileName=str(docx_path.absolute()), FileFormat=16)
        doc.Close(SaveChanges=0)
        return True
    except Exception as e:
        print(f"      [!] Lỗi Word -> DOCX: {e}", flush=True)
        return False
    finally:
        try:
            if doc: 
                doc.Close(SaveChanges=0)
                del doc
        except: pass
        if local_word and word:
            try:
                word.Quit()
                del word
            except: pass
            pythoncom.CoUninitialize()

def convert_pdf_to_md_new_flow(pdf_path, target_md_path):
    """
    Quy trình mới: PDF gốc -> pdftoppm (tách trực tiếp ra ảnh PNG từng trang) -> tesseract (OCR từng ảnh sang PDF searchable) -> Word (.docx từng trang) -> Word (.md từng trang) -> gộp .md
    """
    print(f"  [*] Khởi động quy trình chuyển đổi trang-trang tối ưu cho {pdf_path.name}...", flush=True)
    
    # Tạo thư mục tạm làm việc
    temp_dir = Path(tempfile.mkdtemp(prefix="pdf_page_flow_"))
    word_app = None
    try:
        # Khởi tạo một đối tượng Word dùng chung duy nhất để tối ưu bộ nhớ ảo
        pythoncom.CoInitialize()
        try:
            word_app = win32com.client.DispatchEx("Word.Application")
            word_app.Visible = False
            word_app.DisplayAlerts = 0
        except Exception as e:
            print(f"    [!] Không thể khởi động Microsoft Word: {e}", flush=True)
            return False

        images_dir = temp_dir / "images"
        ocr_dir = temp_dir / "ocr"
        docx_dir = temp_dir / "docx"
        md_dir = temp_dir / "md"
        
        images_dir.mkdir(parents=True, exist_ok=True)
        ocr_dir.mkdir(parents=True, exist_ok=True)
        docx_dir.mkdir(parents=True, exist_ok=True)
        md_dir.mkdir(parents=True, exist_ok=True)
        
        # 1. tách trực tiếp thành các file ảnh PNG: pdftoppm.exe -png -r 150 <input.pdf> <images_dir>/page
        print(f"    [1/4] Đang tách trực tiếp các trang PDF thành ảnh PNG bằng pdftoppm...", flush=True)
        ppm_cmd = [
            PDFTOPPM_EXE,
            "-png",
            "-r", "150",
            str(pdf_path.absolute()),
            str(images_dir / "page")
        ]
        res_ppm = subprocess.run(ppm_cmd, capture_output=True, text=True, errors="replace", timeout=300)
        if res_ppm.returncode != 0:
            print(f"      [!] Lỗi pdftoppm: {res_ppm.stderr}", flush=True)
            return False
            
        # Tìm danh sách ảnh PNG được tạo ra và sắp xếp theo thứ tự số trang
        png_files = sorted(
            [f for f in images_dir.glob("page-*.png") if f.is_file()],
            key=lambda x: int(re.search(r"page-(\d+)\.png", x.name).group(1))
        )
        
        if not png_files:
            print(f"      [!] Lỗi: Không tìm thấy file ảnh PNG nào được tạo ra.", flush=True)
            return False
            
        print(f"    -> Đã tách thành công {len(png_files)} trang ảnh PNG.", flush=True)
        
        md_page_files = []
        
        # Lặp qua từng trang ảnh để chạy OCR -> DOCX -> MD
        for idx, page_png in enumerate(png_files, 1):
            print(f"      [*] Đang xử lý trang {idx}/{len(png_files)}...", flush=True)
            
            # 2. OCR ảnh PNG sang PDF có chữ: tesseract.exe <page.png> <ocr_dir>/page-i-ocr -l vie+eng pdf
            ocr_prefix = ocr_dir / f"page-{idx}-ocr"
            tess_cmd = [
                TESSERACT_EXE,
                str(page_png.absolute()),
                str(ocr_prefix),
                "-l", "vie+eng",
                "pdf"
            ]
            
            tess_env = os.environ.copy()
            if "TESSDATA_PREFIX" not in tess_env:
                tess_env["TESSDATA_PREFIX"] = TESSDATA_DIR
                
            tess_success = False
            ocr_pdf = ocr_dir / f"page-{idx}-ocr.pdf"
            for attempt in range(1, 4):
                res_tess = subprocess.run(tess_cmd, env=tess_env, capture_output=True, text=True, errors="replace", timeout=120)
                if res_tess.returncode == 0 and ocr_pdf.exists():
                    tess_success = True
                    break
                else:
                    print(f"      [!] Tesseract trang {idx} thất bại lần {attempt} (code: {res_tess.returncode}). Đang thử lại...", flush=True)
                    time.sleep(2)
                    
            if not tess_success:
                print(f"      [!] Lỗi: Tesseract thất bại sau 3 lần thử ở trang {idx}. Stderr: {res_tess.stderr}", flush=True)
                return False
            
            # 3. dox: Chuyển page-i-ocr.pdf sang Word .docx
            page_docx = docx_dir / f"page-{idx}.docx"
            docx_success = False
            for attempt in range(1, 4):
                if convert_pdf_to_docx_via_word(ocr_pdf, page_docx, word_app=word_app) and page_docx.exists():
                    docx_success = True
                    break
                else:
                    print(f"      [!] Word -> DOCX trang {idx} thất bại lần {attempt}. Đang thử lại...", flush=True)
                    time.sleep(2)
                    
            if not docx_success:
                print(f"      [!] Lỗi: Không thể chuyển PDF trang {idx} sang DOCX sau 3 lần thử.", flush=True)
                return False
                
            # 4. md: Chuyển page-i.docx sang page-i.md
            page_md = md_dir / f"page-{idx}.md"
            md_success = False
            for attempt in range(1, 4):
                if convert_document_to_md_native(page_docx, page_md, word_app=word_app) and page_md.exists():
                    md_success = True
                    break
                else:
                    print(f"      [!] DOCX -> MD trang {idx} thất bại lần {attempt}. Đang thử lại...", flush=True)
                    time.sleep(2)
                    
            if not md_success:
                print(f"      [!] Lỗi: Không thể chuyển Word trang {idx} sang MD sau 3 lần thử.", flush=True)
                return False
                
            md_page_files.append(page_md)
            
        # 5. Gộp toàn bộ các file MD đơn lẻ thành file MD hoàn chỉnh
        print(f"    [4/4] Đang gộp {len(md_page_files)} trang Markdown...", flush=True)
        final_markdown_content = []
        for idx, page_md in enumerate(md_page_files, 1):
            if page_md.exists():
                content = page_md.read_text(encoding="utf-8").strip()
                if content:
                    final_markdown_content.append(content)
                    
        # Lưu file MD cuối cùng
        with open(target_md_path, "w", encoding="utf-8") as f:
            f.write("\n\n<!-- pagebreak -->\n\n".join(final_markdown_content) + "\n")
            
        print(f"  [SUCCESS] Đã hoàn tất và lưu tại: {target_md_path.name}", flush=True)
        return True
            
    except Exception as e:
        print(f"  [ERR] Lỗi hệ thống trong quy trình chuyển đổi: {e}", flush=True)
        return False
    finally:
        if word_app:
            try:
                word_app.Quit()
                del word_app
            except: pass
        pythoncom.CoUninitialize()
        shutil.rmtree(temp_dir, ignore_errors=True)

def process_file_logic(file_path, rel_folder, dst_md_root, dst_mid_root, force=False):
    # Bỏ qua file tạm hoặc file ẩn của Word (~$)
    if file_path.name.startswith("~$"): return
    if "_ocred" in file_path.stem.lower() or file_path.stem.lower().endswith("_temp"):
        return
    
    ext = file_path.suffix.lower()
    if ext not in [".doc", ".docx", ".pdf"]: return

    target_folder_md = Path(dst_md_root) / rel_folder
    target_md_path = target_folder_md / f"{file_path.stem}.md"
    
    # BỎ QUA NẾU ĐÃ CÓ MD (và file có dung lượng)
    if not force and target_md_path.exists() and target_md_path.stat().st_size > 500:
        return

    target_folder_md.mkdir(parents=True, exist_ok=True)

    try:
        if ext in [".doc", ".docx"]:
            save_to_mid(file_path, rel_folder, dst_mid_root)
            print(f"    -> Đang dịch {file_path.name} sang Markdown...", flush=True)
            if convert_document_to_md_native(file_path, target_md_path):
                print(f"  [FORMATTED OK] {file_path.name}", flush=True)
            else:
                print(f"  [FAIL] Không thể chuyển đổi {file_path.name}", flush=True)
                
        elif ext == ".pdf":
            save_to_mid(file_path, rel_folder, dst_mid_root)
            if convert_pdf_to_md_new_flow(file_path, target_md_path):
                print(f"  [FORMATTED OK] {file_path.name}", flush=True)
            else:
                print(f"  [FAIL] Không thể chuyển đổi PDF {file_path.name} bằng quy trình mới", flush=True)
                
    except Exception as e:
        print(f"  [ERR] {file_path.name}: {str(e)}", flush=True)

def folder_has_markdown(folder):
    return folder.exists() and any(p.suffix.lower() == ".md" and p.stat().st_size > 500 for p in folder.iterdir() if p.is_file())

def process_folder(folder_data):
    try:
        folder, dst_md_root, dst_mid_root, src_root, update_mode, force = folder_data
        rel_folder = folder.relative_to(src_root)
        
        meta_src = folder / "metadata.json"
        if meta_src.exists():
            target_mid_folder = Path(dst_mid_root) / rel_folder
            target_mid_folder.mkdir(parents=True, exist_ok=True)
            shutil.copy2(meta_src, target_mid_folder / "metadata.json")
            
            target_md_folder = Path(dst_md_root) / rel_folder
            target_md_folder.mkdir(parents=True, exist_ok=True)
            shutil.copy2(meta_src, target_md_folder / "metadata.json")

        if update_mode and not force and folder_has_markdown(Path(dst_md_root) / rel_folder):
            return

        for current_path in folder.iterdir():
            if current_path.is_dir(): continue
            
            ext = current_path.suffix.lower()
            
            # XỬ LÝ FILE NÉN
            if ext in [".zip", ".rar", ".7z"]:
                with tempfile.TemporaryDirectory() as tmp_dir:
                    try:
                        shutil.unpack_archive(str(current_path), tmp_dir)
                        for p in Path(tmp_dir).rglob("*"):
                            if p.is_file():
                                process_file_logic(p, rel_folder, dst_md_root, dst_mid_root, force)
                    except: pass
            else:
                process_file_logic(current_path, rel_folder, dst_md_root, dst_mid_root, force)
    except Exception: pass

def start_conversion():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default='newvbpl_data')
    parser.add_argument('--target', help='Loại văn bản cụ thể (ví dụ: "Văn bản mới")')
    parser.add_argument('--update', action='store_true', help='Chỉ chuyển đổi các thư mục chưa có Markdown hợp lệ')
    parser.add_argument('--force', action='store_true', help='Chuyển đổi lại cả khi Markdown đã tồn tại')
    args = parser.parse_args()

    src_root, dst_md, dst_mid = Path(args.input), Path("vbplmd"), Path("vbplmid")
    
    if args.target:
        targets = [args.target]
    else:
        # Tự động ưu tiên "van_ban_moi" nếu tồn tại trong thư mục đầu vào
        if (src_root / "van_ban_moi").exists():
            print("--- Phát hiện thư mục 'van_ban_moi', ưu tiên xử lý mục này ---")
            targets = ["van_ban_moi"]
        else:
            targets = ["Thông tư", "Thông tư liên tịch", "Nghị định"]
    
    tasks = []
    print(f"--- Đang bắt đầu chuyển đổi cho: {targets} ---", flush=True)
    for cat in targets:
        cat_path = src_root / cat
        if cat_path.exists():
            # Check if cat_path directly contains document files
            files = [p for p in cat_path.iterdir() if p.is_file() and p.suffix.lower() in [".pdf", ".doc", ".docx"]]
            if files:
                rel_folder = cat_path.relative_to(src_root)
                if args.update and folder_has_markdown(dst_md / rel_folder):
                    continue
                tasks.append((cat_path, dst_md, dst_mid, src_root, args.update, args.force))
            else:
                # Sắp xếp ngược để xử lý các văn bản mới nhất trước
                folders = sorted([f for f in cat_path.iterdir() if f.is_dir()], reverse=True)
                for f in folders:
                    rel_folder = f.relative_to(src_root)
                    if args.update and folder_has_markdown(dst_md / rel_folder):
                        continue
                    tasks.append((f, dst_md, dst_mid, src_root, args.update, args.force))

    print(f"Tổng số thư mục cần quét: {len(tasks)}", flush=True)
    
    done = 0
    max_workers = 1 if args.update or args.force else 8
    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        for _ in executor.map(process_folder, tasks):
            done += 1
            if done % 10 == 0 or done == len(tasks):
                print(f"  [Tiến độ] Đã quét {done}/{len(tasks)} thư mục...", flush=True)

if __name__ == "__main__":
    start_conversion()
