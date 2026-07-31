import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Family Gate Keeper',
  description:
    'The family information you need once a year and need badly: policy numbers, account numbers, the garage code, when the registration expires.',
  applicationName: 'Family Gate Keeper',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Gate Keeper',
    statusBarStyle: 'default',
  },
  // A vault has nothing to gain from being indexed.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
