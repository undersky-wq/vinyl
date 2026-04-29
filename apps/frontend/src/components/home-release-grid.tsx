'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getHomeReleases } from '../lib/api';
import { SiteLang } from '../lib/language';
import { HomeRelease } from '../types';
import { ReleaseCard } from './release-card';

type HomeReleaseGridProps = {
  initialReleases: HomeRelease[];
  queryString: string;
  lang: SiteLang;
  pageSize?: number;
};

function uniqueByReleaseId(releases: HomeRelease[]) {
  const seen = new Set<string>();

  return releases.filter((release) => {
    if (seen.has(release.id)) {
      return false;
    }

    seen.add(release.id);
    return true;
  });
}

export function HomeReleaseGrid({
  initialReleases,
  queryString,
  lang,
  pageSize = 24,
}: HomeReleaseGridProps) {
  const [releases, setReleases] = useState(() => uniqueByReleaseId(initialReleases));
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialReleases.length === pageSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestRef = useRef(false);

  useEffect(() => {
    setReleases(uniqueByReleaseId(initialReleases));
    setHasMore(initialReleases.length === pageSize);
    setIsLoading(false);
    requestRef.current = false;
  }, [initialReleases, pageSize]);

  const loadMore = useCallback(async () => {
    if (requestRef.current || isLoading || !hasMore) {
      return;
    }

    requestRef.current = true;
    setIsLoading(true);

    try {
      const params = new URLSearchParams(queryString);
      params.set('summary', 'true');
      params.set('limit', String(pageSize));
      params.set('offset', String(releases.length));
      const nextBatch = await getHomeReleases(params);

      setReleases((current) => uniqueByReleaseId([...current, ...nextBatch]));
      setHasMore(nextBatch.length === pageSize);
    } catch {
      setHasMore(false);
    } finally {
      requestRef.current = false;
      setIsLoading(false);
    }
  }, [hasMore, isLoading, pageSize, queryString, releases.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) {
          return;
        }

        void loadMore();
      },
      {
        rootMargin: '320px 0px',
      },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, loadMore]);

  useEffect(() => {
    if (!hasMore) {
      return;
    }

    function handleScroll() {
      const scrollBottom = window.innerHeight + window.scrollY;
      const threshold = document.documentElement.scrollHeight - 520;
      if (scrollBottom >= threshold) {
        void loadMore();
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [hasMore, loadMore]);

  return (
    <>
      <section className="release-grid">
        {releases.map((release) => (
          <ReleaseCard key={release.id} release={release} />
        ))}
      </section>

      <div ref={sentinelRef} className="home-grid-sentinel" aria-hidden="true" />

      {isLoading ? (
        <p className="home-grid-status muted">
          {lang === 'ru' ? 'Загружаются следующие релизы...' : 'Loading more releases...'}
        </p>
      ) : hasMore ? (
        <div className="home-grid-status">
          <button type="button" className="home-grid-more" onClick={() => void loadMore()}>
            {lang === 'ru' ? 'Показать ещё' : 'Load more'}
          </button>
        </div>
      ) : null}
    </>
  );
}
