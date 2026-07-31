import type { Metadata, Viewport } from 'next';
import { configScript, readPublicConfigFromEnv } from '@/lib/supabase/public-config';
import './globals.css';

/**
 * Rendered per request so the Supabase settings below come from the running
 * container's environment rather than whatever was present when the image was
 * built. That is what lets the same image move between environments, and what
 * makes a host's environment tab actually work.
 */
export const dynamic = 'force-dynamic';

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
  const config = readPublicConfigFromEnv();

  return (
    <html lang="en">
      <head>
        {/* The anon key is public by design — it ships in every Supabase app's
            client bundle, and row-level security is what protects the data.
            The service-role key never appears here. */}
        <script
          id="fgk-config"
          dangerouslySetInnerHTML={{ __html: configScript(config) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
