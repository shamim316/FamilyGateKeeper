import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Easypanel deploys the Docker image; standalone keeps it small.
  output: 'standalone',
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: false,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          // Vault contents must never reach a third party, and clipboard access
          // is used for tap-to-copy on masked secrets.
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
