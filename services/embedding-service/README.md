# Embedding Service (sentence-transformers)

Chạy local, không cần OpenAI API key.

## Cài đặt

```bash
cd services/embedding-service
pip install -r requirements.txt
```

## Chạy

Trong thư mục `services/embedding-service`:

```bash
python app.py
```

Trên Windows nếu lệnh trên không được, thử `py app.py`.

Hoặc (sau khi có `package.json` trong thư mục này):

```bash
npm run dev
```

**Lưu ý:** Chỉ chạy `npm run dev` **trong** `services/embedding-service` (có `package.json` riêng). Nếu chạy `npm run dev` ở thư mục con khác không có `package.json`, npm có thể dùng script của repo gốc → trùng cổng gateway/auth.

Mặc định chạy tại `http://localhost:5004`.

## Biến môi trường

- `PORT`: cổng (mặc định 5004)
- `EMBEDDING_MODEL`: model sentence-transformers (mặc định `keepitreal/vietnamese-sbert` – 768 chiều, tiếng Việt)

Ví dụ model khác:
- `sentence-transformers/stsb-xlm-r-multilingual` (768, đa ngôn ngữ)
- `sentence-transformers/all-MiniLM-L6-v2` (384, tiếng Anh)

## API

- `GET /health` – kiểm tra service
- `POST /embed` – body `{"text": "nội dung"}` hoặc `{"inputs": ["text1", "text2"]}` → trả về `{"embedding": [...], "dimensions": 768}`

## Dùng với document-service

Trong `document-service/.env`:

```
EMBEDDING_PROVIDER=local
EMBEDDING_LOCAL_URL=http://localhost:5004
```

Không cần `OPENAI_API_KEY`. Restart document-service. Cột `embedding_768` trong `DocumentChunks` sẽ được dùng cho tìm kiếm semantic.
