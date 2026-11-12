'use client';

import { SiteError } from '../components/site-error';
import '../components/shelf-theme.css';
import '../components/shelf-web.css';

export default function GlobalError({ reset }: { reset: () => void }) {
  return <html lang="ru" data-visual-variant="shelf" suppressHydrationWarning><head><title>MityaDima - Page unavailable</title><meta name="robots" content="noindex" /></head>
    <body style={{ margin: 0, background: 'var(--shelf-web-bg)', color: 'var(--shelf-web-ink)' }}><SiteError reset={reset} reload /></body>
  </html>;
}
