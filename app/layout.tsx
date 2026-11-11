import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Public_Sans, Spline_Sans_Mono } from 'next/font/google'
import { OfflineBanner } from '@/components/offline-banner'
import { Providers } from '@/app/providers'
import './globals.css'

const sans = Public_Sans({ subsets: ['latin'], variable: '--font-public-sans', display: 'swap' })
const mono = Spline_Sans_Mono({ subsets: ['latin'], variable: '--font-spline-mono', display: 'swap' })

export const metadata: Metadata = {
  title: 'BastionOS · Fortewings Security',
  description: 'Real-time security operations, guard attendance, incidents, and live site monitoring.',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light', width: 'device-width', initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#2A2B2E' },
    { media: '(prefers-color-scheme: dark)', color: '#2A2B2E' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="antialiased font-sans">
        <Providers>
          <OfflineBanner />
          {children}
        </Providers>
        {process.env.VERCEL ? <Analytics /> : null}
      </body>
    </html>
  )
}
