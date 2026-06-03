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
PDFINFO_EXE = str((POPPLER_BIN_DIR / "pdfinfo.exe").absolute())

# PDF → MD: ưu tiên text-layer, OCR scan ở DPI cao khi thiếu text
PDF_OCR_DPI = 300
PDF_TEXT_MIN_CHARS_PER_PAGE = 120

os.environ["PATH"] = f"{TESSERACT_DIR};{GS_BIN_DIR};" + os.environ["PATH"]
os.environ["TESSDATA_PREFIX"] = TESSDATA_DIR

# Sửa lỗi OCR phổ biến (chỉ thay chuỗi rõ ràng, tránh đụng số hiệu văn bản)
_OCR_TYPO_FIXES = [
    (r"\bquy\s+dịnh\b", "quy định"),
    (r"\bdân\s+chiếu\b", "dẫn chiếu"),
    (r"\bdẫn\s+chiếu\b", "dẫn chiếu"),
    (r"\bTồng\s+cục\b", "Tổng cục"),
    (r"\bTông\s+Tham\b", "Tổng Tham"),
    (r"\bBộ\s+Tông\b", "Bộ Tổng"),
    (r"\bBO\s+TRUONG\b", "BỘ TRƯỞNG"),
    (r"\bDai\s+tướng\b", "Đại tướng"),
    (r"\btai\s+bồ\b", "tái bổ"),
    (r"\btái\s+bồ\b", "tái bổ"),
    (r"\btai\s+bô\b", "tái bổ"),
    (r"\btái\s+bô\b", "tái bổ"),
    (r"\bnêu\s+chính\b", "nêu chính"),
    (r"\bchê\s+độ\b", "chế độ"),
    (r"\bchê\s+đôi\b", "chế độ"),
    (r"\bthập\s+hơn\b", "thấp hơn"),
    (r"\bQuôc\s+phòng\b", "Quốc phòng"),
    (r"\bT\s+hông\s+tư\b", "Thông tư"),
    (r"\bsửa\s+đồi\b", "sửa đổi"),
    (r"\bbồ\s+sung\b", "bổ sung"),
    (r"\bthay\s+thê\b", "thay thế"),
    (r"\bbăng\b", "bằng"),
    (r"\bNghị\s+định\s+sô\b", "Nghị định số"),
    (r"\bNghị\s+định\s+so\b", "Nghị định số"),
]


def fix_common_ocr_errors(text):
    if not text:
        return ""
    for pattern, replacement in _OCR_TYPO_FIXES:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text


def get_pdf_page_count(pdf_path):
    if not os.path.exists(PDFINFO_EXE):
        return None
    try:
        res = subprocess.run(
            [PDFINFO_EXE, str(pdf_path.absolute())],
            capture_output=True, text=True, errors="replace", timeout=30,
        )
        if res.returncode != 0:
            return None
        m = re.search(r"Pages:\s+(\d+)", res.stdout or "")
        return int(m.group(1)) if m else None
    except Exception:
        return None


def extract_pdf_page_text(pdf_path, page_num):
    """Lấy text-layer một trang bằng pdftotext -layout."""
    if not os.path.exists(PDFTOTEXT_PATH):
        return ""
    try:
        res = subprocess.run(
            [
                PDFTOTEXT_PATH, "-layout", "-enc", "UTF-8",
                "-f", str(page_num), "-l", str(page_num),
                str(pdf_path.absolute()), "-",
            ],
            capture_output=True, text=True, errors="replace", timeout=60,
        )
        if res.returncode != 0:
            return ""
        return (res.stdout or "").strip()
    except Exception:
        return ""


def text_layer_page_is_usable(text):
    """Đủ text thật để tin cậy (tránh chỉ lấy header/footer của PDF scan)."""
    stripped = (text or "").strip()
    if len(stripped) < PDF_TEXT_MIN_CHARS_PER_PAGE:
        return False
    long_lines = [ln for ln in stripped.splitlines() if len(ln.strip()) > 55]
    if len(long_lines) >= 2:
        return True
    if len(stripped) >= 500 and re.search(r"[À-ỹĐđ]", stripped):
        return True
    if re.search(r"\b(Điều|Nghị định|quy định|Thông tư|Chương|Mục)\b", stripped, re.IGNORECASE):
        return len(stripped) >= 220
    return False


def promote_legal_headings(text):
    """Giữ cấu trúc Điều/Chương/Mục cho bước split_by_articles."""
    lines = []
    for line in text.splitlines():
        s = line.strip()
        if not s:
            lines.append("")
            continue
        if re.match(r"^(Điều|CHƯƠNG|MỤC|PHẦN)\s+", s, re.IGNORECASE):
            lines.append(f"## {s}")
        else:
            lines.append(s)
    return "\n".join(lines)

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

