import type { Metadata } from 'next';
import { Noto_Sans, Noto_Sans_Devanagari } from 'next/font/google';
import type { ReactNode } from 'react';
import { DemoBanner, SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { Providers } from './providers';
import './globals.css';

// Fonts are downloaded at BUILD time and served from our own origin (no request to Google at runtime).
// Noto Sans Devanagari renders Nepali text properly.
const notoSans = Noto_Sans({ subsets: ['latin'], variable: '--font-noto-sans', display: 'swap' });
const notoDevanagari = Noto_Sans_Devanagari({ subsets: ['devanagari'], variable: '--font-noto-devanagari', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Sewa Track (demo)', template: '%s · Sewa Track (demo)' },
  description: 'Demo / portfolio ward service request tracker for Nepal. Not affiliated with any government body.',
  robots: { index: false, follow: false }, // a demo: keep it out of search results so nobody mistakes it for a real service
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${notoSans.variable} ${notoDevanagari.variable}`}>
      <body className="flex min-h-screen flex-col font-sans">
        <Providers>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:bg-white focus:p-2">
            Skip to content
          </a>
          <DemoBanner />
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
