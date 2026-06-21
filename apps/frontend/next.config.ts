import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
