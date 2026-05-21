import os
import re
import json
import sys
from pathlib import Path

from md_utils import pick_primary_md

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

# --- CẤU HÌNH ---
SOURCE_ROOT = Path("vbplmd")
OUTPUT_ROOT = Path("vbpl_articles")

def split_articles(md_content):
    """Tách văn bản thành danh sách các Điều, xử lý thặng dư Chương/Mục"""
    # Regex linh hoạt hơn: chấp nhận có hoặc không có khoảng trắng sau Điều/Chương/Mục (e.g. Điều 210 hoặc Điều210)
    pattern = r'(?m)^((?:\*|_|#|\s)*(?:Điều|CHƯƠNG|MỤC|PHẦN)\s*[IVXLCDM\d]+.*)$'
    
    matches = list(re.finditer(pattern, md_content, re.IGNORECASE))
    
    articles = []
    if not matches:
        return [{"title": "Toàn văn", "content": md_content}]

    prefix_buffer = "" # Dùng để chứa các tiêu đề Chương, Mục... chờ ghép vào Điều kế tiếp

    for i in range(len(matches)):
        start = matches[i].start()
        end = matches[i+1].start() if i + 1 < len(matches) else len(md_content)
        
        full_line = matches[i].group(0)
        header_text = full_line.upper()
        content_chunk = md_content[start:end].strip()

        if "ĐIỀU" in header_text:
            # Nếu là Điều, lấy tiêu đề ngắn làm tên file
            # Hỗ trợ cả Điều 1 và Điều1
            match_short = re.search(r'Điều\s*(\d+)', full_line, re.I)
            short_title = f"Điều {match_short.group(1)}" if match_short else "Điều_" + str(i+1)
            
            # Ghép phần Chương/Mục ở trên (nếu có) vào đầu Điều này
            final_content = (prefix_buffer + "\n\n" + content_chunk).strip()
            
            articles.append({
                "title": short_title,
                "full_title": full_line.strip().replace("*", "").replace("#", ""),
                "content": final_content
            })
            prefix_buffer = "" # Reset buffer sau khi đã lắp vào Điều
        else:
            # Nếu là Chương, Mục, Phần... thì tích lũy vào buffer
            prefix_buffer += "\n\n" + content_chunk

    # Trường hợp cuối cùng nếu buffer vẫn còn (hiếm gặp trong VBPL)
    if prefix_buffer and articles:
        articles[-1]["content"] += "\n\n" + prefix_buffer.strip()

    return articles

