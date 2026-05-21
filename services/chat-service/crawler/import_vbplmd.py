import os
import json
import sys
import uuid
import shutil
from pathlib import Path
from datetime import datetime
import psycopg2
from psycopg2.extras import execute_values

from md_utils import pick_primary_md

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

DB_CONFIG = {
    'host': 'localhost',
    'port': 5433,
    'user': 'postgres',
    'password': '123456',
    'dbname': 'legal_ai'
}

def parse_date(date_str):
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str.strip(), '%d/%m/%Y').date()
    except ValueError:
        try:
            return datetime.strptime(date_str.strip(), '%Y-%m-%d').date()
        except ValueError:
            return None

def detect_real_category(doc_dir, meta):
    folder_name = doc_dir.name.lower()
    title = meta.get("title", "").lower() if meta.get("title") else ""
    doc_num = meta.get("document_number", "").lower() if meta.get("document_number") else ""
    
    # 1. Kiểm tra Văn bản hợp nhất
    if "vbhn" in folder_name or "vbhn" in doc_num or "hợp nhất" in title or "hop nhat" in folder_name:
        return "Văn bản hợp nhất"
    
    # 2. Kiểm tra Hiến pháp
    if "hiến pháp" in title or "hien phap" in folder_name:
        return "Hiến pháp"
        
    # 3. Kiểm tra Bộ luật
    if "bộ luật" in title or "bo luat" in folder_name:
        return "Bộ luật"
        
    # 4. Kiểm tra Nghị định
    if "nghị định" in title or "nghi dinh" in folder_name or "nđ-cp" in doc_num or "nd-cp" in folder_name:
        return "Nghị định"
        
    # 5. Kiểm tra Thông tư liên tịch
    if "thông tư liên tịch" in title or "thong tu lien tich" in folder_name:
        return "Thông tư liên tịch"
        
    # 6. Kiểm tra Thông tư
    if "thông tư" in title or "thong tu" in folder_name or "tt-" in doc_num:
        return "Thông tư"
        
    # 7. Kiểm tra Nghị quyết liên tịch
    if "nghị quyết liên tịch" in title or "nghi quyet lien tich" in folder_name:
        return "Nghị quyết liên tịch"
        
    # 8. Kiểm tra Nghị quyết
    if "nghị quyết" in title or "nghi quyet" in folder_name or "nq-" in doc_num:
        return "Nghị quyết"
        
    # 9. Kiểm tra Lệnh
    if "lệnh" in title or "lenh" in folder_name or "l-" in doc_num:
        return "Lệnh"
        
    # 10. Kiểm tra Pháp lệnh
    if "pháp lệnh" in title or "phap lenh" in folder_name or "pl-" in doc_num:
        return "Pháp lệnh"
        
    # 11. Kiểm tra Quyết định
    if "quyết định" in title or "quyet dinh" in folder_name or "qd-" in doc_num or "qđ-" in doc_num:
        return "Quyết định"
        
    # 12. Kiểm tra Luật
    if "luật" in title or "luat" in folder_name or "luật" in doc_num:
        return "Luật"
        
    return "Văn bản khác"

def move_doc_dirs_out_of_van_ban_moi(batch_dirs):
    for doc_dir in batch_dirs:
        try:
            doc_dir = Path(doc_dir)
            if doc_dir.parent.name != "van_ban_moi":
                continue
            
            meta = {}
            meta_path = doc_dir / "metadata.json"
            if meta_path.exists():
                try:
                    with open(meta_path, 'r', encoding='utf-8') as f:
                        meta = json.load(f)
                except Exception:
                    pass
                    
            category = detect_real_category(doc_dir, meta)
            
            dest_parent = doc_dir.parent.parent / category
            dest_parent.mkdir(parents=True, exist_ok=True)
            dest_dir = dest_parent / doc_dir.name
            
            if dest_dir.exists():
                shutil.rmtree(dest_dir)
                
            shutil.move(str(doc_dir), str(dest_dir))
            print(f"  [MOVED] {doc_dir.name} (from van_ban_moi/) -> {category}/")
        except Exception as e:
            print(f"  [ERROR] Failed to move {doc_dir.name} out of van_ban_moi: {e}")