def ocr_page_image(page_png, ocr_dir, page_idx, tess_env):
    """OCR một trang ảnh với cấu hình tối ưu cho văn bản pháp luật."""
    ocr_prefix = ocr_dir / f"page-{page_idx}-ocr"
    ocr_txt_file = ocr_dir / f"page-{page_idx}-ocr.txt"
    tess_cmd = [
        TESSERACT_EXE,
        str(page_png.absolute()),
        str(ocr_prefix),
        "-l", "vie+eng",
        "--oem", "1",
        "--psm", "4",
        "-c", "preserve_interword_spaces=1",
        "txt",
    ]
    for attempt in range(1, 4):
        res_tess = subprocess.run(
            tess_cmd, env=tess_env, capture_output=True, text=True, errors="replace", timeout=180,
        )
        if res_tess.returncode == 0 and ocr_txt_file.exists():
            return ocr_txt_file.read_text(encoding="utf-8").strip()
        print(f"      [!] Tesseract trang {page_idx} thất bại lần {attempt}. Đang thử lại...", flush=True)
        time.sleep(2)
    return ""


def convert_pdf_to_md_new_flow(pdf_path, target_md_path):
    """
    Hybrid PDF → MD:
    1) Thử text-layer (pdftotext) từng trang — chuẩn nhất cho PDF có text thật.
    2) Trang thiếu text → OCR 300 DPI grayscale + Tesseract PSM4.
    3) Sửa lỗi OCR phổ biến + giữ cấu trúc Điều/Chương.
    """
    print(f"  [*] PDF → MD (hybrid): {pdf_path.name}...", flush=True)
    temp_dir = Path(tempfile.mkdtemp(prefix="pdf_md_hybrid_"))
    try:
        page_count = get_pdf_page_count(pdf_path)
        images_dir = temp_dir / "images"
        ocr_dir = temp_dir / "ocr"
        images_dir.mkdir(parents=True, exist_ok=True)
        ocr_dir.mkdir(parents=True, exist_ok=True)

        ppm_cmd = [
            PDFTOPPM_EXE, "-png", "-gray", "-r", str(PDF_OCR_DPI),
            str(pdf_path.absolute()), str(images_dir / "page"),
        ]
        res_ppm = subprocess.run(ppm_cmd, capture_output=True, text=True, errors="replace", timeout=600)
        if res_ppm.returncode != 0:
            print(f"      [!] Lỗi pdftoppm: {res_ppm.stderr[-400:] if res_ppm.stderr else res_ppm.returncode}", flush=True)
            return False

        png_files = sorted(
            [f for f in images_dir.glob("page-*.png") if f.is_file()],
            key=lambda x: int(re.search(r"page-(\d+)\.png", x.name).group(1)),
        )
        if not png_files:
            print("      [!] Không tách được trang ảnh từ PDF.", flush=True)
            return False

        num_pages = page_count or len(png_files)
        print(f"    -> {num_pages} trang | DPI {PDF_OCR_DPI} | hybrid text-layer + OCR", flush=True)

        tess_env = os.environ.copy()
        tess_env["TESSDATA_PREFIX"] = TESSDATA_DIR

        md_page_contents = []
        text_pages = 0
        ocr_pages = 0

        for idx, page_png in enumerate(png_files, 1):
            page_text = extract_pdf_page_text(pdf_path, idx)
            if text_layer_page_is_usable(page_text):
                text_pages += 1
                print(f"    [trang {idx}/{len(png_files)}] text-layer ({len(page_text)} ký tự)", flush=True)
                body = page_text
            else:
                ocr_pages += 1
                print(f"    [trang {idx}/{len(png_files)}] OCR scan...", flush=True)
                body = ocr_page_image(page_png, ocr_dir, idx, tess_env)
                if not body.strip():
                    print(f"      [!] Trang {idx} không lấy được nội dung.", flush=True)
                    return False

            body = fix_common_ocr_errors(body)
            body = clean_markdown_text(body)
            body = promote_legal_headings(body)
            md_page_contents.append(body)

        final_content = "\n\n<!-- pagebreak -->\n\n".join(md_page_contents) + "\n"
        with open(target_md_path, "w", encoding="utf-8") as f:
            f.write(final_content)

        print(
            f"  [SUCCESS] {target_md_path.name} | text-layer: {text_pages} trang, OCR: {ocr_pages} trang",
            flush=True,
        )
        return True
    except Exception as e:
        print(f"  [ERR] PDF hybrid: {e}", flush=True)
        return False
    finally:
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