def process_all(update_mode=False):
    # XÓA THƯ MỤC CŨ để tránh lẫn lộn file cũ/mới (trừ khi đang ở dạng update)
    if not update_mode and OUTPUT_ROOT.exists():
        print(f"Đang dọn dẹp thư mục {OUTPUT_ROOT}...")
        import shutil
        shutil.rmtree(OUTPUT_ROOT)
    
    OUTPUT_ROOT.mkdir(parents=True)

    # Quét tất cả thư mục trong vbplmd
    all_folders = [p for p in SOURCE_ROOT.glob("*/*") if p.is_dir()]
    total = len(all_folders)
    
    print(f"Bắt đầu tách Điều cho {total} văn bản...")

    for idx, folder in enumerate(all_folders):
        try:
            rel_path = folder.relative_to(SOURCE_ROOT)
            
            # Tạo thư mục đầu ra
            target_dir = OUTPUT_ROOT / rel_path
            
            # Nếu đang trong chế độ update và thư mục đã có file MD => Bỏ qua
            if update_mode and target_dir.exists() and any(target_dir.glob("*.md")):
                continue
            
            # Tìm file metadata.json
            meta_path = folder / "metadata.json"
            metadata = {}
            if meta_path.exists():
                with open(meta_path, "r", encoding="utf-8") as f:
                    metadata = json.load(f)
            
            source_link = metadata.get("url", "N/A")
            doc_id = metadata.get("document_number", folder.name)

            md_path = pick_primary_md(folder)
            if not md_path:
                continue
            with open(md_path, "r", encoding="utf-8") as f:
                content = f.read()

            # Tách điều
            articles = split_articles(content)
            
            target_dir.mkdir(parents=True, exist_ok=True)

            # Lưu từng điều
            for art in articles:
                # Làm sạch tên file (Điều 1.md)
                # Giới hạn độ dài tên file để tránh lỗi Windows Path quá dài
                safe_title = re.sub(r'[\\/*?:"<>|]', "_", art["title"])
                if len(safe_title) > 50:
                    safe_title = safe_title[:50]
                
                file_name = f"{safe_title}.md"
                
                output_content = f"--- METADATA ---\n"
                output_content += f"Văn bản: {doc_id}\n"
                output_content += f"Link gốc: {source_link}\n"
                output_content += f"----------------\n\n"
                output_content += art["content"]
                
                with open(target_dir / file_name, "w", encoding="utf-8") as f:
                    f.write(output_content)

            # Lưu lại file metadata gốc vào thư mục mới
            with open(target_dir / "metadata.json", "w", encoding="utf-8") as f:
                json.dump(metadata, f, ensure_ascii=False, indent=2)

            print(f"[{idx+1}/{total}] [OK] {doc_id} -> {len(articles)} Điều")

        except Exception as e:
            print(f"[{idx+1}/{total}] [LỖI] {folder.name}: {str(e)}")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--update', action='store_true', help='Chế độ update: Không xóa thư mục cũ, bỏ qua các file đã xử lý')
    parser.add_argument('--target', help='Loại văn bản cụ thể để tách (ví dụ: "Văn bản mới")')
    args = parser.parse_args()
    
    target = args.target
    if not target:
        # Tự động tìm "van_ban_moi" trong vbplmd
        if (Path("vbplmd") / "van_ban_moi").exists():
            target = "van_ban_moi"
            print(f"--- Tự động chọn mục tiêu: {target} ---")
            
    if target:
        # Nếu có target (truyền vào hoặc tự tìm), chỉ quét trong thư mục đó và giữ nguyên cấu trúc thư mục đầu ra
        src_dir = Path("vbplmd") / target
        if not src_dir.exists():
            print(f"Không tìm thấy thư mục: {src_dir}")
            sys.exit(0)
            
        # Điều chỉnh OUTPUT_ROOT để nhét vào đúng thư mục con
        OUTPUT_ROOT = Path("vbpl_articles") / target
        
        # Quét tất cả thư mục con bên trong target
        all_folders = [p for p in src_dir.iterdir() if p.is_dir()]
        total = len(all_folders)
        print(f"Bắt đầu tách Điều cho {total} văn bản trong mục {args.target}...")
        
        # Gọi hàm xử lý với danh sách folder đã lọc
        # Ta cần modify nhẹ hàm process_all hoặc copy logic
        for idx, folder in enumerate(all_folders):
            try:
                # Tìm file metadata.json
                meta_path = folder / "metadata.json"
                metadata = {}
                if meta_path.exists():
                    with open(meta_path, "r", encoding="utf-8") as f:
                        metadata = json.load(f)
                
                source_link = metadata.get("url", "N/A")
                doc_id = metadata.get("document_number", folder.name)

                # Tìm file .md
                md_files = list(folder.glob("*.md"))
                if not md_files: continue
                
                md_path = md_files[0]
                with open(md_path, "r", encoding="utf-8") as f:
                    content = f.read()

                articles = split_articles(content)
                target_dir = OUTPUT_ROOT / folder.name
                target_dir.mkdir(parents=True, exist_ok=True)

                for art in articles:
                    safe_title = re.sub(r'[\\/*?:"<>|]', "_", art["title"])
                    if len(safe_title) > 50: safe_title = safe_title[:50]
                    
                    file_name = f"{safe_title}.md"
                    output_content = f"--- METADATA ---\nVăn bản: {doc_id}\nLink gốc: {source_link}\n----------------\n\n{art['content']}"
                    with open(target_dir / file_name, "w", encoding="utf-8") as f:
                        f.write(output_content)

                with open(target_dir / "metadata.json", "w", encoding="utf-8") as f:
                    json.dump(metadata, f, ensure_ascii=False, indent=2)

                print(f"[{idx+1}/{total}] [OK] {doc_id} -> {len(articles)} Điều")
            except Exception as e:
                print(f"[{idx+1}/{total}] [LỖI] {folder.name}: {str(e)}")
    else:
        process_all(update_mode=args.update)
