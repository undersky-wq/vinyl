'use client';

import { Heart, ListMusic, Pause, Play, Plus } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPlaylist, getLibraryReleasesFeed } from '../lib/api';
import { SiteLang } from '../lib/language';
import { buildFallbackWaveform, useResponsiveWaveform } from '../lib/waveform';
import { useAuth } from '../providers/auth-provider';
import { useFavorites } from '../providers/favorites-provider';
import { PlayerTrack, usePlayerActions, usePlayerTransport } from '../providers/player-provider';
import { LibraryFeedOptions, PlaylistSummary, Release } from '../types';
import { TrackPlaylistMenu } from './track-actions';

type TracklistBrowserProps = {
  lang: SiteLang;
  releases: Release[];
  playlists: PlaylistSummary[];
  initialFavoriteTrackIds?: string[];
  initialOptions?: LibraryFeedOptions;
  initialHasMore?: boolean;
  initialTotal?: number;
  pageSize?: number;
};

type FeedTrack = PlayerTrack & {
  releaseId: string;
  releaseTitle: string;
  releaseYear: number | null;
  releaseCoverUrl: string;
  position: string | null;
  durationRaw: string | null;
  durationSec?: number | null;
  bpm: number | null;
  keyValue: string | null;
  styles: string[];
  waveformData: number[];
};

type LibraryViewState = {
  releases: Release[];
  hasMore: boolean;
  total: number;
  currentPage: number;
  pageSize: number;
  selectedStyles: string[];
  selectedKeys: string[];
  scrollY: number;
};

const LIBRARY_VIEW_STATE_KEY = 'vinyl-library-view-state';
const LIBRARY_PAGE_SIZE_OPTIONS = [20, 40, 60];
const LIBRARY_VISIBLE_RELEASE_BATCH = 12;

function readLibraryViewState() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawState = window.sessionStorage.getItem(LIBRARY_VIEW_STATE_KEY);
    if (!rawState) {
      return null;
    }

    const parsed = JSON.parse(rawState) as Partial<LibraryViewState> & { styleValue?: string; keyValue?: string };
    if (!Array.isArray(parsed.releases)) {
      return null;
    }

    const selectedStyles = Array.isArray(parsed.selectedStyles)
      ? parsed.selectedStyles.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : typeof parsed.styleValue === 'string' && parsed.styleValue
        ? [parsed.styleValue]
        : [];
    const selectedKeys = Array.isArray(parsed.selectedKeys)
      ? parsed.selectedKeys.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : typeof parsed.keyValue === 'string' && parsed.keyValue
        ? [parsed.keyValue]
        : [];

    return {
      releases: parsed.releases,
      hasMore: Boolean(parsed.hasMore),
      total: typeof parsed.total === 'number' ? parsed.total : parsed.releases.length,
      currentPage: typeof parsed.currentPage === 'number' ? parsed.currentPage : 1,
      pageSize: typeof parsed.pageSize === 'number' ? parsed.pageSize : 40,
      selectedStyles,
      selectedKeys,
      scrollY: typeof parsed.scrollY === 'number' ? parsed.scrollY : 0,
    } satisfies LibraryViewState;
  } catch {
    return null;
  }
}

function writeLibraryViewState(state: LibraryViewState) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(LIBRARY_VIEW_STATE_KEY, JSON.stringify(state));
  } catch {
    // If storage is full or blocked, Library still works normally.
  }
}

function buildFeed(releases: Release[]): FeedTrack[] {
  return releases.flatMap((release) =>
    release.tracks
      .map((track) => ({
        id: track.id,
        title: track.title,
        artist: track.artists?.length ? track.artists.join(', ') : release.artist,
        audioUrl: track.audioFiles.find((file) => file.storageUrl)?.storageUrl || '',
        coverUrl:
          release.coverThumbStorageUrl ||
          release.coverMediumStorageUrl ||
          release.coverStorageUrl ||
          release.coverImageUrl ||
          'https://placehold.co/320x320/png',
        releaseId: release.id,
        releaseTitle: release.title,
        releaseYear: release.year,
        releaseCoverUrl:
          release.coverThumbStorageUrl ||
          release.coverMediumStorageUrl ||
          release.coverStorageUrl ||
          release.coverImageUrl ||
          'https://placehold.co/320x320/png',
        position: track.position,
        durationRaw: track.durationRaw,
        durationSec: track.durationSec,
        bpm: track.bpm,
        keyValue: track.key,
        styles: release.styles,
        waveformData: Array.isArray(track.waveformData)
          ? track.waveformData.filter((value): value is number => typeof value === 'number')
          : [],
      })),
  );
}

