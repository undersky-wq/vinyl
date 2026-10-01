'use client';

import { useState, useSyncExternalStore } from 'react';

const FALLBACK_COVER = '/fallback-cover.svg';
const mobileQuery = '(max-width:700px)';
function subscribeMobile(listener: () => void) {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
const isMobile = () => window.matchMedia(mobileQuery).matches;
const serverMobile = () => false;

type CoverImageProps = {
  src?: string | null;
  mobileSrc?: string | null;
  alt: string;
  width: number;
  height: number;
  className?: string;
  loading?: 'eager' | 'lazy';
  decoding?: 'async' | 'auto' | 'sync';
};

export function CoverImage({
  src,
  mobileSrc,
  alt,
  width,
  height,
  className,
  loading = 'lazy',
  decoding = 'async',
}: CoverImageProps) {
  const mobile = useSyncExternalStore(subscribeMobile, isMobile, serverMobile);
  const safeSrc = (mobile && mobileSrc ? mobileSrc : src) || FALLBACK_COVER;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const currentSrc = failedSrc === safeSrc ? FALLBACK_COVER : safeSrc;

  return (
    <img
      src={currentSrc}
      alt={alt}
      width={width}
      height={height}
      className={className}
      loading={loading}
      decoding={decoding}
      onError={() => {
        if (currentSrc !== FALLBACK_COVER) {
          setFailedSrc(safeSrc);
        }
      }}
    />
  );
}
