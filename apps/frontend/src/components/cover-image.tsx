'use client';

import { useEffect, useState } from 'react';

const FALLBACK_COVER = '/fallback-cover.svg';

type CoverImageProps = {
  src?: string | null;
  alt: string;
  width: number;
  height: number;
  className?: string;
  loading?: 'eager' | 'lazy';
  decoding?: 'async' | 'auto' | 'sync';
};

export function CoverImage({
  src,
  alt,
  width,
  height,
  className,
  loading = 'lazy',
  decoding = 'async',
}: CoverImageProps) {
  const safeSrc = src || FALLBACK_COVER;
  const [currentSrc, setCurrentSrc] = useState(safeSrc);

  useEffect(() => {
    setCurrentSrc(safeSrc);
  }, [safeSrc]);

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
          setCurrentSrc(FALLBACK_COVER);
        }
      }}
    />
  );
}
