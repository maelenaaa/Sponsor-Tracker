import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sponsor desk',
  description: 'Sponsor deliverables and weekly publishing planner',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#282a75' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;500;600&family=Oswald:wght@400;500;600&display=swap"
        />
      </head>
      <body className="min-h-screen bg-cream font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
