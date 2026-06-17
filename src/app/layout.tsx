import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'

export const metadata: Metadata = {
  title: 'Homestay Dashboard',
  description: 'Homestay SaaS Management Dashboard',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="vi">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
