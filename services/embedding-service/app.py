"""
Microservice embedding dùng sentence-transformers.
Chạy: pip install -r requirements.txt && python app.py
Mặc định model: keepitreal/vietnamese-sbert (768 dimensions).
"""
import os
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024  # 2MB, tránh đọc body 10MB gây MemoryError
CORS(app)

MODEL_NAME = os.environ.get("EMBEDDING_MODEL", "keepitreal/vietnamese-sbert")
model = None


def get_model():
    global model
    if model is None:
        from sentence_transformers import SentenceTransformer
        print(f"[Embedding] Loading model: {MODEL_NAME}")
        model = SentenceTransformer(MODEL_NAME)
        print("[Embedding] Model ready")
    return model


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "OK", "service": "embedding-service", "model": MODEL_NAME})


@app.route("/embed", methods=["POST"])
def embed():
    try:
        data = request.get_json() or {}
        text = data.get("text") or data.get("inputs")
        if isinstance(text, list):
            texts = [t[:8000] for t in text if t]
        elif text:
            texts = [str(text).strip()[:8000]]
        else:
            return jsonify({"error": "Thiếu 'text' hoặc 'inputs'"}), 400
        if not texts:
            return jsonify({"error": "Nội dung rỗng"}), 400
        if len(texts) > 32:
            return jsonify({"error": "Tối đa 32 đoạn mỗi request"}), 400
        m = get_model()
        embeddings = m.encode(texts, normalize_embeddings=True)
        if len(texts) == 1:
            return jsonify({"embedding": embeddings[0].tolist(), "dimensions": len(embeddings[0])})
        return jsonify({"embeddings": [e.tolist() for e in embeddings], "dimensions": embeddings.shape[1]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5004))
    print(f"[Embedding] Khởi động, load model trước khi lắng nghe...")
    get_model()
    app.run(host="0.0.0.0", port=port, debug=True)
