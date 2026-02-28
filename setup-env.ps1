# Script to create .env files for all services
# Run: .\setup-env.ps1

Write-Host "Creating .env files..." -ForegroundColor Green

# Frontend .env.local
$frontendEnv = @"
# Frontend Environment Variables
NEXT_PUBLIC_API_URL=http://localhost:8000
"@
$frontendEnv | Out-File -FilePath ".env.local" -Encoding utf8 -NoNewline
Write-Host "✓ Created .env.local" -ForegroundColor Green

# Auth Service .env
$authEnv = @"
# Service
SERVICE_NAME=auth-service
PORT=5001

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=legalai_db
DB_USER=postgres
DB_PASSWORD=10092002

# JWT
JWT_SECRET=your-secret-key-change-this-in-production-please-use-strong-random-string
JWT_EXPIRES_IN=7d

# Google OAuth (Optional - để trống nếu chưa cấu hình)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:8000/api/auth/google/callback

# API Gateway URL (for callbacks)
GATEWAY_URL=http://localhost:8000

# Client URL (for forgot password redirect)
CLIENT_URL=http://localhost:3000

# SMTP - Gửi email quên mật khẩu (Gmail: dùng App Password)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
"@
$authEnv | Out-File -FilePath "services\auth-service\.env" -Encoding utf8 -NoNewline
Write-Host "✓ Created services\auth-service\.env" -ForegroundColor Green

# API Gateway .env
$gatewayEnv = @"
# Gateway
PORT=8000
NODE_ENV=development

# Services
AUTH_SERVICE_URL=http://localhost:5001

# Frontend
CLIENT_URL=http://localhost:3000
"@
$gatewayEnv | Out-File -FilePath "services\api-gateway\.env" -Encoding utf8 -NoNewline
Write-Host "✓ Created services\api-gateway\.env" -ForegroundColor Green

Write-Host "`nAll .env files created successfully!" -ForegroundColor Green
Write-Host "Remember to update JWT_SECRET and Google OAuth credentials if needed." -ForegroundColor Yellow
