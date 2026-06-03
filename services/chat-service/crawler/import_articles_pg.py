import os
import json
import sys
import re
from pathlib import Path
from datetime import datetime
import psycopg2
from psycopg2.extras import execute_values

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

def import_articles(data_dir="vbpl_articles"):
    print(f"Connecting to Postgres at {DB_CONFIG['host']}:{DB_CONFIG['port']}...")
    try:
        conn = psycopg2.connect(**DB_CONFIG)
    except Exception as e:
        print(f"[ERROR] Connection failed: {e}")
        return

    cursor = conn.cursor()
    
    # Create table (if not exists)
    print("Ensuring table vbpl_articles_data exists...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS vbpl_articles_data (
            id SERIAL PRIMARY KEY,
            documentId VARCHAR(255),
            title VARCHAR(500),
            documentNumber VARCHAR(255),
            documentType VARCHAR(255),
            Status VARCHAR(255),
            "issue date" DATE,
            "effective date" DATE,
            content TEXT,
            link TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_title_unique ON vbpl_articles_data(documentId, title);
        CREATE INDEX IF NOT EXISTS idx_doc_id ON vbpl_articles_data(documentId);
    """)
    
    update_mode = "--update" in sys.argv
    if not update_mode:
        print("Clearing old data (Full Import mode)...")
        cursor.execute("TRUNCATE TABLE vbpl_articles_data RESTART IDENTITY;")
    else:
        print("Incremental mode: skipping existing articles.")
    
    conn.commit()
    
    articles_batch = []
    base_dir = Path(data_dir)
    count = 0
    total = 0
    imported_doc_ids = set()

    if not base_dir.exists():
        print(f"[ERROR] Thư mục {base_dir} không tồn tại!")
        return

    print(f"Scanning documents from {base_dir}...")
    
    def process_doc_dir_articles(doc_dir, doc_type):
        meta_path = doc_dir / "metadata.json"
        if not meta_path.exists(): return []
        
        try:
            with open(meta_path, 'r', encoding='utf-8') as f:
                meta = json.load(f)
            
            doc_id = meta.get('document_number', doc_dir.name)
            url = meta.get('url', '')
            if 'ItemID=' in url:
                doc_id = url.split('ItemID=')[-1].split('&')[0]
            if doc_id:
                imported_doc_ids.add(str(doc_id).strip())
                
            # Tự động nhận diện loại văn bản thật (documentType) thay vì lấy mặc định "van_ban_moi"
            try:
                from import_vbplmd import detect_real_category
                real_doc_type = detect_real_category(doc_dir, meta)
            except Exception:
                real_doc_type = doc_type

            local_batch = []
            for md_file in doc_dir.glob("*.md"):
                try:
                    with open(md_file, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    title = md_file.stem
                    content = re.sub(r'--- METADATA ---.*?----------------\n+', '', content, flags=re.DOTALL)
                    content = content.replace('\x00', '').strip()
                    
                    local_batch.append((
                        doc_id, title, meta.get('document_number', ''), real_doc_type,
                        meta.get('status', ''), parse_date(meta.get('issued_date', '')),
                        parse_date(meta.get('effective_date', '')), content, url
                    ))
                except: continue
            return local_batch
        except: return []

    # Detect structure
    is_direct_docs = any((p / "metadata.json").exists() for p in base_dir.iterdir() if p.is_dir())
    
    if is_direct_docs:
        doc_type = base_dir.name
        for doc_dir in base_dir.iterdir():
            if not doc_dir.is_dir(): continue
            batch = process_doc_dir_articles(doc_dir, doc_type)
            for item in batch:
                articles_batch.append(item)
                count += 1
                total += 1
                if count >= 1000:
                    insert_query = """
                        INSERT INTO vbpl_articles_data 
                        (documentId, title, documentNumber, documentType, Status, "issue date", "effective date", content, link)
                        VALUES %s
                        ON CONFLICT (documentId, title) DO UPDATE SET
                            documentNumber = EXCLUDED.documentNumber,
                            documentType = EXCLUDED.documentType,
                            Status = EXCLUDED.Status,
                            "issue date" = EXCLUDED."issue date",
                            "effective date" = EXCLUDED."effective date",
                            content = EXCLUDED.content,
                            link = EXCLUDED.link
                    """
                    execute_values(cursor, insert_query, articles_batch)
                    conn.commit()
                    print(f"  Da insert {total} articles...")
                    articles_batch.clear()
                    count = 0
    else:
        for doc_type_dir in base_dir.iterdir():
            if not doc_type_dir.is_dir(): continue
            doc_type = doc_type_dir.name
            for doc_dir in doc_type_dir.iterdir():
                if not doc_dir.is_dir(): continue
                batch = process_doc_dir_articles(doc_dir, doc_type)
                for item in batch:
                    articles_batch.append(item)
                    count += 1
                    total += 1
                    if count >= 1000:
                        pass
                
                if count >= 1000:
                    insert_query = """
                        INSERT INTO vbpl_articles_data 
                        (documentId, title, documentNumber, documentType, Status, "issue date", "effective date", content, link)
                        VALUES %s
                        ON CONFLICT (documentId, title) DO UPDATE SET
                            documentNumber = EXCLUDED.documentNumber,
                            documentType = EXCLUDED.documentType,
                            Status = EXCLUDED.Status,
                            "issue date" = EXCLUDED."issue date",
                            "effective date" = EXCLUDED."effective date",
                            content = EXCLUDED.content,
                            link = EXCLUDED.link
                    """
                    execute_values(cursor, insert_query, articles_batch)
                    conn.commit()
                    print(f"  Da insert {total} articles...")
                    articles_batch.clear()
                    count = 0

    if articles_batch:
        insert_query = """
            INSERT INTO vbpl_articles_data 
            (documentId, title, documentNumber, documentType, Status, "issue date", "effective date", content, link)
            VALUES %s
            ON CONFLICT (documentId, title) DO UPDATE SET
                documentNumber = EXCLUDED.documentNumber,
                documentType = EXCLUDED.documentType,
                Status = EXCLUDED.Status,
                "issue date" = EXCLUDED."issue date",
                "effective date" = EXCLUDED."effective date",
                content = EXCLUDED.content,
                link = EXCLUDED.link
        """
        execute_values(cursor, insert_query, articles_batch)
        conn.commit()

    print(f"HOAN TAT! Tong cong da insert {total} articles vao DB.")

    if imported_doc_ids:
        manifest_path = Path(".crawler-last-import-document-ids.json")
        manifest_path.write_text(
            json.dumps(sorted(imported_doc_ids), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"[Manifest] Da ghi {len(imported_doc_ids)} documentId -> {manifest_path.resolve()}")

    cursor.close()
    conn.close()

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--update', action='store_true', help='Incremental mode')
    parser.add_argument('--target', help='Specific folder inside vbpl_articles to import')
    args = parser.parse_args()
    
    path = "vbpl_articles"
    target = args.target
    if not target and args.update:
        if (Path("vbpl_articles") / "van_ban_moi").exists():
            target = "van_ban_moi"
            print(f"--- Tự động chọn mục tiêu import: {target} ---")
            
    if target:
        path = os.path.join("vbpl_articles", target)
        
    import_articles(data_dir=path)
