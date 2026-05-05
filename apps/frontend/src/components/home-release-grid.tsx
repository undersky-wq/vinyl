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

type HomeViewState = {
  queryString: string;
  releases: HomeRelease[];
  hasMore: boolean;
  scrollY: number;
};

const HOME_VIEW_STATE_KEY = 'vinyl-home-view-state';

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

function readHomeViewState(queryString: string) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawState = window.sessionStorage.getItem(HOME_VIEW_STATE_KEY);
    if (!rawState) {
      return null;
    }

    const parsed = JSON.parse(rawState) as Partial<HomeViewState>;
    if (parsed.queryString !== queryString || !Array.isArray(parsed.releases)) {
      return null;
    }

    return {
      queryString,
      releases: uniqueByReleaseId(parsed.releases),
      hasMore: Boolean(parsed.hasMore),
      scrollY: typeof parsed.scrollY === 'number' ? parsed.scrollY : 0,
    } satisfies HomeViewState;
  } catch {
    return null;
  }
}

function writeHomeViewState(state: HomeViewState) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(HOME_VIEW_STATE_KEY, JSON.stringify(state));
  } catch {
    // If storage is blocked or full, home pagination still works normally.
  }
}

export function HomeReleaseGrid({
  initialReleases,
  queryString,
  lang,
  pageSize = 24,
}: HomeReleaseGridProps) {
  const restoredViewStateRef = useRef<HomeViewState | null>(readHomeViewState(queryString));
  const [releases, setReleases] = useState(() => restoredViewStateRef.current?.releases || uniqueByReleaseId(initialReleases));
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(() => restoredViewStateRef.current?.hasMore ?? initialReleases.length === pageSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestRef = useRef(false);

  useEffect(() => {
    if (restoredViewStateRef.current) {
      return;
    }

    setReleases(uniqueByReleaseId(initialReleases));
    setHasMore(initialReleases.length === pageSize);
    setIsLoading(false);
    requestRef.current = false;
  }, [initialReleases, pageSize]);

  useEffect(() => {
    const restoredState = restoredViewStateRef.current;
    if (!restoredState) {
      return;
    }

    const timeout = window.setTimeout(() => {
      window.scrollTo({ top: restoredState.scrollY, behavior: 'auto' });
      restoredViewStateRef.current = null;
    }, 80);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    writeHomeViewState({
      queryString,
      releases,
      hasMore,
      scrollY: typeof window === 'undefined' ? 0 : window.scrollY,
    });
  }, [hasMore, queryString, releases]);

  useEffect(() => {
    let frame = 0;

    function persistScrollPosition() {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        writeHomeViewState({
          queryString,
          releases,
          hasMore,
          scrollY: window.scrollY,
        });
      });
    }

    window.addEventListener('scroll', persistScrollPosition, { passive: true });
    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener('scroll', persistScrollPosition);
    };
  }, [hasMore, queryString, releases]);

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
