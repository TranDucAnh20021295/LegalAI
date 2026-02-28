import './globals.css'

export const metadata = {
  title: 'LegalAI - Đăng nhập',
  description: 'Hệ thống Legal AI với xác thực người dùng',
}

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  )
}
