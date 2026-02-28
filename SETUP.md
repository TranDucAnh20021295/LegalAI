# Hướng dẫn Setup Environment

## Tạo file .env

Các file `.env` đã được tạo tự động với cấu hình mặc định. Nếu cần tạo lại, chạy:

```powershell
.\setup-env.ps1
```

Hoặc tạo thủ công:

### 1. Frontend (.env.local ở root)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 2. Auth Service (services/auth-service/.env)

```env
SERVICE_NAME=auth-service
PORT=5001

DB_HOST=localhost
DB_PORT=5432
DB_NAME=legalai_db
DB_USER=postgres
DB_PASSWORD=10092002

JWT_SECRET=your-secret-key-change-this-in-production-please-use-strong-random-string
JWT_EXPIRES_IN=7d

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:8000/api/auth/google/callback

GATEWAY_URL=http://localhost:8000
```

### 3. API Gateway (services/api-gateway/.env)

```env
PORT=8000
NODE_ENV=development

AUTH_SERVICE_URL=http://localhost:5001

CLIENT_URL=http://localhost:3000
```

## Lưu ý

- **JWT_SECRET**: Thay đổi thành một chuỗi ngẫu nhiên mạnh trong production
- **DB_PASSWORD**: Mặc định là `10092002` (theo yêu cầu)
- **Google OAuth**: Để trống nếu chưa cấu hình, hoặc điền Client ID và Secret nếu có