function dedupe(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function sortPlaylists(playlists: PlaylistSummary[]) {
  return [...playlists].sort((a, b) => {
    const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return a.name.localeCompare(b.name);
  });
}

function formatTrackDuration(durationRaw?: string | null, durationSec?: number | null) {
  if (durationRaw) {
    return durationRaw;
  }

  if (!durationSec || !Number.isFinite(durationSec)) {
    return '-';
  }

  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function toggleListValue(values: string[], nextValue: string) {
  return values.includes(nextValue)
    ? values.filter((value) => value !== nextValue)
    : [...values, nextValue];
}

function ReleaseWaveform({
  tracks,
  queueTracks,
}: {
  tracks: FeedTrack[];
  queueTracks: FeedTrack[];
}) {
  const { currentTrack } = usePlayerTransport();
  const { playQueueAtPercent, seekToPercent, getAudioElement } = usePlayerActions();
  const currentReleaseTrack = tracks.find((track) => track.id === currentTrack?.id);
  const sourceTrack =
    currentReleaseTrack ||
    tracks.find((track) => track.audioUrl && track.waveformData.length) ||
    tracks.find((track) => track.audioUrl) ||
    tracks.find((track) => track.waveformData.length) ||
    tracks[0];
  const sourcePeaks = sourceTrack?.waveformData.length
    ? sourceTrack.waveformData
    : buildFallbackWaveform(`${sourceTrack?.artist || ''}-${sourceTrack?.title || ''}`);
  const { ref: waveformRef, peaks } = useResponsiveWaveform(sourcePeaks, {
    minBars: 72,
    maxBars: 180,
    pixelsPerBar: 5,
  });
  const [progressPercent, setProgressPercent] = useState(0);
  const currentTrackIndex = currentReleaseTrack
    ? tracks.findIndex((track) => track.id === currentReleaseTrack.id)
    : -1;
  const isCurrentReleasePlaying = Boolean(currentReleaseTrack);

  useEffect(() => {
    const audio = getAudioElement();
    if (!isCurrentReleasePlaying || !audio) {
      setProgressPercent(0);
      return;
    }

    const syncProgress = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        setProgressPercent(0);
        return;
      }

      setProgressPercent((audio.currentTime / audio.duration) * 100);
    };

    syncProgress();
    audio.addEventListener('timeupdate', syncProgress);
    audio.addEventListener('loadedmetadata', syncProgress);
    audio.addEventListener('seeked', syncProgress);

    return () => {
      audio.removeEventListener('timeupdate', syncProgress);
      audio.removeEventListener('loadedmetadata', syncProgress);
      audio.removeEventListener('seeked', syncProgress);
    };
  }, [currentTrack?.id, currentTrackIndex, getAudioElement, isCurrentReleasePlaying]);

  function handleWaveSeek(event: React.MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const percent = ((event.clientX - rect.left) / rect.width) * 100;
    const normalizedPercent = Math.max(0, Math.min(percent, 100));
    const audio = getAudioElement();

    if (isCurrentReleasePlaying && audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      seekToPercent(normalizedPercent);
      return;
    }

    if (!queueTracks.length) {
      return;
    }

    const queueStartIndex = Math.max(
      0,
      queueTracks.findIndex((track) => tracks.some((releaseTrack) => releaseTrack.id === track.id)),
    );
    playQueueAtPercent(queueTracks, queueStartIndex, normalizedPercent);
  }

  return (
    <button
      type="button"
      ref={waveformRef}
      className="library-wave__bars is-decoded"
      onClick={handleWaveSeek}
      aria-label="Seek waveform"
    >
      {peaks.map((peak, index) => (
        <span
          className={`library-wave__bar${
            (index / Math.max(peaks.length - 1, 1)) * 100 <= progressPercent ? ' is-active' : ''
          }`}
          key={`${sourceTrack?.id || 'fallback'}-${index}`}
          style={{ height: `${Math.max(8, Math.round(peak * 100))}%` }}
        />
      ))}
    </button>
  );
}

