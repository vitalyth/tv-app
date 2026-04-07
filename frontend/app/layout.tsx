import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import '@/styles/globals.css'
import 'video.js/dist/video-js.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'ערוצי טלוויזיה - צפייה בשידור חי',
  description: 'צפו בערוצי טלוויזיה ישראליים בשידור חי',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/tv_icon.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ]
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className="font-sans antialiased">
        {children}
        {process.env.NEXT_PUBLIC_VERCEL === "1" && <Analytics />}
      </body>
    </html>
  )
}
