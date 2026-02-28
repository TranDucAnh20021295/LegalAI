# Legal AI System - Microservices Architecture

Hệ thống đăng nhập và đăng ký với kiến trúc microservice sử dụng Next.js, Express, PostgreSQL và Google OAuth.

## Kiến trúc Microservice

```
┌─────────────┐
│   Client    │ (Next.js Frontend)
│  Port 3000  │
└──────┬──────┘
       │
       │ HTTP Requests
       ▼
┌─────────────┐
│ API Gateway │ (Express)
│  Port 8000  │
└──────┬──────┘
       │
       │ Routes to services
       ▼
┌─────────────┐      ┌─────────────┐
│Auth Service │      │  (Future)   │
│  Port 5001  │      │   Services  │
└──────┬──────┘      └─────────────┘
       │
       │
       ▼
┌─────────────┐
│  PostgreSQL │
│  Port 5432  │
└─────────────┘
```

## Cấu trúc dự án

```
LegalAISystem/
├── app/                    # Next.js Frontend (App Router)
│   ├── page.js            # Trang đăng nhập
│   ├── register/          # Trang đăng ký
│   ├── dashboard/         # Trang dashboard
│   └── auth/callback/     # Callback cho Google OAuth
├── components/            # React components
│   ├── LoginForm.js
│   └── RegisterForm.js
├── lib/                   # Utilities
│   └── api.js            # API client (gọi API Gateway)
├── services/              # Microservices
│   ├── auth-service/      # Authentication Service
│   │   ├── config/
│   │   ├── models/
│   │   ├── routes/
│   │   └── index.js
│   └── api-gateway/       # API Gateway
│       └── index.js
├── docker-compose.yml     # Docker orchestration
└── package.json
```

## Cài đặt

### 1. Cài đặt dependencies cho tất cả services

```bash
npm run install:all
```

Hoặc cài đặt từng service:

```bash
# Root dependencies
npm install

# Auth Service
cd services/auth-service
npm install

# API Gateway
cd ../api-gateway
npm install
```

### 2. Cấu hình biến môi trường

#### Auth Service
Tạo file `services/auth-service/.env`:

```env
PORT=5001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=legalai_db
DB_USER=postgres
DB_PASSWORD=10092002
JWT_SECRET=your-secret-key-change-this-in-production
JWT_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:8000/api/auth/google/callback
GATEWAY_URL=http://localhost:8000
```

#### API Gateway
Tạo file `services/api-gateway/.env`:

```env
PORT=8000
AUTH_SERVICE_URL=http://localhost:5001
CLIENT_URL=http://localhost:3000
```

#### Frontend
Tạo file `.env.local` ở root:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 3. Cấu hình Database PostgreSQL

Đảm bảo PostgreSQL đang chạy trên port 5432 với:
- User: postgres
- Password: 10092002
- Database: legalai_db (sẽ được tạo tự động)

Hoặc tạo database thủ công:
```sql
CREATE DATABASE legalai_db;
```

### 4. Cấu hình Google OAuth (Tùy chọn)

