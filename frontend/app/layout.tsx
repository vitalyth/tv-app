import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import '@/styles/globals.css'
import 'video.js/dist/video-js.css'
import SiteShell from '@/components/site-shell'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'ערוצי טלוויזיה - צפייה בשידור חי',
  description: 'צפו בערוצי טלוויזיה ישראליים בשידור חי',
  generator: 'v0.app',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      'max-video-preview': 0,
      'max-image-preview': 'none',
      'max-snippet': 0,
    },
  },
  icons: {
    shortcut: '/favicon.ico',
    icon: [
      {
        url: '/favicon.ico',
        sizes: '32x32',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
      {
        url: '/tv_icon.png',
        media: '(prefers-color-scheme: dark)',
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
      <body suppressHydrationWarning className="font-sans antialiased">
        <SiteShell>{children}</SiteShell>
        {process.env.NEXT_PUBLIC_VERCEL === "1" && <Analytics />}
      </body>
    </html>
  )
}
