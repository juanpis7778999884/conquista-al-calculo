import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://conquista-calculo.vercel.app'
const description =
  'Una expedición multijugador para conquistar las tierras del cálculo. Varios equipos compiten en la misma sala.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Conquista Cálculo | Carrera de cálculo por equipos',
  description,
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: '/icon.svg',
  },
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    url: '/',
    siteName: 'Conquista Cálculo',
    title: 'Conquista Cálculo | Carrera de cálculo por equipos',
    description,
  },
  twitter: {
    card: 'summary',
    title: 'Conquista Cálculo | Carrera de cálculo por equipos',
    description,
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#102526',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es">
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