1. Truy cập [Google Cloud Console](https://console.cloud.google.com/)
2. Tạo project mới hoặc chọn project hiện có
3. Enable Google+ API
4. Tạo OAuth 2.0 credentials
5. Thêm authorized redirect URI: `http://localhost:8000/api/auth/google/callback`
6. Copy Client ID và Client Secret vào `services/auth-service/.env`

### 5. Cấu hình SMTP - Gửi email quên mật khẩu (Tùy chọn)

Thêm vào `services/auth-service/.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
```

**Gmail**: Tạo [App Password](https://myaccount.google.com/apppasswords) (bật xác minh 2 bước trước).

Nếu không cấu hình SMTP, link đặt lại mật khẩu sẽ được trả về và hiển thị trên trang

## Chạy ứng dụng

### Development Mode (Local)

Chạy tất cả services cùng lúc:

```bash
npm run dev
```

Hoặc chạy từng service riêng:

```bash
# Terminal 1 - API Gateway
npm run dev:gateway

# Terminal 2 - Auth Service
npm run dev:auth

# Terminal 3 - Frontend
npm run dev:client
```

### Production Mode với Docker

```bash
# Build và start tất cả services
docker-compose up -d

# Xem logs
docker-compose logs -f

# Stop services
docker-compose down
```

## API Endpoints

### API Gateway (Port 8000)

Tất cả requests từ frontend đều đi qua API Gateway:

- `GET /` - Gateway info
- `GET /health` - Gateway health check
- `POST /api/auth/register` - Đăng ký (forwarded to auth-service)
- `POST /api/auth/login` - Đăng nhập (forwarded to auth-service)
- `GET /api/auth/google` - Đăng nhập với Google (forwarded to auth-service)
- `GET /api/auth/google/callback` - Google OAuth callback (forwarded to auth-service)
- `GET /api/auth/me` - Lấy thông tin user (forwarded to auth-service)

### Auth Service (Port 5001)

Service này chỉ được gọi nội bộ qua API Gateway:

- `GET /health` - Service health check
- `POST /auth/register` - Đăng ký tài khoản
- `POST /auth/login` - Đăng nhập
- `GET /auth/google` - Đăng nhập với Google
- `GET /auth/google/callback` - Google OAuth callback
- `GET /auth/me` - Lấy thông tin user hiện tại

## Database Schema

### Bảng Users

| STT | Tên cột | Kiểu dữ liệu | Mô tả |
|-----|---------|--------------|-------|
| 1 | id | int | Mã tự tăng |
| 2 | userId | char(36) | PK – Mã định danh UUID |
| 3 | fullName | varchar(255) | Họ và tên người dùng |
| 4 | email | varchar(255) | Email người dùng (unique) |
| 5 | passwordHash | varchar(255) | Mật khẩu đã mã hóa |
| 6 | loginProvider | varchar(20) | LOCAL / GOOGLE |
| 7 | role | varchar(20) | USER / ADMIN |
| 8 | createdAt | datetime | Thời điểm tạo tài khoản |
| 9 | updatedAt | datetime | Thời điểm cập nhật |

## Tính năng

- ✅ Kiến trúc Microservice
- ✅ API Gateway để route requests
- ✅ Đăng ký với email và mật khẩu
- ✅ Đăng nhập với email và mật khẩu
- ✅ Đăng nhập với Google OAuth
- ✅ JWT authentication
- ✅ Bảo mật mật khẩu với bcrypt
- ✅ Giao diện đẹp và responsive
- ✅ Tự động tạo database schema
- ✅ Docker support

## Công nghệ sử dụng

- **Frontend**: Next.js 14, React 18
- **API Gateway**: Express.js
- **Auth Service**: Express.js, Node.js
- **Database**: PostgreSQL
- **Authentication**: JWT, Passport.js, Google OAuth 2.0
- **Containerization**: Docker, Docker Compose

## Lợi ích của Microservice Architecture

1. **Scalability**: Mỗi service có thể scale độc lập
2. **Maintainability**: Code được tách biệt, dễ bảo trì
3. **Technology Diversity**: Mỗi service có thể dùng công nghệ khác nhau
4. **Fault Isolation**: Lỗi ở một service không ảnh hưởng service khác
5. **Team Autonomy**: Mỗi team có thể phát triển service riêng

## Thêm Service mới

Để thêm service mới:

1. Tạo thư mục `services/new-service/`
2. Thêm service vào `docker-compose.yml`
3. Cấu hình route trong `api-gateway/index.js`
4. Update `.env` files nếu cần

## Lưu ý

- Đảm bảo PostgreSQL đang chạy trước khi start services
- Thay đổi `JWT_SECRET` trong production
- Cấu hình Google OAuth để sử dụng tính năng đăng nhập Google
- Trong production, sử dụng environment variables thay vì hardcode
