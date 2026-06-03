import os
import time
import psycopg2
import json
import urllib.request
from pathlib import Path

def _load_openai_key_from_env_files():
    """Crawler spawn từ Node không tự có OPENAI_API_KEY — đọc từ .env giống document-service."""
    if os.environ.get("OPENAI_API_KEY"):
        return
    root = Path(__file__).resolve().parents[3]
    for env_path in (
        root / "services" / "document-service" / ".env",
        root / "services" / "chat-service" / ".env",
        root / ".env.local",
    ):
        if not env_path.exists():
            continue
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            if key.strip() == "OPENAI_API_KEY" and val.strip():
                os.environ["OPENAI_API_KEY"] = val.strip().strip('"').strip("'")
                return


_load_openai_key_from_env_files()
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
if not OPENAI_API_KEY:
    raise EnvironmentError(
        "Thiếu OPENAI_API_KEY. Thêm vào services/document-service/.env hoặc biến môi trường hệ thống."
    )

MODEL_NAME = "gpt-4o-mini"
CLASSIFY_TIMEOUT_SECONDS = float(os.environ.get("CLASSIFY_TIMEOUT_SECONDS", "20"))

DB_CONFIG = {
    'host': 'localhost',
    'port': 5433,
    'user': 'postgres',
    'password': '123456',
    'dbname': 'legal_ai'
}

CATEGORIES = [
    "Dân sự & Hôn nhân Gia đình",
    "Hình sự & An ninh Quốc phòng",
    "Kinh tế & Doanh nghiệp",
    "Tài chính - Kế toán - Thuế",
    "Lao động & Bảo hiểm Xã hội",
    "Đất đai - Bất động sản",
    "Hành chính",
    "Giáo dục",
    "Y tế",
    "Khác"
]


def _parse_classify_response(result_text):
    if result_text.startswith("```json"):
        result_text = result_text.strip("`").removeprefix("json").strip()
    data = json.loads(result_text)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("categories", "tags", "fields", "linh_vuc"):
            val = data.get(key)
            if isinstance(val, list):
                return val
        first = next(iter(data.values()), None)
        if isinstance(first, list):
            return first
    return [str(data)]


def classify_legal_document(title, brief_content):
    """
    Sử dụng OpenAI gọi GPT để phân loại lĩnh vực luật dựa trên nội dung tóm tắt.
    """
    try:
        print(f"[AI Classify] Gọi OpenAI API HTTP ({MODEL_NAME}, timeout={CLASSIFY_TIMEOUT_SECONDS}s)...", flush=True)
        payload = json.dumps({
            "model": MODEL_NAME,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Bạn phân loại văn bản pháp luật Việt Nam. "
                        f"CHỈ chọn từ danh sách: {json.dumps(CATEGORIES, ensure_ascii=False)}. "
                        'Trả về JSON đúng dạng: {"categories": ["Tên lĩnh vực"]} với 1-3 phần tử.'
                    )
                },
                {
                    "role": "user",
                    "content": f"Tiêu đề: {title}\nTrích đoạn:\n{brief_content[:400]}"
                }
            ],
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "max_tokens": 80,
        }).encode("utf-8")

        request = urllib.request.Request(
            "https://api.openai.com/v1/chat/completions",
            data=payload,
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        with urllib.request.urlopen(request, timeout=CLASSIFY_TIMEOUT_SECONDS) as response:
            data = json.loads(response.read().decode("utf-8"))

        result_text = data["choices"][0]["message"]["content"].strip()
        return _parse_classify_response(result_text)

    except Exception as e:
        print(f"[AI Classify] Lỗi OpenAI: {type(e).__name__}: {e}", flush=True)
        return None

def run_classifier():
    print("Connecting to Database...")
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    cur.execute("""
        SELECT id, title, content 
        FROM "LegalDocuments" 
        WHERE field = 'Legal' OR field IS NULL
    """)
    rows = cur.fetchall()
    
    if not rows:
        print("Mọi văn bản đều đã được phân loại!")
        return

    print(f"Bắt đầu phân loại cho {len(rows)} văn bản...")
    for row in rows:
        doc_id = row[0]
        title = row[1]
        content = row[2]
        brief_content = content[:500] if content else ""
        print(f"\n[{doc_id}] Đang phân loại: {title[:80]}...")
        tags = classify_legal_document(title, brief_content)
        if isinstance(tags, dict) and "tags" in tags: tags = tags["tags"] 
        elif isinstance(tags, dict): tags = list(tags.values())[0]
        if isinstance(tags, list):
            tags_string = ", ".join([str(t) for t in tags])
        else:
            tags_string = str(tags)
            
        print(f"      => Kết quả gán nhãn: {tags_string}")
        cur.execute("""
            UPDATE "LegalDocuments"
            SET field = %s
            WHERE id = %s
        """, (tags_string, doc_id))
        conn.commit()

        time.sleep(1)

    print("\nHoàn tất phân loại batch này!")
    cur.close()
    conn.close()

if __name__ == "__main__":
    run_classifier()
