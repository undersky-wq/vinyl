import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    if (process.env.NODE_ENV !== 'development') return [];
    const apiBase = (process.env.API_URL_INTERNAL || process.env.NEXT_PUBLIC_API_URL || 'http://backend:3001/api').replace(/\/+$/, '');
    return [{ source: '/api/:path*', destination: `${apiBase}/:path*` }];
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
        ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=15552000' }] : []),
      ],
    }, {
      source: '/shelf.css',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=300, must-revalidate' }],
    }];
  },
  images: {
    // Cover URLs are signed, but remain stable long enough for Next.js to reuse
    // optimized variants instead of processing the same artwork on every visit.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      { protocol: 'https', hostname: 'mityadima.ru' },
      { protocol: 'https', hostname: 'www.mityadima.ru' },
      { protocol: 'https', hostname: 'i.discogs.com' },
      { protocol: 'https', hostname: 's3.ru-7.storage.selcloud.ru' },
      { protocol: 'https', hostname: '*.s3.ru-7.storage.selcloud.ru' },
    ],
  },
};

export default nextConfig;
