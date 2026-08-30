'use client';

import Image from 'next/image';
import { useState } from 'react';

type CoverArtworkProps = {
  src: string;
  alt: string;
  sizes?: string;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
  grayscale?: boolean;
};

export function CoverArtwork({
  src,
  alt,
  sizes = '(max-width: 900px) 50vw, 25vw',
  className = '',
  imageClassName = '',
  priority = false,
  grayscale = false,
}: CoverArtworkProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className={`cover-artwork${isLoaded ? ' is-loaded' : ''}${className ? ` ${className}` : ''}`}>
      <div className="cover-artwork__ambient" />
      <div className="cover-artwork__tint" />
      <div className="cover-artwork__shimmer" />
      <Image
        src={src}
        alt={alt}
        fill
        unoptimized
        sizes={sizes}
        className={`cover-image${imageClassName ? ` ${imageClassName}` : ''}`}
        style={{ filter: grayscale ? 'grayscale(1)' : undefined }}
        onLoad={() => setIsLoaded(true)}
        priority={priority}
      />
    </div>
  );
}
