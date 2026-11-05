'use client';

import { SiteError } from '../components/site-error';

export default function GlobalError({ reset }: { reset: () => void }) {
  return <html lang="ru"><head><title>MityaDima - Page unavailable</title><meta name="robots" content="noindex" /></head>
    <body style={{ margin: 0, background: '#101112', color: '#f5f5f3' }}><SiteError reset={reset} reload /></body>
  </html>;
}