def import_documents(data_dir="vbplmd"):
    print(f"Connecting to Postgres at {DB_CONFIG['host']}:{DB_CONFIG['port']}...")
    try:
        conn = psycopg2.connect(**DB_CONFIG)
    except Exception as e:
        print(f"[ERROR] Connection failed: {e}")
        return

    cursor = conn.cursor()
    
    update_mode = "--update" in sys.argv
    
    # Xoá dữ liệu cũ nếu không phải chế độ update
    if not update_mode:
        print("Clearing LegalDocuments table...")
        try:
            cursor.execute('TRUNCATE TABLE "LegalDocuments" RESTART IDENTITY CASCADE;')
            conn.commit()
            print("Tbl LegalDocuments truncated.")
        except Exception as e:
            print(f"Truncate failed, maybe error: {e}")
            conn.rollback()
    else:
        print("Incremental mode: skipping truncation.")
    
    docs_batch = []
    batch_dirs = []
    base_dir = Path(data_dir)
    count = 0
    total = 0

    if not base_dir.exists():
        print(f"[ERROR] Thư mục {base_dir} không tồn tại!")
        return

    print(f"Scanning documentation from {base_dir}...")
    
    # Hàm hỗ trợ xử lý một thư mục văn bản
    def process_single_doc_dir(doc_dir, doc_type):
        meta_path = doc_dir / "metadata.json"
        if not meta_path.exists(): return None
        
        try:
            with open(meta_path, 'r', encoding='utf-8') as f:
                meta = json.load(f)
            
            # Extract documentId
            doc_id = meta.get('document_number', doc_dir.name)
            url = meta.get('url', '')
            if 'ItemID=' in url:
                doc_id = url.split('ItemID=')[-1].split('&')[0]
                
            md_file = pick_primary_md(doc_dir)
            if not md_file: return None
            with open(md_file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            content = content.replace('\x00', '').strip()
            now = datetime.now()
            
            return (
                doc_id[:255] if doc_id else str(uuid.uuid4())[:255],
                meta.get('title', '')[:500] if meta.get('title') else 'No title',
                meta.get('document_number', '')[:255],
                doc_type[:255],
                meta.get('status', '')[:255],
                content,
                'Legal',
                meta.get('issuing_agency', '')[:255],
                parse_date(meta.get('issued_date', '')),
                parse_date(meta.get('effective_date', '')),
                now,
                now
            )
        except Exception: return None

    # Kiểm tra xem base_dir có phải là thư mục chứa trực tiếp các văn bản không
    # (Ví dụ: vbplmd/Văn bản mới/Doc1, Doc2...)
    is_direct_docs = any((p / "metadata.json").exists() for p in base_dir.iterdir() if p.is_dir())
    
    if is_direct_docs:
        # Nếu là category folder trực tiếp
        doc_type = base_dir.name
        for doc_dir in base_dir.iterdir():
            if not doc_dir.is_dir(): continue
            doc_data = process_single_doc_dir(doc_dir, doc_type)
            if doc_data:
                docs_batch.append(doc_data)
                batch_dirs.append(doc_dir)
                count += 1
                total += 1
                if count >= 200:
                    insert_query = f"""
                        INSERT INTO "LegalDocuments" 
                        ("documentId", "title", "documentNumber", "documentType", "status", "content", "field", "issuingAuthority", "issueDate", "effectiveDate", created_at, updated_at)
                        VALUES %s
                        ON CONFLICT ("documentId") DO UPDATE SET
                            "title" = EXCLUDED."title",
                            "documentNumber" = EXCLUDED."documentNumber",
                            "documentType" = EXCLUDED."documentType",
                            "status" = EXCLUDED."status",
                            "content" = EXCLUDED."content",
                            "field" = EXCLUDED."field",
                            "issuingAuthority" = EXCLUDED."issuingAuthority",
                            "issueDate" = EXCLUDED."issueDate",
                            "effectiveDate" = EXCLUDED."effectiveDate",
                            updated_at = EXCLUDED.updated_at
                    """
                    execute_values(cursor, insert_query, docs_batch)
                    conn.commit()
                    print(f"  Inserted {total} documents...")
                    move_doc_dirs_out_of_van_ban_moi(batch_dirs)
                    docs_batch.clear()
                    batch_dirs.clear()
                    count = 0
    else:
        # Nếu là root folder chứa các category (Cấu trúc cũ)
        for doc_type_dir in base_dir.iterdir():
            if not doc_type_dir.is_dir(): continue
            doc_type = doc_type_dir.name
            for doc_dir in doc_type_dir.iterdir():
                if not doc_dir.is_dir(): continue
                doc_data = process_single_doc_dir(doc_dir, doc_type)
                if doc_data:
                    docs_batch.append(doc_data)
                    batch_dirs.append(doc_dir)
                    count += 1
                    total += 1
                    if count >= 200:
                        pass
            
            if count >= 200:
                insert_query = f"""
                    INSERT INTO "LegalDocuments" 
                    ("documentId", "title", "documentNumber", "documentType", "status", "content", "field", "issuingAuthority", "issueDate", "effectiveDate", created_at, updated_at)
                    VALUES %s
                    ON CONFLICT ("documentId") DO UPDATE SET
                        "title" = EXCLUDED."title",
                        "documentNumber" = EXCLUDED."documentNumber",
                        "documentType" = EXCLUDED."documentType",
                        "status" = EXCLUDED."status",
                        "content" = EXCLUDED."content",
                        "field" = EXCLUDED."field",
                        "issuingAuthority" = EXCLUDED."issuingAuthority",
                        "issueDate" = EXCLUDED."issueDate",
                        "effectiveDate" = EXCLUDED."effectiveDate",
                        updated_at = EXCLUDED.updated_at
                """
                execute_values(cursor, insert_query, docs_batch)
                conn.commit()
                print(f"  Inserted {total} documents...")
                move_doc_dirs_out_of_van_ban_moi(batch_dirs)
                docs_batch.clear()
                batch_dirs.clear()
                count = 0

    if docs_batch:
        insert_query = f"""
            INSERT INTO "LegalDocuments" 
            ("documentId", "title", "documentNumber", "documentType", "status", "content", "field", "issuingAuthority", "issueDate", "effectiveDate", created_at, updated_at)
            VALUES %s
            ON CONFLICT ("documentId") DO UPDATE SET
                "title" = EXCLUDED."title",
                "documentNumber" = EXCLUDED."documentNumber",
                "documentType" = EXCLUDED."documentType",
                "status" = EXCLUDED."status",
                "content" = EXCLUDED."content",
                "field" = EXCLUDED."field",
                "issuingAuthority" = EXCLUDED."issuingAuthority",
                "issueDate" = EXCLUDED."issueDate",
                "effectiveDate" = EXCLUDED."effectiveDate",
                updated_at = EXCLUDED.updated_at
        """
        execute_values(cursor, insert_query, docs_batch)
        conn.commit()
        move_doc_dirs_out_of_van_ban_moi(batch_dirs)

    print(f"HOAN TAT! Tong cong da insert {total} full documents vao bang LegalDocuments.")
    cursor.close()
    conn.close()

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--update', action='store_true', help='Incremental mode')
    parser.add_argument('--target', help='Specific folder inside vbplmd to import')
    args = parser.parse_args()
    
    path = "vbplmd"
    target = args.target
    if not target and args.update:
        if (Path("vbplmd") / "van_ban_moi").exists():
            target = "van_ban_moi"
            print(f"--- Tự động chọn mục tiêu import: {target} ---")
            
    if target:
        path = os.path.join("vbplmd", target)
        
    import_documents(data_dir=path)
