'use client';

import { useEffect, useRef, useState } from 'react';

export function CollectionPosition({ count, read }: {
  count: number;
  read: () => { progress: number; index: number };
}) {
  const readRef = useRef(read);
  readRef.current = read;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let lastIndex = -1;
    const update = () => {
      const value = readRef.current();
      if (value.index !== lastIndex) {
        lastIndex = value.index;
        setIndex(value.index);
      }
    };
    update();
    const timer = window.setInterval(update, 80);
    return () => window.clearInterval(timer);
  }, [count]);

  const current = count ? Math.min(count, Math.max(1, index + 1)) : 0;
  return <>{current} - {count}</>;
}
