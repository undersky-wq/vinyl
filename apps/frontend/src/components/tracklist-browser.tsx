'use client';

import { Check, ChevronDown, Heart, ListMusic, Pause, Play, Plus } from 'lucide-react';
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

type FilterKey = 'style' | 'artist' | 'key' | null;
type LibraryViewState = {
  releases: Release[];
  hasMore: boolean;
  total: number;
  currentPage: number;
  pageSize: number;
  styleValue: string;
  artist: string;
  keyValue: string;
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

    const parsed = JSON.parse(rawState) as Partial<LibraryViewState>;
    if (!Array.isArray(parsed.releases)) {
      return null;
    }

    return {
      releases: parsed.releases,
      hasMore: Boolean(parsed.hasMore),
      total: typeof parsed.total === 'number' ? parsed.total : parsed.releases.length,
      currentPage: typeof parsed.currentPage === 'number' ? parsed.currentPage : 1,
      pageSize: typeof parsed.pageSize === 'number' ? parsed.pageSize : 40,
      styleValue: parsed.styleValue || '',
      artist: parsed.artist || '',
      keyValue: parsed.keyValue || '',
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
  return [...playlists].sort((a, b) => a.name.localeCompare(b.name));
}

function getFilterLabel(params: {
  lang: SiteLang;
  filter: Exclude<FilterKey, null>;
  value: string;
}) {
  if (params.value) {
    return params.value;
  }

  if (params.filter === 'style') {
    return params.lang === 'ru' ? 'Стиль' : 'Style';
  }

  if (params.filter === 'artist') {
    return params.lang === 'ru' ? 'Все артисты' : 'All artists';
  }

  return params.lang === 'ru' ? 'Все ключи' : 'All keys';
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
  const { playQueue, togglePlayback } = usePlayerActions();
  const [styleValue, setStyleValue] = useState(() => restoredViewStateRef.current?.styleValue || '');
  const [artist, setArtist] = useState(() => restoredViewStateRef.current?.artist || '');
  const [keyValue, setKeyValue] = useState(() => restoredViewStateRef.current?.keyValue || '');
  const [localPlaylists, setLocalPlaylists] = useState(() => sortPlaylists(playlists));
  const [openFilter, setOpenFilter] = useState<FilterKey>(null);
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
  const filterRef = useRef<HTMLDivElement | null>(null);
  const feedLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const requestRef = useRef(false);
  const didMountRef = useRef(false);

  const feed = useMemo(() => buildFeed(loadedReleases), [loadedReleases]);
  const styles = useMemo(
    () => initialOptions?.styles ?? dedupe(feed.flatMap((track) => track.styles)),
    [feed, initialOptions?.styles],
  );
  const artists = useMemo(
    () => initialOptions?.artists ?? dedupe(feed.map((track) => track.artist)),
    [feed, initialOptions?.artists],
  );
  const keys = useMemo(
    () => initialOptions?.keys ?? dedupe(feed.map((track) => track.keyValue || '')),
    [feed, initialOptions?.keys],
  );

  useEffect(() => {
    setLocalPlaylists(sortPlaylists(playlists));
  }, [playlists]);

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
      styleValue,
      artist,
      keyValue,
      scrollY: typeof window === 'undefined' ? 0 : window.scrollY,
    });
  }, [artist, currentPage, hasMore, keyValue, loadedReleases, selectedPageSize, styleValue, totalReleases]);

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
          styleValue,
          artist,
          keyValue,
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
  }, [artist, currentPage, hasMore, keyValue, loadedReleases, selectedPageSize, styleValue, totalReleases]);

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
    if (styleValue) {
      params.set('style', styleValue);
    }
    if (artist) {
      params.set('artist', artist);
    }
    if (keyValue) {
      params.set('key', keyValue);
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
  }, [artist, keyValue, lang, selectedPageSize, styleValue]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    void loadLibraryFeed(1);
  }, [artist, keyValue, loadLibraryFeed, styleValue]);

  useEffect(() => {
    if (loadedReleases.length > 0 || isFeedLoading || totalReleases <= 0) {
      return;
    }

    void loadLibraryFeed(1);
  }, [isFeedLoading, loadLibraryFeed, loadedReleases.length, totalReleases]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;

      if (filterRef.current && !filterRef.current.contains(target)) {
        setOpenFilter(null);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const filteredFeed = feed.filter((track) => {
    const matchesStyle = !styleValue || track.styles.includes(styleValue);
    const matchesArtist = !artist || track.artist === artist;
    const matchesKey = !keyValue || track.keyValue === keyValue;
    return matchesStyle && matchesArtist && matchesKey;
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
  }, [artist, currentPage, keyValue, selectedPageSize, styleValue]);

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

  function playFromVisibleFeed(trackId: string) {
    const startIndex = playableFilteredFeed.findIndex((track) => track.id === trackId);
    const activeTrack = playableFilteredFeed[startIndex];
    const releaseQueue = activeTrack
      ? playableFilteredFeed.filter((track) => track.releaseId === activeTrack.releaseId)
      : [];

    if (startIndex < 0) {
      setStatus(lang === 'ru' ? 'Для этого трека ещё не загружен MP3.' : 'No MP3 uploaded for this track yet.');
      return;
    }

    playQueue(playableFilteredFeed, startIndex, releaseQueue);
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

  function renderFilterMenu(
    filter: Exclude<FilterKey, null>,
    label: string,
    value: string,
    items: string[],
    onSelect: (nextValue: string) => void,
  ) {
    const isOpen = openFilter === filter;

    return (
      <div className="library-filter library-filter--menu">
        <span className="library-filter__label">{label}</span>
        <div className="library-filter__menu-shell" ref={isOpen ? filterRef : null}>
          <button
            type="button"
            className={`library-filter__trigger${isOpen ? ' active' : ''}${value ? ' selected' : ''}`}
            onClick={() => setOpenFilter((current) => (current === filter ? null : filter))}
          >
            <span>{getFilterLabel({ lang, filter, value })}</span>
            <ChevronDown size={16} />
          </button>

          {isOpen ? (
            <div className="library-filter__menu">
              <button
                type="button"
                className={`library-filter__menu-item${!value ? ' selected' : ''}`}
                onClick={() => {
                  onSelect('');
                  setOpenFilter(null);
                }}
              >
                <span>{getFilterLabel({ lang, filter, value: '' })}</span>
                {!value ? <Check size={14} /> : null}
              </button>

              {items.map((item) => (
                <button
                  type="button"
                  key={`${filter}-${item}`}
                  className={`library-filter__menu-item${value === item ? ' selected' : ''}`}
                  onClick={() => {
                    onSelect(item);
                    setOpenFilter(null);
                  }}
                >
                  <span>{item}</span>
                  {value === item ? <Check size={14} /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="library-shell">
      <section className="library-main">
        <div className="library-toolbar library-toolbar--filters-only">
          {renderFilterMenu('style', lang === 'ru' ? 'Стиль' : 'Style', styleValue, styles, setStyleValue)}
          {renderFilterMenu('artist', lang === 'ru' ? 'Артист' : 'Artist', artist, artists, setArtist)}
          {renderFilterMenu('key', lang === 'ru' ? 'Ключ' : 'Key', keyValue, keys, setKeyValue)}
        </div>

        <div className="library-heading">
          <h2>{lang === 'ru' ? 'Лента релизов' : 'Release feed'}</h2>
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
                    onClick={() => playFromVisibleFeed(tracks.find((track) => track.audioUrl)?.id || tracks[0]?.id || '')}
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

                            playFromVisibleFeed(track.id);
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

                              playFromVisibleFeed(track.id);
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
                            onClick={() => playFromVisibleFeed(track.id)}
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
