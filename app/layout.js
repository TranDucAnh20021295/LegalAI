import ChatWidget from '@/components/chat/ChatWidget'
import './globals.css'

export const metadata = {
  title: 'LegalAI – Tra cứu & Hỏi đáp Pháp luật Việt Nam',
  description: 'Hệ thống tra cứu văn bản pháp luật, hỏi đáp pháp lý AI và tính thuế TNCN nhanh chóng, chính xác.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <ChatWidget />
      </body>
    </html>
  )
}

