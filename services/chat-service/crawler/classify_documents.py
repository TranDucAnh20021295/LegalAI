import os
import time
import psycopg2
from openai import OpenAI
import json

# Đọc API key từ biến môi trường (đặt trong .env hoặc shell)
# Không hardcode API key trực tiếp trong code!
# Cách thiết lập: set OPENAI_API_KEY=sk-... (Windows) hoặc export OPENAI_API_KEY=sk-... (Linux/Mac)
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
if not OPENAI_API_KEY:
    raise EnvironmentError("Thiếu biến môi trường OPENAI_API_KEY. Vui lòng thiết lập trước khi chạy script.")

MODEL_NAME = "gpt-4o-mini"

DB_CONFIG = {
    'host': 'localhost',
    'port': 5433,
    'user': 'postgres',
    'password': '123456',
    'dbname': 'legal_ai'
}
client = OpenAI(api_key=OPENAI_API_KEY)

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

def classify_legal_document(title, brief_content):
    """
    Sử dụng OpenAI gọi GPT để phân loại lĩnh vực luật dựa trên nội dung tóm tắt.
    """
    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Bạn là một chuyên gia pháp lý hệ thống Pháp luật Việt Nam. "
                        "Nhiệm vụ của bạn là lấy Tiêu đề và một phần đầu của Văn bản, sau đó "
                        "phân loại văn bản này thuộc từ 1 đến tối đa 3 lĩnh vực pháp luật phù hợp nhất.\n"
                        f"CHỈ CHỌN từ danh sách sau: {json.dumps(CATEGORIES, ensure_ascii=False)}.\n"
                        "Quan trọng: TRẢ VỀ CHÍNH XÁC cấu trúc mảng JSON, không giải thích gì thêm. Ví dụ: [\"Tài chính - Kế toán - Thuế\"]"
                    )
                },
                {
                    "role": "user",
                    "content": f"Tiêu đề: {title}\nTrích đoạn nội dung:\n{brief_content}"
                }
            ],
            temperature=0, 
            response_format={ "type": "json_object" } if "gpt-4" in MODEL_NAME or "gpt-3.5" in MODEL_NAME else None 
        )
        
        result_text = response.choices[0].message.content.strip()
        
        try:
            if result_text.startswith("```json"):
                result_text = result_text.strip("`").removeprefix("json").strip()
            return json.loads(result_text)
        except:
            return [result_text]
            
    except Exception as e:
        print(f"Lỗi khi gọi OpenAI: {e}")
        return ["Khác"]

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
