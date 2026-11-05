'use client';

import { isChunkLoadError, SiteError } from '../components/site-error';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SiteError reset={reset} reload={isChunkLoadError(error)} />;
}
