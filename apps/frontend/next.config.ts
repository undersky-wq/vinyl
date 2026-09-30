import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    if (process.env.NODE_ENV !== 'development') return [];
    const apiBase = (process.env.API_URL_INTERNAL || process.env.NEXT_PUBLIC_API_URL || 'http://backend:3001/api').replace(/\/+$/, '');
    return [{ source: '/api/:path*', destination: `${apiBase}/:path*` }];
  },
  async headers() {
    return [{
      source: '/shelf.css',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=300, must-revalidate' }],
    }];
  },
  images: {
    // Cover URLs are signed, but remain stable long enough for Next.js to reuse
    // optimized variants instead of processing the same artwork on every visit.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