export function TracklistBrowser({
  lang,
  releases,
  playlists,
  initialFavoriteTrackIds = [],
  initialOptions,
  initialHasMore = false,
  initialTotal = releases.length,
  pageSize = 10,
}: TracklistBrowserProps) {
  const restoredViewStateRef = useRef<LibraryViewState | null>(readLibraryViewState());
  const { requireAuth } = useAuth();
  const { favoriteTrackIds, toggleFavorite } = useFavorites();
  const { currentTrack, isPlaying } = usePlayerTransport();
  const { playQueue, replaceQueuePreservingCurrent, togglePlayback } = usePlayerActions();
  const [selectedStyles, setSelectedStyles] = useState(() => restoredViewStateRef.current?.selectedStyles || []);
  const [selectedKeys, setSelectedKeys] = useState(() => restoredViewStateRef.current?.selectedKeys || []);
  const [localPlaylists, setLocalPlaylists] = useState(() => sortPlaylists(playlists));
  const [isStyleExpanded, setIsStyleExpanded] = useState(false);
  const [isKeyExpanded, setIsKeyExpanded] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [status, setStatus] = useState('');
  const [loadedReleases, setLoadedReleases] = useState(() => restoredViewStateRef.current?.releases || releases);
  const [hasMore, setHasMore] = useState(() => restoredViewStateRef.current?.hasMore ?? initialHasMore);
  const [totalReleases, setTotalReleases] = useState(() => restoredViewStateRef.current?.total ?? initialTotal);
  const [currentPage, setCurrentPage] = useState(() => restoredViewStateRef.current?.currentPage ?? 1);
  const [selectedPageSize, setSelectedPageSize] = useState(
    () => restoredViewStateRef.current?.pageSize ?? pageSize,
  );
  const [isFeedLoading, setIsFeedLoading] = useState(false);
  const [visibleReleaseCount, setVisibleReleaseCount] = useState(LIBRARY_VISIBLE_RELEASE_BATCH);
  const [isMobileFilters, setIsMobileFilters] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 720px)').matches : false,
  );
  const feedLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const requestRef = useRef(false);
  const didMountRef = useRef(false);
  const fullQueueCacheRef = useRef<{ key: string; tracks: PlayerTrack[] } | null>(null);
  const fullQueueRequestRef = useRef<Promise<PlayerTrack[]> | null>(null);
  const selectedStylesKey = selectedStyles.join('|');
  const selectedKeysKey = selectedKeys.join('|');
  const fullQueueCacheKey = `${selectedStylesKey}::${selectedKeysKey}`;

  const feed = useMemo(() => buildFeed(loadedReleases), [loadedReleases]);
  const styles = useMemo(
    () => initialOptions?.styles ?? dedupe(feed.flatMap((track) => track.styles)),
    [feed, initialOptions?.styles],
  );
  const keys = useMemo(
    () => initialOptions?.keys ?? dedupe(feed.map((track) => track.keyValue || '')),
    [feed, initialOptions?.keys],
  );
  const visibleStyles = isStyleExpanded ? styles : selectedStyles;
  const canToggleStyles = styles.length > visibleStyles.length || isStyleExpanded;
  const visibleKeys = isKeyExpanded ? keys : selectedKeys;
  const canToggleKeys = keys.length > visibleKeys.length || isKeyExpanded;

  useEffect(() => {
    setLocalPlaylists(sortPlaylists(playlists));
  }, [playlists]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 720px)');
    const handleChange = () => setIsMobileFilters(media.matches);

    handleChange();
    media.addEventListener('change', handleChange);

    return () => {
      media.removeEventListener('change', handleChange);
    };
  }, []);

  useEffect(() => {
    if (restoredViewStateRef.current) {
      return;
    }

    setLoadedReleases(releases);
    setHasMore(initialHasMore);
    setTotalReleases(initialTotal);
    setCurrentPage(1);
    setSelectedPageSize(pageSize);
    setVisibleReleaseCount(LIBRARY_VISIBLE_RELEASE_BATCH);
    setIsFeedLoading(false);
    requestRef.current = false;
  }, [initialHasMore, initialTotal, pageSize, releases]);

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
    writeLibraryViewState({
      releases: loadedReleases,
      hasMore,
      total: totalReleases,
      currentPage,
      pageSize: selectedPageSize,
      selectedStyles,
      selectedKeys,
      scrollY: typeof window === 'undefined' ? 0 : window.scrollY,
    });
  }, [currentPage, hasMore, loadedReleases, selectedKeysKey, selectedPageSize, selectedStylesKey, totalReleases]);

  useEffect(() => {
    let frame = 0;

    function persistScrollPosition() {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        writeLibraryViewState({
          releases: loadedReleases,
          hasMore,
          total: totalReleases,
          currentPage,
          pageSize: selectedPageSize,
          selectedStyles,
          selectedKeys,
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
  }, [currentPage, hasMore, loadedReleases, selectedKeysKey, selectedPageSize, selectedStylesKey, totalReleases]);

  const loadLibraryFeed = useCallback(async (page: number, nextPageSize = selectedPageSize) => {
    if (requestRef.current) {
      return;
    }

    requestRef.current = true;
    setIsFeedLoading(true);

    const params = new URLSearchParams();
    const safePage = Math.max(1, page);
    params.set('limit', String(nextPageSize));
    params.set('offset', String((safePage - 1) * nextPageSize));
    if (selectedStyles.length) {
      params.set('style', selectedStyles.join(','));
    }
    if (selectedKeys.length) {
      params.set('key', selectedKeys.join(','));
    }

    try {
      const result = await getLibraryReleasesFeed(params);
      setLoadedReleases(result.releases);
      setHasMore(result.hasMore);
      setTotalReleases(result.total);
      setCurrentPage(safePage);
      setSelectedPageSize(nextPageSize);
      setVisibleReleaseCount(LIBRARY_VISIBLE_RELEASE_BATCH);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setStatus(lang === 'ru' ? 'Не удалось загрузить ленту.' : 'Failed to load feed.');
    } finally {
      requestRef.current = false;
      setIsFeedLoading(false);
    }
  }, [lang, selectedKeysKey, selectedPageSize, selectedStylesKey]);

  const buildLibraryFeedParams = useCallback(
    (limit: number, offset: number) => {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      if (selectedStyles.length) {
        params.set('style', selectedStyles.join(','));
      }
      if (selectedKeys.length) {
        params.set('key', selectedKeys.join(','));
      }
      return params;
    },
    [selectedKeysKey, selectedStylesKey],
  );

  const loadFullFilteredQueue = useCallback(async () => {
    if (fullQueueCacheRef.current?.key === fullQueueCacheKey) {
      return fullQueueCacheRef.current.tracks;
    }

    if (fullQueueRequestRef.current) {
      return fullQueueRequestRef.current;
    }

    const pageLimit = 60;
    let offset = 0;
    const releasesForQueue: Release[] = [];

    fullQueueRequestRef.current = (async () => {
      while (true) {
        const result = await getLibraryReleasesFeed(buildLibraryFeedParams(pageLimit, offset));
        releasesForQueue.push(...result.releases);

        if (!result.hasMore || result.releases.length === 0) {
          break;
        }

        offset += pageLimit;
      }

      const tracks = buildFeed(releasesForQueue).filter((track) => Boolean(track.audioUrl));
      fullQueueCacheRef.current = { key: fullQueueCacheKey, tracks };
      fullQueueRequestRef.current = null;
      return tracks;
    })();

    return fullQueueRequestRef.current;
  }, [buildLibraryFeedParams, fullQueueCacheKey]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    void loadLibraryFeed(1);
  }, [loadLibraryFeed, selectedKeysKey, selectedStylesKey]);

  useEffect(() => {
    fullQueueCacheRef.current = null;
    fullQueueRequestRef.current = null;
  }, [selectedKeysKey, selectedStylesKey]);

  useEffect(() => {
    if (loadedReleases.length > 0 || isFeedLoading || totalReleases <= 0) {
      return;
    }

    void loadLibraryFeed(1);
  }, [isFeedLoading, loadLibraryFeed, loadedReleases.length, totalReleases]);

  const filteredFeed = feed.filter((track) => {
    const matchesStyle =
      selectedStyles.length === 0 || selectedStyles.some((style) => track.styles.includes(style));
    const matchesKey = selectedKeys.length === 0 || Boolean(track.keyValue && selectedKeys.includes(track.keyValue));
    return matchesStyle && matchesKey;
  });
  const playableFilteredFeed = filteredFeed.filter((track) => Boolean(track.audioUrl));
  const totalPages = Math.max(1, Math.ceil(totalReleases / selectedPageSize));
  const visiblePageWindowSize = 5;
  const firstVisiblePage = Math.min(
    Math.max(1, currentPage - Math.floor(visiblePageWindowSize / 2)),
    Math.max(1, totalPages - visiblePageWindowSize + 1),
  );
  const visiblePageNumbers = Array.from(
    { length: Math.min(visiblePageWindowSize, totalPages) },
    (_, index) => firstVisiblePage + index,
  );

  const groupedFeed = filteredFeed.reduce<Array<{ release: Release; tracks: FeedTrack[] }>>((acc, track) => {
    const current = acc[acc.length - 1];
    if (current && current.release.id === track.releaseId) {
      current.tracks.push(track);
      return acc;
    }

    const release = loadedReleases.find((item) => item.id === track.releaseId);
    if (!release) {
      return acc;
    }

    acc.push({ release, tracks: [track] });
    return acc;
  }, []);
  const visibleGroupedFeed = groupedFeed.slice(0, visibleReleaseCount);
  const hasHiddenGroupedFeed = visibleReleaseCount < groupedFeed.length;

  useEffect(() => {
    setVisibleReleaseCount(LIBRARY_VISIBLE_RELEASE_BATCH);
  }, [currentPage, selectedKeysKey, selectedPageSize, selectedStylesKey]);

  useEffect(() => {
    const target = feedLoadMoreRef.current;
    if (!target || !hasHiddenGroupedFeed) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) {
          return;
        }

        setVisibleReleaseCount((current) =>
          Math.min(groupedFeed.length, current + LIBRARY_VISIBLE_RELEASE_BATCH),
        );
      },
      {
        rootMargin: '700px 0px',
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [groupedFeed.length, hasHiddenGroupedFeed]);

  async function playFromVisibleFeed(trackId: string) {
    const visibleStartIndex = playableFilteredFeed.findIndex((track) => track.id === trackId);

    if (visibleStartIndex < 0) {
      setStatus(lang === 'ru' ? 'Для этого трека ещё не загружен MP3.' : 'No MP3 uploaded for this track yet.');
      return;
    }

    const visibleTrack = playableFilteredFeed[visibleStartIndex];
    const visibleReleaseQueue = playableFilteredFeed.filter((track) => track.releaseId === visibleTrack.releaseId);
    playQueue(playableFilteredFeed, visibleStartIndex, visibleReleaseQueue);

    loadFullFilteredQueue()
      .then((queue) => {
        const activeIndex = queue.findIndex((track) => track.id === trackId);
        const activeTrack = queue[activeIndex];
        if (activeIndex < 0 || !activeTrack) {
          return;
        }

        const releaseQueue = queue.filter((track) => track.releaseId === activeTrack.releaseId);
        replaceQueuePreservingCurrent(queue, releaseQueue);
      })
      .catch(() => {
        // The current page queue is already playing; keep playback uninterrupted.
      });
  }

  function handlePageSizeChange(nextPageSize: number) {
    if (nextPageSize === selectedPageSize) {
      return;
    }

    void loadLibraryFeed(1, nextPageSize);
  }

  function renderPagination(position: 'top' | 'bottom') {
    if (totalReleases <= 0) {
      return null;
    }

    return (
      <div className={`library-pagination library-pagination--${position}`}>
        <div className="library-pagination__size">
          <span>{lang === 'ru' ? 'На страницу' : 'Per page'}</span>
          <div className="library-pagination__size-buttons">
            {LIBRARY_PAGE_SIZE_OPTIONS.map((option) => (
              <button
                type="button"
                key={option}
                className={option === selectedPageSize ? 'active' : ''}
                onClick={() => handlePageSizeChange(option)}
                disabled={isFeedLoading}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="library-pagination__pages" aria-label={lang === 'ru' ? 'Страницы' : 'Pages'}>
          <button
            type="button"
            className="library-pagination__arrow"
            aria-label={lang === 'ru' ? 'Предыдущая страница' : 'Previous page'}
            onClick={() => void loadLibraryFeed(Math.max(1, currentPage - 1))}
            disabled={isFeedLoading || currentPage <= 1}
          >
            {'<'}
          </button>

          {visiblePageNumbers.map((page) => (
            <button
              type="button"
              key={`${position}-${page}`}
              className={page === currentPage ? 'active' : ''}
              onClick={() => void loadLibraryFeed(page)}
              disabled={isFeedLoading || page === currentPage}
            >
              {page}
            </button>
          ))}

          <button
            type="button"
            className="library-pagination__arrow"
            aria-label={lang === 'ru' ? 'Следующая страница' : 'Next page'}
            onClick={() => void loadLibraryFeed(Math.min(totalPages, currentPage + 1))}
            disabled={isFeedLoading || currentPage >= totalPages}
          >
            {'>'}
          </button>
        </div>
      </div>
    );
  }

  async function handleCreatePlaylist() {
    if (!requireAuth()) {
      return;
    }

    const trimmedName = playlistName.trim();
    if (!trimmedName) {
      setStatus(lang === 'ru' ? 'Сначала введи название плейлиста.' : 'Enter a playlist name first.');
      return;
    }

    try {
      const createdPlaylist = await createPlaylist({
        name: trimmedName,
        description: lang === 'ru' ? 'Создано из библиотеки' : 'Created from library',
      });

      setLocalPlaylists((current) =>
        sortPlaylists([
          {
            id: createdPlaylist.id,
            name: createdPlaylist.name,
            description: createdPlaylist.description,
            sortOrder: createdPlaylist.sortOrder,
            _count: {
              items: createdPlaylist.items.length,
            },
          },
          ...current,
        ]),
      );
      setPlaylistName('');
      setStatus(
        lang === 'ru'
          ? `Плейлист "${trimmedName}" создан.`
          : `Playlist "${trimmedName}" has been created.`,
      );
    } catch {
      setStatus(lang === 'ru' ? 'Не удалось создать плейлист.' : 'Failed to create playlist.');
    }
  }

  return (
    <div className="library-shell">
      <section className="library-main">
        <div className="library-chip-filters">
          <section className={`filters filters--library${isStyleExpanded ? ' expanded' : ''}`}>
            <button
              type="button"
              className={`chip${selectedStyles.length === 0 ? ' active' : ''}`}
              onClick={() => setSelectedStyles([])}
            >
              {lang === 'ru' ? 'Все стили' : 'All styles'}
            </button>

            {visibleStyles.map((style) => (
              <button
                type="button"
                className={`chip${selectedStyles.includes(style) ? ' active' : ''}`}
                key={`library-style-${style}`}
                onClick={() => setSelectedStyles((current) => toggleListValue(current, style))}
              >
                {style}
              </button>
            ))}

            {canToggleStyles ? (
              <button
                type="button"
                className="chip home-style-toggle"
                onClick={() => setIsStyleExpanded((current) => !current)}
                aria-expanded={isStyleExpanded}
              >
                ...
              </button>
            ) : null}
          </section>

          {keys.length ? (
            <section className={`filters filters--library${isKeyExpanded ? ' expanded' : ''}`}>
              <button
                type="button"
                className={`chip${selectedKeys.length === 0 ? ' active' : ''}`}
                onClick={() => setSelectedKeys([])}
              >
                {lang === 'ru' ? 'Все ключи' : 'All keys'}
              </button>

              {visibleKeys.map((key) => (
                <button
                  type="button"
                  className={`chip${selectedKeys.includes(key) ? ' active' : ''}`}
                  key={`library-key-${key}`}
                  onClick={() => setSelectedKeys((current) => toggleListValue(current, key))}
                >
                  {key}
                </button>
              ))}

              {canToggleKeys ? (
                <button
                  type="button"
                  className="chip home-style-toggle"
                  onClick={() => setIsKeyExpanded((current) => !current)}
                  aria-expanded={isKeyExpanded}
                >
                  ...
                </button>
              ) : null}
            </section>
          ) : null}
        </div>

        {renderPagination('top')}

        <div className="library-feed">
          {visibleGroupedFeed.map(({ release, tracks }) => (
            <article className="library-release" key={release.id}>
              <div className="library-release__cover">
                <div className="cover-frame library-release__cover-frame">
                  <Link
                    href={`/releases/${release.id}`}
                    className="cover-link"
                    aria-label={`${release.artist} - ${release.title}`}
                  >
                    <img
                      src={
                        release.coverThumbStorageUrl ||
                        release.coverMediumStorageUrl ||
                        release.coverStorageUrl ||
                        release.coverImageUrl ||
                        'https://placehold.co/320x320/png'
                      }
                      alt={release.title}
                      width={180}
                      height={180}
                      loading="lazy"
                      decoding="async"
                    />
                  </Link>
                </div>
              </div>

              <div className="library-release__body">
                <div className="library-release__headline">
                  <button
                    type="button"
                    className="library-release__play"
                    onClick={() => void playFromVisibleFeed(tracks.find((track) => track.audioUrl)?.id || tracks[0]?.id || '')}
                    aria-label={lang === 'ru' ? 'Воспроизвести релиз' : 'Play release'}
                  >
                    <Play size={27} fill="currentColor" />
                  </button>

                  <div className="library-release__title-group">
                    <div className="library-release__artist">{release.artist}</div>
                    <div className="library-release__title">
                      {release.title}
                      {release.year ? <span className="library-release__year"> • {release.year}</span> : null}
                    </div>
                  </div>
                </div>

                <div className="library-wave">
                  <ReleaseWaveform tracks={tracks} queueTracks={playableFilteredFeed} />
                  <span className="library-wave__duration">
                    {tracks[0]?.durationRaw || tracks[tracks.length - 1]?.durationRaw || '-'}
                  </span>
                </div>

                <div className="library-tracklist">
                  {tracks.map((track, index) => {
                    const isCurrentTrack = currentTrack?.id === track.id;

                    return (
                      <div className={`library-track${isCurrentTrack ? ' active' : ''}`} key={track.id}>
                        <button
                          type="button"
                          className="library-track__thumb"
                          aria-label={isCurrentTrack && isPlaying ? 'Pause' : 'Play'}
                          onClick={() => {
                            if (isCurrentTrack) {
                              togglePlayback();
                              return;
                            }

                            void playFromVisibleFeed(track.id);
                          }}
                        >
                          <img src={track.coverUrl} alt="" width={44} height={44} loading="lazy" decoding="async" />
                          <span className="library-track__thumb-play">
                            {isCurrentTrack && isPlaying ? (
                              <Pause size={21} />
                            ) : (
                              <Play size={21} fill="currentColor" />
                            )}
                          </span>
                        </button>
                        <div className="library-track__index">{track.position || index + 1}</div>

                        <div className="library-track__main">
                          <button
                            type="button"
                            className="library-track__play"
                            aria-label={
                              isCurrentTrack && isPlaying
                                ? lang === 'ru'
                                  ? 'Пауза'
                                  : 'Pause'
                                : lang === 'ru'
                                  ? 'Воспроизвести'
                                  : 'Play'
                            }
                            onClick={() => {
                              if (isCurrentTrack) {
                                togglePlayback();
                                return;
                              }

                              void playFromVisibleFeed(track.id);
                            }}
                          >
                            {isCurrentTrack && isPlaying ? (
                              <Pause size={15} />
                            ) : (
                              <Play size={15} fill="currentColor" />
                            )}
                          </button>

                          <button
                            type="button"
                            className="library-track__name"
                            onClick={() => void playFromVisibleFeed(track.id)}
                          >
                            <span className="library-track__artist">{track.artist}</span>
                            <span className="library-track__title">{track.title}</span>
                          </button>
                        </div>

                        <button
                          type="button"
                          className={`library-track__favorite${
                            favoriteTrackIds.includes(track.id) ? ' active' : ''
                          }`}
                          aria-label={lang === 'ru' ? 'Добавить в избранное' : 'Add to favorites'}
                          onClick={() => toggleFavorite(track.id)}
                        >
                          <Heart size={17} fill="currentColor" />
                        </button>

                        <TrackPlaylistMenu trackId={track.id} lang={lang} />

                        <div className="library-track__time muted">
                          {formatTrackDuration(track.durationRaw, track.durationSec)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {release.styles.length ? (
                  <div className="library-release__footer" aria-label={lang === 'ru' ? 'Стили релиза' : 'Release styles'}>
                    {release.styles.map((style) => (
                      <span
                        className={`chip library-release__style-chip${
                          selectedStyles.includes(style) ? ' active' : ''
                        }`}
                        key={style}
                      >
                        {style}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          ))}

          {hasHiddenGroupedFeed ? (
            <div className="library-feed__sentinel" ref={feedLoadMoreRef}>
              {lang === 'ru' ? 'Подгружаем обложки...' : 'Loading covers...'}
            </div>
          ) : null}
        </div>

        {renderPagination('bottom')}

        {isFeedLoading ? (
          <p className="home-grid-status muted">
            {lang === 'ru' ? 'Загружаем релизы...' : 'Loading releases...'}
          </p>
        ) : null}
      </section>

      <aside className="library-sidebar">
        {status ? (
          <section className="release-panel library-stats">
            <p className="muted">{status}</p>
          </section>
        ) : null}

        <section className="release-panel tracklist-saved">
          <div className="tracklist-draft__header">
            <h2>
              <ListMusic size={16} />
              <span>Playlist</span>
            </h2>
            <span className="muted">{localPlaylists.length}</span>
          </div>

          <div className="tracklist-draft__inline-create">
            <input
              value={playlistName}
              onChange={(event) => setPlaylistName(event.target.value)}
              placeholder={lang === 'ru' ? 'Добавить плейлист' : 'Add playlist'}
            />
            <button type="button" className="track-icon-button" onClick={() => void handleCreatePlaylist()}>
              <Plus size={16} />
            </button>
          </div>

          <div className="tracklist-draft__list">
            {localPlaylists.length ? (
              localPlaylists.map((playlist) => (
                <Link
                  href={`/playlists?playlist=${encodeURIComponent(playlist.id)}`}
                  className="tracklist-draft__item tracklist-draft__item--playlist"
                  key={playlist.id}
                >
                  <div className="tracklist-draft__playlist-name">{playlist.name}</div>
                  <div className="muted">
                    {lang === 'ru' ? `${playlist._count.items} треков` : `${playlist._count.items} tracks`}
                  </div>
                </Link>
              ))
            ) : (
              <p className="muted">
                {lang === 'ru'
                  ? 'Плейлисты появятся здесь сразу после создания.'
                  : 'Your playlists will appear here as soon as you create one.'}
              </p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
