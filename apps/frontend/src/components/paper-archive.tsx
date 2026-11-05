'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HomeRelease } from '../types';
import { SiteLang } from '../lib/language';
import { usePlayerActions, usePlayerTransport, type PlayerTrack } from '../providers/player-provider';
import './record-archive.css';
import './archive-render-stability.css';
import { normalizeDurationLabel } from '../lib/time';
import { useAuth } from '../providers/auth-provider';
import { usePlaylists } from '../providers/playlists-provider';
import { FavoriteButton, TrackPlaylistMenu } from './track-actions';
import { Heart, Library, ListMusic, Disc3, AudioLines, Plus, Rotate3D, ChevronDown } from 'lucide-react';
import { MobileCollectionPicker, type MobileCollectionSection } from './mobile-collection-picker';
import { useCollectionCounts } from './use-collection-counts';
import { ShelfMixTrack } from './shelf-mix-track';
import { ArchivePageHeader } from './archive-page-header';
import { getHomeReleaseDetails, getHomeReleases, getCollectionPlaybackQueue } from '../lib/api';
import { liveCollectionQueue } from '../lib/collection-playback-queue';
import { ShelfReleaseYear } from './shelf-release-editor';
import { shelfMobileLayout } from '../lib/shelf-mobile-layout';
import { COLLECTION_LAYOUT_DURATION, collectionLayoutProgress, mergeVisibleReleaseIndices, extrapolateStackCoverFrame } from '../lib/collection-layout-motion';
import { CollectionPosition } from './collection-position';
import { CollectionNavigator } from './collection-navigator';
import { collectionGridGeometry, gridNavigatorPositions, stackNavigatorState, stackNavigatorTravel } from '../lib/collection-navigator';
import { getBackCoverUrl, getSecondFrontCoverUrl, isBackSidePosition, vinylDisc } from '../lib/release-images';
import { collapseReleaseCoverSide, releaseCoverSide, toggleReleaseCoverSide, trackRowCoverSide, type CoverSideOverrides } from '../lib/release-cover-side';
import { retryCoverImage } from '../lib/retry-cover-image';
import { warmCoverImages } from '../lib/warm-cover-images';
import { ShelfDiscTransition, decodeCover } from './shelf-disc-transition';
import { coverResolutionMedia, mobileDeckCoverSize } from '../lib/cover-sources';
import { positionStackHoverLabel } from '../lib/stack-hover-position';
import { getPinnedGenres } from '../lib/pinned-genres';
import { frameMeasurement, observeCardHeights, setLayoutProperties } from '../lib/layout-measurement';
import { archiveScrollTransform } from '../lib/archive-scroll-transform';
import { coverCompositorFrames, coverEntryFrame, type CoverEntryScene } from '../lib/cover-compositor-motion';
const coverFull = (r: HomeRelease, disc: 1 | 2 = 1) => (disc === 2 ? getSecondFrontCoverUrl(r) : '') || r.coverStorageUrl || r.coverImageUrl || r.coverMediumStorageUrl || r.coverThumbStorageUrl || '/icon.png';
const coverMobile = (r: HomeRelease, disc: 1 | 2 = 1) => disc === 2 ? getSecondFrontCoverUrl(r, 'thumb') || coverFull(r,disc) : r.coverThumbStorageUrl || r.coverMediumStorageUrl || coverFull(r);
const coverMedium = (r: HomeRelease, disc: 1 | 2 = 1) => disc === 2 ? getSecondFrontCoverUrl(r, 'medium') || coverFull(r,disc) : r.coverMediumStorageUrl || coverFull(r);
const cover = coverFull;
const MAX_SELECTED_STYLES = 5;

function useDecodedCover(url: string, enabled: boolean) {
  const [decoded, setDecoded] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !url || decoded === url) return;
    let cancelled = false;
    void decodeCover(url).then(ready => {
      if (ready && !cancelled) setDecoded(url);
    });
    return () => { cancelled = true; };
  }, [url, enabled, decoded]);
  return decoded === url;
}

function ShelfCoverImage({ release, disc = 1, flipped, eager, priority, selected, highQuality, displaySize, desktopViewport = false, compactPreview = false, deckPreview = false }: { release: HomeRelease; disc?: 1 | 2; flipped: boolean; eager: boolean; priority: boolean; selected: boolean; highQuality: boolean; displaySize: number; desktopViewport?: boolean; compactPreview?: boolean; deckPreview?: boolean }) {
  // Desktop always uses originals. Mobile selects a rendition by the sleeve
  // size and screen density, then loads the original on full expansion.
  // Off-screen records remain lazy-loaded rather than fetching the whole library.
  const full = coverFull(release, disc);
  const back = getBackCoverUrl(release, disc);
  const thumb = coverMobile(release, disc);
  const medium = coverMedium(release, disc);
  const backThumb = getBackCoverUrl(release, disc, 'thumb');
  const backMedium = getBackCoverUrl(release, disc, 'medium');
  const media = coverResolutionMedia(displaySize);
  const useMedium = !compactPreview && typeof window !== 'undefined' && window.matchMedia(media).matches;
  const originalPreview = highQuality || (typeof window !== 'undefined' && window.matchMedia('(min-width:701px)').matches);
  const prepareMedium = !deckPreview && useMedium && !originalPreview && !desktopViewport && (eager || selected);
  // Mobile decks start with the same quality in Shelf and Stack, including SSR.
  // There is no thumbnail-to-medium source replacement while moving the deck.
  const frontReady = useDecodedCover(medium, prepareMedium && !flipped && medium !== thumb);
  const backReady = useDecodedCover(backMedium, prepareMedium && flipped && backMedium !== backThumb);
  return <ShelfDiscTransition disc={disc} flipped={flipped} sources={[originalPreview ? full : deckPreview || frontReady ? medium : thumb, originalPreview ? back : deckPreview || backReady ? backMedium : backThumb]}>
    <span className="paper-record-face paper-record-front">
      <picture style={{display:'contents'}}>
      <source media="(min-width:701px)" srcSet={full} />
      {deckPreview && <source media="(max-width:700px)" srcSet={medium} />}
      {!compactPreview && desktopViewport && <source media="(max-width:700px)" srcSet={thumb} />}
      {!deckPreview && frontReady && medium !== thumb && <source media="(max-width:700px)" srcSet={medium} />}
      <img src={thumb} alt="" width={900} height={900} loading={eager ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} decoding="async" draggable={false} onError={event => { retryCoverImage(event.currentTarget); }} />
      </picture>
      {highQuality && !desktopViewport && full !== thumb ? <img className="paper-record-hires" src={full} alt="" width={900} height={900} loading="eager" fetchPriority="high" decoding="async" draggable={false} onError={event => { retryCoverImage(event.currentTarget); }} /> : null}
    </span>
    {back ? <span className="paper-record-face paper-record-back"><picture style={{display:'contents'}}>
      <source media="(min-width:701px)" srcSet={back} />
      {deckPreview && <source media="(max-width:700px)" srcSet={backMedium} />}
      {!compactPreview && desktopViewport && <source media="(max-width:700px)" srcSet={backThumb} />}
      {!deckPreview && backReady && backMedium !== backThumb && <source media="(max-width:700px)" srcSet={backMedium} />}
      <img src={backThumb} alt="" width={900} height={900} loading={selected ? 'eager' : 'lazy'} decoding="async" draggable={false} onError={event => { retryCoverImage(event.currentTarget); }}/>
      </picture>{highQuality && !desktopViewport && back !== backThumb ? <img className="paper-record-hires" src={back} alt="" width={900} height={900} loading="eager" decoding="async" draggable={false} onError={event=>{retryCoverImage(event.currentTarget);}}/> : null}</span> : null}
  </ShelfDiscTransition>;
}

function normalizeStyleSelection(values: string[], allowedStyles: Set<string>) {
  return [...new Set(values.map(value => value.trim()).filter(value => value && allowedStyles.has(value)))]
    .sort((a,b) => a.localeCompare(b))
    .slice(0, MAX_SELECTED_STYLES);
}

function replaceStyleHash(styles: string[]) {
  if (typeof window === 'undefined') return;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  if (styles.length) hash.set('styles', styles.join(','));
  else hash.delete('styles');
  const nextHash = hash.toString();
  const nextUrl = `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ''}`;
  window.history.replaceState(window.history.state, '', nextUrl);
}
// Seeded by release ID: identical on the server, after hydration and on re-render.
function sleeveVariation(id: string) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const seed = hash >>> 0;
  return { gap: 17 + (seed % 15), rise: -((seed >>> 8) % 29) };
}

export function RecordShelfStage({ releases: allReleases, lang, favoritesMode = false, mixesMode = false, originalsMode = false, collectionCount, mixCount, originalCount, initialSearch = '' }: { releases: HomeRelease[]; lang: SiteLang; favoritesMode?: boolean; mixesMode?: boolean; originalsMode?: boolean; collectionCount?: number; mixCount?: number; originalCount?: number; initialSearch?: string }) {
  const router = useRouter();
  const routeParams = useSearchParams();
  const compositorScroll = true;
  const sourceFocus = routeParams.get('focusTrack');
  const sourceRelease = routeParams.get('focusRelease');
  const sourcePlaylist = routeParams.get('playlist');
  const sourceSearch = routeParams.get('search') || '';
  const handledSourceFocus = useRef<string | null>(null);
  const [pendingSourceFocus,setPendingSourceFocus] = useState<{trackId:string;releaseId:string|null}|null>(null);
  const [uiLang,setUiLang] = useState<SiteLang>(lang);
  useEffect(() => setUiLang(lang),[lang]);
  useEffect(() => {
    const update = (event: Event) => setUiLang((event as CustomEvent<SiteLang>).detail);
    window.addEventListener('vinyl:language-change',update);
    return () => window.removeEventListener('vinyl:language-change',update);
  },[]);
  const ru = uiLang === 'ru';
  const { user } = useAuth();
  const [releaseDetails, setReleaseDetails] = useState<Record<string, HomeRelease>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, boolean>>({});
  const detailRequests = useRef(new Map<string, Promise<HomeRelease>>());
  const detailGeneration = useRef(0);
  useEffect(() => {
    const reset = () => { detailGeneration.current++; detailRequests.current.clear(); setReleaseDetails({}); setDetailErrors({}); };
    window.addEventListener('vinyl:release-updated', reset);
    return () => window.removeEventListener('vinyl:release-updated', reset);
  }, []);
  const detailSlots = useRef(0);
  const detailWaiters = useRef<Array<() => void>>([]);
  async function fetchReleaseDetails(id: string) {
    if (detailSlots.current >= 3) await new Promise<void>(resolve => detailWaiters.current.push(resolve));
    else detailSlots.current++;
    try { return await getHomeReleaseDetails(id); }
    finally {
      const next = detailWaiters.current.shift();
      if (next) next();
      else detailSlots.current--;
    }
  }
  useEffect(() => {
    detailGeneration.current++;
    detailRequests.current.clear();
    setReleaseDetails({});
    setDetailErrors({});
  }, [user?.id]);
  function loadReleaseDetails(id: string) {
    const pending = detailRequests.current.get(id);
    if (pending) return pending;
    const generation = detailGeneration.current;
    const request = fetchReleaseDetails(id).then(detail => {
      if (generation === detailGeneration.current) {
        setReleaseDetails(current => ({ ...current, [id]: detail }));
        setDetailErrors(current => ({ ...current, [id]: false }));
      }
      return detail;
    }).catch(error => {
      if (generation === detailGeneration.current) setDetailErrors(current => ({ ...current, [id]: true }));
      throw error;
    }).finally(() => {
      if (detailRequests.current.get(id) === request) detailRequests.current.delete(id);
    });
    detailRequests.current.set(id, request);
    return request;
  }
  const counts = useCollectionCounts();
  const { playlists, isLoading: playlistsLoading, reorderTracks } = usePlaylists();
  const [orderStatus, setOrderStatus] = useState('');
  const [savingOrder, setSavingOrder] = useState(false);
  const [dragTrack, setDragTrack] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ trackId: string; side: 'before' | 'after' } | null>(null);
  const suppressTrackClick = useRef(0);
  const suppressCoverClick = useRef(0);
  const initialRouteApplied = useRef(false);
  const [activePlaylist, setActivePlaylist] = useState<string | null>(null);
  const isTrackCollection = Boolean(activePlaylist) || favoritesMode;
  const collectionView = !isTrackCollection && !mixesMode && !originalsMode && !favoritesMode && !activePlaylist;
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [mobilePicker, setMobilePicker] = useState<'sections' | 'genres' | 'playlists' | 'music' | null>(null);
  const [pendingSection, setPendingSection] = useState<'collection'|'playlists'|'mixes'|'originals'|'favorites'|null>(null);
  const [playlistTransition, setPlaylistTransition] = useState(false);
  const [search, setSearch] = useState(initialSearch);
  const [appliedSearch, setAppliedSearch] = useState(initialSearch);
  const [searchCatalog, setSearchCatalog] = useState<HomeRelease[] | null>(null);
  const searchCatalogRequest = useRef<Promise<HomeRelease[]> | null>(null);
  const [searchStatus, setSearchStatus] = useState('');
  useEffect(() => {
    if (!search.trim()) { setSearchStatus(''); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      if (mixesMode || favoritesMode || activePlaylist) {
        router.push(`/?search=${encodeURIComponent(search.trim())}`, {scroll:false});
        return;
      }
      if (searchCatalog) return;
      setSearchStatus(ru ? 'Поиск…' : 'Searching…');
      const request = searchCatalogRequest.current || getHomeReleases(new URLSearchParams({catalog:'true',allTypes:'true'}));
      searchCatalogRequest.current = request;
      void request.then(data => {
        if (!cancelled) {setSearchCatalog(data);setSearchStatus('');}
      }).catch(() => {if(searchCatalogRequest.current===request)searchCatalogRequest.current=null;if(!cancelled)setSearchStatus(ru?'Ошибка поиска. Повторите запрос.':'Search failed. Try again.');});
    }, 350);
    return () => {cancelled=true;clearTimeout(timer);};
  }, [search, searchCatalog, mixesMode, favoritesMode, activePlaylist, router, ru]);
  const [stretch, setStretch] = useState(0);
  const [stackMode, setStackMode] = useState(false);
  useLayoutEffect(() => {
    const layout = new URLSearchParams(window.location.search).get('layout');
    setStackMode(layout === 'stack');
    setStretch(layout === 'tracks' ? 2 : layout === 'grid' ? 1 : layout === 'stack' || layout === 'shelf' ? 0 : favoritesMode || mixesMode ? 2 : 0);
    const url = new URL(window.location.href);
    if (url.searchParams.has('reveal')) {
      url.searchParams.delete('reveal');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
  }, []);
  const [stackSpread, setStackSpread] = useState(false);
  const [stackTransitioning, setStackTransitioning] = useState(false);
  const stackGridFrames = useRef<Map<string, Keyframe> | null>(null);
  const stackGridAnimations = useRef<Animation[]>([]);
  const stackTransitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [shelfTransitioning, setShelfTransitioning] = useState(false);
  const shelfTransitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function protectShelfTransition() {
    if (shelfTransitionTimer.current) clearTimeout(shelfTransitionTimer.current);
    setShelfTransitioning(true);
    shelfTransitionTimer.current = setTimeout(() => {
      shelfTransitionTimer.current = null;
      setShelfTransitioning(false);
    }, 1450);
  }
  const layoutFrame = useRef(0);
  const [autoLayout, setAutoLayout] = useState(false);
  function stopAutoLayout() {
    cancelAnimationFrame(layoutFrame.current);
    layoutFrame.current = 0;
    setAutoLayout(false);
    setDragLayout(null);
  }
  useEffect(() => () => {
    cancelAnimationFrame(layoutFrame.current);
    if (shelfTransitionTimer.current) clearTimeout(shelfTransitionTimer.current);
    if (stackTransitionTimer.current) clearTimeout(stackTransitionTimer.current);
  }, []);
  const [viewport, setViewport] = useState({ width: 1280, height: 720 });
  const [gridPan, setGridPan] = useState(0);
  const [gridBounds, setGridBounds] = useState({ top: 88, bottom: 84 });
  const [mobileGeometry, setMobileGeometry] = useState({ coverSize:180, shelfFloor:446 });
  const middleDrag = useRef<{ y: number; mode: number; progress: number; anchor: number } | null>(null);
  const [dragLayout, setDragLayout] = useState<number | null>(null);
  const touchDrag = useRef<{ x: number; y: number; stackScale: number; travel: number; selected: number | null; step: number; lastOffset: number; lastTime: number; velocity: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Snap the endpoint: (1 - .55) / .45 can be 0.9999999999999999.
  // Without this, the grid's scrolling and opening styles never activate.
  const gridMix = dragLayout !== null ? Math.max(0, Math.min(1, dragLayout - 1)) : stretch >= .999 ? 1 : Math.max(0, (stretch - .55) / .45);
  const listMix = Math.max(0, Math.min(1, stretch - 1));
  const activeLayout = dragLayout !== null
    ? dragLayout < .5 ? 'shelf' : dragLayout < 1.5 ? 'stack' : dragLayout < 2.5 ? 'grid' : 'tracks'
    : stackMode ? 'stack' : stretch < .5 ? 'shelf' : stretch < 1.5 ? 'grid' : 'tracks';
  // A tiny overshoot past the grid is still a cover view, not a playable row.
  const isTrackListInteractive = listMix > .85;
  const [listPan, setListPan] = useState(0);
  // Quantized scroll snapshots only update the mounted window, not every frame.
  const [windowTravel, setWindowTravel] = useState(0);
  const [windowScroll, setWindowScroll] = useState(0);
  const columns = viewport.width <= 700 ? 4 : 5;
  const gridGap = viewport.width <= 700 ? 6 : 20;
  const sleeveSize = viewport.width <= 700 ? mobileGeometry.coverSize : Math.max(180, Math.min(280, viewport.width * .18));
  const { size: gridSize, left: gridLeft } = collectionGridGeometry(viewport.width, columns, gridGap, sleeveSize, collectionView);
  const cell = gridSize + gridGap;
  const listSize = isTrackCollection ? 40 : viewport.width <= 700 ? 72 : Math.min(sleeveSize, viewport.width * .24);
  const sideSize = gridSize;
  // Reveal almost half of each sleeve, while reserving the expanded cover
  // and its tracklist in the middle. Three sleeves share the wider left fan.
  const expandedSize = Math.min(viewport.width * (viewport.width <= 700 ? .74 : .4), viewport.height * (viewport.width <= 700 ? .38 : .46));
  const sideStep = viewport.width <= 700
    ? gridSize * .42
    : Math.max(0, Math.min(gridSize * .48, ((viewport.width - expandedSize) / 2 - sideSize - 40) / 2));
  const [activeStyles, setActiveStyles] = useState<string[]>([]);
  const activeStylesRef = useRef<string[]>([]);
  const styleScroller = useRef<HTMLDivElement>(null);
  const [pinnedStyles, setPinnedStyles] = useState<string[]>([]);
  const [bottomPinnedStyles, setBottomPinnedStyles] = useState<string[]>([]);
  function updatePinnedStyles() {
    const scroller = styleScroller.current;
    if (!scroller) return;
    const rows = Array.from(scroller.querySelectorAll<HTMLButtonElement>('button[data-style]'))
      .map(button => ({ style: button.dataset.style!, top: button.offsetTop, height: button.offsetHeight }));
    const next = getPinnedGenres(rows, activeStyles, scroller.scrollTop, scroller.clientHeight);
    setPinnedStyles(previous => previous.length === next.top.length && previous.every((style, i) => style === next.top[i]) ? previous : next.top);
    setBottomPinnedStyles(previous => previous.length === next.bottom.length && previous.every((style, i) => style === next.bottom[i]) ? previous : next.bottom);
  }
  const [filtering, setFiltering] = useState(false);
  const filterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingReveal = useRef<string | null>(null);
  const pendingShelfCenter = useRef(false);
  const [openMixComments,setOpenMixComments] = useState<Map<string,number>>(() => new Map());
  const releases = useMemo(() => {
    const words = appliedSearch.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const playlist = playlists.find(p => p.id === activePlaylist);
    // Keep each playlist item separate, including non-adjacent tracks of one release.
    const source: HomeRelease[] = playlist ? [...playlist.items].sort((a,b) => a.sortOrder-b.sortOrder).map(item => ({
      ...item.track.release,
      tracks: [{...item.track, audioUrl: item.track.audioFiles?.find(f => f.storageUrl)?.storageUrl || ''}],
    })) : (appliedSearch ? searchCatalog || allReleases : mixesMode || favoritesMode ? allReleases : allReleases.filter(r=>!r.isMix)).map(r => releaseDetails[r.id] ? { ...r, ...releaseDetails[r.id], tracks: favoritesMode ? r.tracks : releaseDetails[r.id].tracks } : r);
    return source.filter(r => (!activeStyles.length || r.styles.some(style => activeStyles.includes(style))) && words.every(word => `${r.artist} ${r.title} ${r.trackSearchText || r.tracks.map(t => t.title).join(' ')}`.toLocaleLowerCase().includes(word)));
  }, [allReleases, searchCatalog, releaseDetails, activeStyles, appliedSearch, activePlaylist, playlists, mixesMode, favoritesMode]);
  const [mobileCardHeights, setMobileCardHeights] = useState<Record<string, number>>({});
  const listLayout = useMemo(() => {
    // Full-width playlist rows begin below the persistent playlist selector.
    let y = gridBounds.top + 16;
    const mobile = viewport.width <= 700;
    const positions = releases.map(r => {
      const top = y;
      const commentCount = openMixComments.get(r.id);
      const commentsSpace = mobile || commentCount === undefined ? 0 : Math.min(250, 74 + commentCount * 46);
      const count = r.trackCount ?? r.tracks.length;
      const estimatedHeight = (mixesMode && mobile ? 260 : isTrackCollection ? 52 : mobile ? Math.max(listSize, 92 + count * 28) + 24 : Math.max(listSize, 114 + count * 36) + 56) + commentsSpace;
      y += mobile && !isTrackCollection
        ? Math.max(estimatedHeight, (mobileCardHeights[r.id] ?? 0) + 48)
        : estimatedHeight;
      return top;
    });
    return { positions, height: y + gridBounds.bottom };
  }, [releases, listSize, gridBounds, isTrackCollection, playlists.length, viewport, mixesMode, originalsMode, openMixComments, mobileCardHeights]);
  const navigatorPositions = useMemo(() => listMix >= 1 ? listLayout.positions : gridNavigatorPositions(releases.length, columns, gridBounds.top, cell),
    [listMix, listLayout.positions, releases.length, columns, gridBounds.top, cell]);
  const styleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    allReleases.forEach(r => new Set(r.styles.filter(Boolean)).forEach(style => counts.set(style, (counts.get(style) || 0) + 1)));
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [allReleases]);
  useEffect(() => { updatePinnedStyles(); }, [activeStyles, styleCounts, viewport.width, viewport.height]);
  useEffect(() => {
    if (mixesMode || favoritesMode) return;
    const allowedStyles = new Set(styleCounts.map(([style]) => style));
    const applyHashSelection = () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const selected = normalizeStyleSelection((hash.get('styles') || '').split(','), allowedStyles);
      activeStylesRef.current = selected;
      setActiveStyles(selected);
      replaceStyleHash(selected);
    };
    applyHashSelection();
    window.addEventListener('hashchange', applyHashSelection);
    return () => window.removeEventListener('hashchange', applyHashSelection);
  }, [styleCounts, mixesMode, favoritesMode]);
  useEffect(() => () => { if (filterTimer.current) clearTimeout(filterTimer.current); }, []);
  const baseSleeves = useMemo(() => {
    let position = 0;
    return releases.map(r => {
      const variation = sleeveVariation(r.id);
      const sleeve = { position, rise: variation.rise };
      position += variation.gap;
      return sleeve;
    });
  }, [releases]);
  const sleeves = useMemo(() => baseSleeves.map(sleeve => ({
    ...sleeve, position: sleeve.position * (1 + Math.min(stretch,1) * 2),
  })), [baseSleeves, stretch]);
  const stackNavigatorPositions = useMemo(() => sleeves.map(sleeve => sleeve.position), [sleeves]);
  const [selected, setSelected] = useState<number | null>(null);
  const [coverSideOverrides, setCoverSideOverrides] = useState<CoverSideOverrides>({});
  const [expanded, setExpanded] = useState(false);
  const stage = useRef<HTMLElement | null>(null);
  const transport = useRef<HTMLDivElement | null>(null);
  const transportOrigin = useRef(0);
  const hoverResumeAt = useRef(0);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) => setViewport(current => current.width === entry.contentRect.width && current.height === entry.contentRect.height ? current : { width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  const travel = useRef({ current: 0, target: 0 });
  const scrollFrame = useRef(0);
  const wheelLock = useRef(0);
  const [hovered, setHovered] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!stackMode || selected !== null || hovered === null || viewport.width <= 700) return;
    const root = stage.current;
    const label = root?.querySelector<HTMLElement>('.paper-stack-hover-label');
    const sleeve = root?.querySelector<HTMLElement>(`.paper-record[data-index="${hovered}"]`);
    if (!root || !label || !sleeve) return;
    let frame = 0;
    const align = () => {
      positionStackHoverLabel(root, sleeve, label);
      frame = requestAnimationFrame(align);
    };
    align();
    return () => cancelAnimationFrame(frame);
  }, [hovered, selected, stackMode, viewport.width]);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useLayoutEffect(() => {
    if (!pendingShelfCenter.current || !viewport.width || !baseSleeves.length) return;
    pendingShelfCenter.current = false;
    // Always centre against the final Shelf geometry. Using the temporary
    // Tracks/Grid spread here placed the folded collection near its end.
    const first = baseSleeves[0]?.position || 0;
    const last = baseSleeves.at(-1)?.position || first;
    const offset = (first + last) / 2 - viewport.width / 2;
    travel.current = {current:offset,target:offset};
    transportOrigin.current = offset;
    stage.current?.style.setProperty('--travel',`${offset}px`);
    if (transport.current) transport.current.style.transform = 'none';
    setWindowTravel(Math.floor(offset / 128) * 128);
  }, [releases, baseSleeves, viewport.width]);
  function settleShelfMotion() {
    cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = 0;
    const root = stage.current;
    const rebase = compositorScroll && transport.current?.style.transform
      && transport.current.style.transform !== 'none' && !root?.classList.contains('is-cover-rebasing');
    if (rebase) root?.classList.add('is-cover-rebasing');
    const offset = travel.current.current;
    travel.current = { current: offset, target: offset };
    transportOrigin.current = offset;
    stage.current?.style.setProperty('--travel', `${offset}px`);
    if (transport.current) transport.current.style.transform = 'none';
    if (rebase && root) {
      // Commit once at the interaction boundary, not on each scrolling frame.
      void root.offsetHeight;
      root.classList.remove('is-cover-rebasing');
    }
    stage.current?.classList.remove('is-scrolling');
    setWindowTravel(Math.floor(offset / 128) * 128);
    hoverResumeAt.current = performance.now() + 180;
  }
  function drawCompositedTravel(offset: number) {
    if (!compositorScroll || !transport.current || selected !== null || gridMix > .01
      || stackTransitioning || autoLayout || middleDrag.current) return false;
    transport.current.style.transform = archiveScrollTransform(offset, transportOrigin.current, {
      stack: stackMode, mobile: viewport.width <= 700, width: viewport.width, height: viewport.height,
    });
    return true;
  }
  function seekStackCollection(progress: number, smooth: boolean) {
    stopAutoLayout();
    settleShelfMotion();
    setHovered(null);
    suppressCoverClick.current = performance.now() + 300;
    const target = stackNavigatorTravel(stackNavigatorPositions, viewport.width, progress);
    const start = travel.current.current;
    const started = performance.now();
    const animate = smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draw = (now: number) => {
      const elapsed = animate ? Math.min(1, (now - started) / 360) : 1;
      const offset = start + (target - start) * (1 - Math.pow(1 - elapsed, 3));
      travel.current = { current: offset, target: offset };
      if (!drawCompositedTravel(offset)) {
        transportOrigin.current = offset;
        stage.current?.style.setProperty('--travel', `${offset}px`);
        if (transport.current) transport.current.style.transform = 'none';
      }
      setWindowTravel(Math.floor(offset / 128) * 128);
      if (elapsed < 1) scrollFrame.current = requestAnimationFrame(draw);
      else { scrollFrame.current = 0; stage.current?.classList.remove('is-scrolling'); }
    };
    stage.current?.classList.add('is-scrolling');
    draw(started);
  }
  const coverTransitionFrames = useRef<Map<string, Keyframe> | null>(null);
  const coverTransitionAnimations = useRef<Animation[]>([]);
  const coverTransitionIsLayout = useRef(false);
  const coverTransitionStackStep = useRef<number | null>(null);
  const coverTransitionSource = useRef<CoverEntryScene>({layout:'shelf',width:1280,height:720});
  const coverEntryTransition = useRef<{frames:Map<string,Keyframe>;scene:CoverEntryScene;started:number;duration:number;easing:string;animated:WeakSet<HTMLElement>} | null>(null);
  function captureCoverTransition(layout = false) {
    const root = stage.current;
    if (!root) return;
    coverEntryTransition.current = null;
    if (compositorScroll) coverTransitionSource.current = {layout:activeLayout,width:viewport.width,height:viewport.height};
    coverTransitionStackStep.current = layout && root.classList.contains('is-stack') && !root.classList.contains('is-open')
      ? 24 * (parseFloat(getComputedStyle(root).getPropertyValue('--stack-distance-scale')) || -1.6)
      : null;
    const matrix = new DOMMatrixReadOnly(transport.current ? getComputedStyle(transport.current).transform : undefined);
    const row = root.querySelector<HTMLElement>('.paper-row');
    const frames = new Map<string, Keyframe>();
    root.querySelectorAll<HTMLElement>('.paper-record').forEach(card => {
      const style = getComputedStyle(card);
      frames.set(card.dataset.index!, {
        left: `${parseFloat(style.left) + matrix.m41}px`,
        top: `${parseFloat(style.top) + matrix.m42 - (row?.scrollTop ?? 0)}px`,
        width: style.width, height: style.height, margin: style.margin,
        transform: style.transform, transformOrigin: style.transformOrigin,
        opacity: style.opacity,
      });
    });
    // Read the live (possibly still animated) frame before cancelling anything.
    coverTransitionAnimations.current.forEach(animation => animation.cancel());
    coverTransitionAnimations.current = [];
    coverTransitionFrames.current = frames;
    coverTransitionIsLayout.current = layout;
    root.classList.add('is-cover-rebasing');
  }
  const { playQueue, togglePlayback, replaceQueuePreservingCurrent } = usePlayerActions();
  const { currentTrack, isPlaying } = usePlayerTransport();
  const [collectionCatalog, setCollectionCatalog] = useState<{ owner: string; tracks: PlayerTrack[] } | null>(null);
  const catalogOwner = user?.id || 'guest';
  const collectionPlaying = currentTrack?.playbackSource?.section === 'collection';
  const replaceCollectionQueueRef = useRef(replaceQueuePreservingCurrent);
  replaceCollectionQueueRef.current = replaceQueuePreservingCurrent;
  const collectionReleaseIds = JSON.stringify(releases.map(item => item.id));
  const [navigatorReveal, setNavigatorReveal] = useState<string | null>(null);
  useEffect(() => {
    if (!navigatorReveal) return;
    const index = releases.findIndex(item => item.id === navigatorReveal);
    if (index < 0) return;
    const frame = requestAnimationFrame(() => {
      stage.current?.querySelector<HTMLElement>('.paper-row')?.scrollTo({top:Math.max(0,listLayout.positions[index]-gridBounds.top),behavior:'smooth'});
      setNavigatorReveal(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [navigatorReveal, releases, listLayout.positions, gridBounds.top]);
  useEffect(() => {
    if (!collectionView || !collectionPlaying || collectionCatalog?.owner === catalogOwner) return;
    let disposed = false;
    void getCollectionPlaybackQueue().then(tracks => {
      if (!disposed) setCollectionCatalog({ owner: catalogOwner, tracks });
    }).catch(error => console.warn('Unable to load collection playback queue', error));
    return () => { disposed = true; };
  }, [collectionView, collectionPlaying, catalogOwner, collectionCatalog]);
  useEffect(() => {
    if (!collectionView || !collectionPlaying || !currentTrack || collectionCatalog?.owner !== catalogOwner) return;
    const origin = new URL('/',window.location.origin);
    if(activeStyles.length)origin.hash=new URLSearchParams({styles:activeStyles.join(',')}).toString();
    if(appliedSearch)origin.searchParams.set('search',appliedSearch);
    const fullQueue = liveCollectionQueue(collectionCatalog.tracks, JSON.parse(collectionReleaseIds), currentTrack,origin.pathname+origin.search+origin.hash);
    replaceCollectionQueueRef.current(fullQueue, fullQueue.filter(track => track.releaseId === currentTrack.releaseId));
  }, [collectionView, collectionPlaying, collectionCatalog, catalogOwner, collectionReleaseIds, currentTrack, activeStyles, appliedSearch]);
  const hasPlayerTrack = Boolean(currentTrack);
  const geometryLayout = viewport.width <= 700 ? stackMode || stretch >= .5 : activeLayout;
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => {
      const origin = element.getBoundingClientRect().top;
      const search = document.querySelector('.archive-page-header .paper-search')?.getBoundingClientRect();
      const player = document.querySelector('.mini-player')?.getBoundingClientRect();
      const heading = element.querySelector('.paper-heading')?.getBoundingClientRect();
      if (viewport.width <= 700) {
        const nav = element.querySelector('.paper-sections') as HTMLElement | null;
        const title = element.querySelector('.paper-heading') as HTMLElement | null;
        const sectionButtons = nav?.querySelectorAll<HTMLButtonElement>(':scope > button');
        const tracksButton = sectionButtons?.[3];
        const favoritesButton = sectionButtons?.[4];
        const headingGap = tracksButton && favoritesButton
          ? favoritesButton.offsetTop - tracksButton.offsetTop - tracksButton.offsetHeight
          : undefined;
        const layout = shelfMobileLayout(viewport.width, viewport.height,
          (search?.bottom || 72) - origin, nav?.offsetHeight || 88,
          title?.offsetHeight || 36, player ? player.top - origin : viewport.height - 24,
          stackMode || stretch >= .5, headingGap);
        setLayoutProperties(element, {
          '--mobile-nav-top': `${layout.navigationTop}px`,
          '--mobile-heading-top': `${layout.headingTop}px`,
          '--mobile-content-top': `${layout.contentTop}px`,
          '--mobile-content-bottom': `${layout.bottom}px`,
          '--mobile-panel-height': `${layout.panelHeight}px`,
          '--mobile-shelf-floor': `${layout.shelfFloor}px`,
          '--cover': `${layout.coverSize}px`,
        });
        setMobileGeometry(current => current.coverSize === layout.coverSize && current.shelfFloor === layout.shelfFloor ? current : {coverSize:layout.coverSize,shelfFloor:layout.shelfFloor});
        setGridBounds(current => current.top === layout.contentTop && current.bottom === layout.bottom ? current : {top:layout.contentTop,bottom:layout.bottom});
        return;
      }
      const measuredTop = Math.ceil(Math.max(search?.bottom || 88, heading?.bottom || 0)) + (viewport.width <= 700 ? 2 : 14);
      const nextTop = measuredTop;
      const nextBottom = player ? Math.ceil(viewport.height - player.top) + 8 : 84;
      setGridBounds(current => current.top === nextTop && current.bottom === nextBottom ? current : {top:nextTop,bottom:nextBottom});
    };
    measure();
    const measurement = frameMeasurement(measure);
    const observer = new ResizeObserver(measurement.schedule);
    for (const node of [document.querySelector('.archive-page-header .paper-search'), element.querySelector('.paper-sections'), element.querySelector('.paper-heading'), document.querySelector('.mini-player')]) if (node) observer.observe(node);
    window.visualViewport?.addEventListener('resize', measurement.schedule);
    return () => { measurement.cancel();observer.disconnect();window.visualViewport?.removeEventListener('resize',measurement.schedule); };
  }, [viewport, hasPlayerTrack, geometryLayout]);
  useLayoutEffect(() => {
    const row = stage.current?.querySelector('.paper-row');
    if (row) row.scrollTop = gridMix >= 1 ? gridPan * (1-listMix) + listPan * listMix : 0;
  }, [gridMix, gridPan, listMix, listPan]);
  function selectPlaylist(id: string | null) {
    pendingShelfCenter.current = true;
    if (id === null) setShowPlaylists(false);
    stopAutoLayout();
    if (filterTimer.current) clearTimeout(filterTimer.current);
    middleDrag.current = null;
    setIsDragging(false);
    cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = 0;
    setPlaylistTransition(Boolean(id));
    pendingReveal.current = null;
    setFiltering(true); setSelected(null); setExpanded(false); setHovered(null);
    filterTimer.current = setTimeout(() => {
      activeStylesRef.current = []; setActiveStyles([]); replaceStyleHash([]);
      setActivePlaylist(id); setSearch(''); setAppliedSearch('');
      setStackSpread(false); setStackTransitioning(false);
      if (stackTransitionTimer.current) clearTimeout(stackTransitionTimer.current);
      stackTransitionTimer.current = null;
      stackGridAnimations.current.forEach(animation => animation.cancel());
      stackGridAnimations.current = []; stackGridFrames.current = null;
      setGridPan(0); setListPan(0);
      stage.current?.querySelector('.paper-row')?.scrollTo(0, 0);
      setWindowTravel(0); setWindowScroll(0);
      travel.current = {current:0,target:0}; transportOrigin.current = 0;
      stage.current?.style.setProperty('--travel','0px');
      if (transport.current) transport.current.style.transform = 'none';
      setFiltering(false);
      setPlaylistTransition(false);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240);
  }
  function navigateSection(path: string, section: MobileCollectionSection) {
    setPendingSection(section);
    setShowPlaylists(false);
    setHovered(null);
    setSelected(null);
    setExpanded(false);
    const destination = new URL(path, window.location.origin);
    destination.searchParams.set('layout', stackMode ? 'stack' : stretch >= 1.5 ? 'tracks' : stretch >= .5 ? 'grid' : 'shelf');
    router.push(`${destination.pathname}${destination.search}${destination.hash}`);
  }
  function changeMobileLayout(target: 0 | 1 | 2, shouldAnimate = true) {
    stopAutoLayout();
    settleShelfMotion();
    const row = stage.current?.querySelector<HTMLElement>('.paper-row');
    const centerY = (gridBounds.top + viewport.height - gridBounds.bottom) / 2;
    let anchorIndex = selected ?? 0;
    if (selected === null && releases.length) {
      if (listMix > .5) {
        const viewedY = (row?.scrollTop ?? windowScroll) + centerY;
        listLayout.positions.forEach((y,index) => {
          if (Math.abs(y + listSize/2 - viewedY) < Math.abs((listLayout.positions[anchorIndex] || 0) + listSize/2 - viewedY)) anchorIndex=index;
        });
      } else if (gridMix >= 1) {
        const viewedY = (row?.scrollTop ?? windowScroll) + centerY;
        anchorIndex=Math.min(releases.length-1, Math.max(0, Math.round((viewedY-gridBounds.top-12-gridSize/2)/cell)*columns+Math.floor(columns/2)));
      } else {
        const viewedX=travel.current.current+viewport.width/2;
        sleeves.forEach((sleeve,index) => {if(Math.abs(sleeve.position-viewedX)<Math.abs((sleeves[anchorIndex]?.position || 0)-viewedX))anchorIndex=index;});
      }
    }
    setGridPan(Math.max(0,gridBounds.top+12+Math.floor(anchorIndex/columns)*cell+gridSize/2-centerY));
    setListPan(Math.max(0,(listLayout.positions[anchorIndex] || 0)+listSize/2-centerY));
    const alignShelf = (value: number) => {
      const position=(baseSleeves[anchorIndex]?.position || 0)*(1+Math.min(value,1)*2)-viewport.width/2;
      travel.current={current:position,target:position};
      transportOrigin.current=position;
      stage.current?.style.setProperty('--travel',`${position}px`);
      if(transport.current)transport.current.style.transform='none';
      setWindowTravel(Math.floor(position/128)*128);
    };
    // Shelf and Stack share a continuous travel coordinate. Do not snap the
    // nearest record to the centre merely because the layout button was used.
    const preserveTravel = target === 0 && stretch < .01;
    if (!preserveTravel) alignShelf(stretch);
    setSelected(null); setExpanded(false); setHovered(null);
    const startValue = stretch;
    if (!shouldAnimate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {if (!preserveTravel) alignShelf(target);setStretch(target);return;}
    setAutoLayout(true);
    const start = performance.now();
    const animate = (now: number) => {
      const progress = Math.min(1, (now - start) / 650);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value=startValue + (target - startValue) * eased;
      alignShelf(value);
      setStretch(value);
      if (progress < 1) layoutFrame.current = requestAnimationFrame(animate);
      else { layoutFrame.current = 0; setAutoLayout(false); }
    };
    layoutFrame.current = requestAnimationFrame(animate);
  }
  function changeCollectionLayout(target: 'shelf' | 'stack' | 'grid' | 'tracks') {
    if (compositorScroll) {
      if (target === activeLayout && selected === null) return;
      settleShelfMotion();
      captureCoverTransition(true);
      stackGridAnimations.current.forEach(animation => animation.cancel());
      stackGridAnimations.current = []; stackGridFrames.current = null;
      if (stackTransitionTimer.current) clearTimeout(stackTransitionTimer.current);
      const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setStackTransitioning(animate);
      stackTransitionTimer.current = animate
        ? setTimeout(() => { stackTransitionTimer.current = null; setStackTransitioning(false); }, 1300)
        : null;
      setStackMode(target === 'stack');
      setStackSpread(false);
      // Commit only the destination layout; do not run the per-frame stretch loop.
      changeMobileLayout(target === 'grid' ? 1 : target === 'tracks' ? 2 : 0, false);
      return;
    }
    if ((target === 'stack' && !stackMode)
      || (stackMode && target === 'shelf')) captureCoverTransition(true);
    const animateToGrid = stackMode && target === 'grid' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frames = new Map<string, Keyframe>();
    if (animateToGrid) {
      const row = stage.current?.querySelector<HTMLElement>('.paper-row');
      stage.current?.querySelectorAll<HTMLElement>('.paper-record').forEach(card => {
        const style = getComputedStyle(card);
        frames.set(card.dataset.index!, {
          left: style.left, top: `${parseFloat(style.top) - (row?.scrollTop ?? 0)}px`,
          width: style.width, height: style.height, margin: style.margin,
          transform: style.transform, opacity: style.opacity,
        });
      });
    }
    stackGridAnimations.current.forEach(animation => animation.cancel());
    stackGridAnimations.current = [];
    stackGridFrames.current = animateToGrid ? frames : null;
    const nextStackMode = target === 'stack';
    const involvesStack = stackMode || nextStackMode;
    if (stackMode !== nextStackMode) {
      if (stackTransitionTimer.current) clearTimeout(stackTransitionTimer.current);
      const animateStackTransition = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setStackTransitioning(animateStackTransition);
      stackTransitionTimer.current = animateStackTransition
        ? setTimeout(() => { stackTransitionTimer.current = null; setStackTransitioning(false); }, 1300)
        : null;
    }
    setStackMode(nextStackMode);
    setStackSpread(false);
    changeMobileLayout(target === 'grid' ? 1 : target === 'tracks' ? 2 : 0, !involvesStack);
  }
  function applyMiddleLayout(value: number, anchor: number) {
    const nextStretch = Math.max(0, value - 1);
    const offset = (baseSleeves[anchor]?.position || 0) * (1 + Math.min(nextStretch, 1) * 2) - viewport.width / 2;
    travel.current = { current: offset, target: offset };
    transportOrigin.current = offset;
    stage.current?.style.setProperty('--travel', `${offset}px`);
    if (transport.current) transport.current.style.transform = 'none';
    setWindowTravel(Math.floor(offset / 128) * 128);
    setStretch(nextStretch);
    setDragLayout(value);
  }
  function finishMiddleLayout() {
    const drag = middleDrag.current;
    if (!drag) return;
    middleDrag.current = null;
    const target = Math.round(drag.progress);
    const start = performance.now();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const settle = (now: number) => {
      const t = reduced ? 1 : Math.min(1, (now - start) / 220);
      applyMiddleLayout(drag.progress + (target - drag.progress) * (1 - Math.pow(1 - t, 3)), drag.anchor);
      if (t < 1) layoutFrame.current = requestAnimationFrame(settle);
      else {
        layoutFrame.current = 0;
        setStackMode(target === 1);
        setDragLayout(null);
        setIsDragging(false);
      }
    };
    layoutFrame.current = requestAnimationFrame(settle);
  }
  const release = selected === null ? null : releases[selected];
  const previousOpenRelease = useRef(release);
  useLayoutEffect(() => {
    const previous = previousOpenRelease.current;
    previousOpenRelease.current = release;
    if (previous && previous.id !== release?.id) {
      setCoverSideOverrides(overrides => collapseReleaseCoverSide(overrides, previous, currentTrack, isPlaying, isTrackCollection));
    }
  }, [release, currentTrack, isPlaying, isTrackCollection]);
  const selectedCoverSide = release ? releaseCoverSide(release, currentTrack, coverSideOverrides[release.id], isTrackCollection) : null;
  const backCoverUrl = getBackCoverUrl(release, selectedCoverSide?.disc);
  const isCoverFlipped = selectedCoverSide?.back || false;
  useEffect(() => {
    // Playback starts a new automatic side selection; unrelated manual previews stay put.
    setCoverSideOverrides(previous => {
      const idle = Object.entries(previous).filter(([,side]) => !side.playbackKey);
      return idle.length === Object.keys(previous).length ? previous : Object.fromEntries(idle);
    });
  }, [currentTrack?.id, currentTrack?.position]);
  useLayoutEffect(() => {
    const root = stage.current;
    const label = root?.querySelector<HTMLElement>('.is-stack-preview');
    const cover = root?.querySelector<HTMLElement>('.paper-record.is-selected');
    if (!root || !stackMode || expanded || !label || !cover) return;
    const updateClearance = () => {
      const size = cover.offsetWidth;
      const angle = 55 * Math.PI / 180;
      // Lower edge of the preceding tilted cover, projected with the Stack perspective.
      const lowerEdge = size * .5 * Math.cos(angle) / (1 + size * .5 * Math.sin(angle) / 1200);
      const clearance = label.offsetHeight + 16 + lowerEdge - size * .41;
      root.style.setProperty('--stack-title-clearance', `${clearance}px`);
    };
    updateClearance();
    const observer = new ResizeObserver(updateClearance);
    observer.observe(label);
    observer.observe(cover);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--stack-title-clearance');
    };
  }, [stackMode, expanded, release?.id]);
  useEffect(() => {
    if (initialRouteApplied.current) return;
    if (favoritesMode || mixesMode) {
      initialRouteApplied.current = true;
      selectPlaylist(null);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'playlists') {
      setShowPlaylists(true);
      if (playlists[0]) {
        initialRouteApplied.current = true;
        selectPlaylist(playlists[0].id);
        return;
      }
    }
    const playlistId = params.get('playlist');
    if (playlistId && playlists.some(playlist => playlist.id === playlistId)) {
      initialRouteApplied.current = true;
      selectPlaylist(playlistId);
    } else if ((!playlistId && !playlistsLoading) || (playlistId && !user && !playlistsLoading)) {
      initialRouteApplied.current = true;
    }
  }, [favoritesMode, mixesMode, playlists, playlistsLoading, user]);
  function applySourceFocus(target: URL) {
    const trackId=target.searchParams.get('focusTrack');
    const playlistId=target.searchParams.get('playlist');
    const releaseId=target.searchParams.get('focusRelease');
    if(!trackId || (playlistId && playlistsLoading))return;
    const key = `${trackId}:${playlistId || ''}:${releaseId || ''}`;
    handledSourceFocus.current=key;
    initialRouteApplied.current=true;
    if(filterTimer.current)clearTimeout(filterTimer.current);
    stopAutoLayout();
    setFiltering(false);setPlaylistTransition(false);
    setActivePlaylist(playlistId);setShowPlaylists(Boolean(playlistId));
    const styles = new URLSearchParams(target.hash.slice(1)).get('styles')?.split(',').filter(Boolean) || [];
    activeStylesRef.current=styles;setActiveStyles(styles);
    const search=target.searchParams.get('search')||'';
    setSearch(search);setAppliedSearch(search);
    setSelected(null);setExpanded(false);setHovered(null);setStackMode(false);setStretch(2);
    setPendingSourceFocus({trackId,releaseId});
  }
  useEffect(() => {
    if(!sourceFocus){handledSourceFocus.current=null;return;}
    const key = `${sourceFocus}:${sourcePlaylist || ''}:${sourceRelease || ''}`;
    if(handledSourceFocus.current===key || (sourcePlaylist && playlistsLoading))return;
    applySourceFocus(new URL(window.location.href));
  }, [sourceFocus, sourceRelease, sourcePlaylist, sourceSearch, playlistsLoading]);
  useEffect(() => {
    const focus = (event: Event) => {
      const href=(event as CustomEvent<{href:string}>).detail?.href;
      if(!href)return;
      const target=new URL(href,window.location.href);
      if(target.origin!==window.location.origin || target.pathname!==window.location.pathname)return;
      const trackId=target.searchParams.get('focusTrack');
      if(!trackId)return;
      const styles=new URLSearchParams(target.hash.slice(1)).get('styles')?.split(',').filter(Boolean)||[];
      const sameFilters=styles.length===activeStyles.length && styles.every(style=>activeStyles.includes(style))
        && (target.searchParams.get('search')||'')===appliedSearch
        && target.searchParams.get('playlist')===activePlaylist;
      const index=releases.findIndex(r=>r.tracks.some(t=>t.id===trackId) || (!isTrackCollection && r.id===target.searchParams.get('focusRelease')));
      const row=stage.current?.querySelector<HTMLElement>('.paper-row');
      event.preventDefault();
      if(isTrackListInteractive && sameFilters && index>=0 && row && selected===null){
        stopAutoLayout();
        const line=stage.current?.querySelector<HTMLElement>(`[data-track-id="${CSS.escape(trackId)}"]`);
        row.scrollTo({top:Math.max(0,line ? row.scrollTop+line.getBoundingClientRect().top-row.getBoundingClientRect().top-gridBounds.top-24 : listLayout.positions[index]-gridBounds.top),behavior:'smooth'});
        return;
      }
      // Collection and playlists share '/'. Apply the context directly, even
      // when this same URL was already handled before returning to Collection.
      window.history.pushState(window.history.state,'',target.pathname+target.search+target.hash);
      applySourceFocus(target);
    };
    window.addEventListener('vinyl:focus-source-track',focus);
    return ()=>window.removeEventListener('vinyl:focus-source-track',focus);
  }, [activeStyles, appliedSearch, activePlaylist, releases, isTrackListInteractive, isTrackCollection, selected, listLayout.positions, gridBounds.top, playlistsLoading]);
  useEffect(() => {
    if(!pendingSourceFocus || !isTrackListInteractive || filtering || playlistTransition)return;
    const index=releases.findIndex(r=>r.tracks.some(t=>t.id===pendingSourceFocus.trackId) || (!isTrackCollection && r.id===pendingSourceFocus.releaseId));
    if(index<0){
      if(!activePlaylist && !favoritesMode && allReleases.some(r=>r.id===pendingSourceFocus.releaseId) && (activeStyles.length || appliedSearch)){
        activeStylesRef.current=[];setActiveStyles([]);replaceStyleHash([]);setSearch('');setAppliedSearch('');
      }
      return;
    }
    const row=stage.current?.querySelector<HTMLElement>('.paper-row');
    if(!row)return;
    const frame=requestAnimationFrame(()=>{
      const track=stage.current?.querySelector<HTMLElement>(`[data-track-id="${CSS.escape(pendingSourceFocus.trackId)}"]`);
      const card=stage.current?.querySelector<HTMLElement>(`.paper-list-tracks[data-index="${index}"]`);
      const target=track || card;
      if(!target){row.scrollTo({top:Math.max(0,listLayout.positions[index]-gridBounds.top-24),behavior:'smooth'});return;}
      row.scrollTo({top:Math.max(0,row.scrollTop+target.getBoundingClientRect().top-row.getBoundingClientRect().top-gridBounds.top-24),behavior:'smooth'});
      if(releases[index].tracksLoaded===false)return;
      setPendingSourceFocus(null);
      const url=new URL(window.location.href);
      url.searchParams.delete('focusTrack');url.searchParams.delete('focusRelease');
      window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);
    });
    return ()=>cancelAnimationFrame(frame);
  }, [pendingSourceFocus, isTrackListInteractive, filtering, playlistTransition, releases, listLayout.positions, gridBounds.top, isTrackCollection, windowScroll, activePlaylist, favoritesMode, allReleases, activeStyles, appliedSearch]);
  const playingListRelease = isTrackListInteractive
    ? releases.find(r => r.tracks.some(t => t.id === currentTrack?.id))
    : undefined;
  const headingRelease = viewport.width <= 700 && !stackMode && stretch < .5
    ? release
    : (hovered === null ? null : releases[hovered]) || release || playingListRelease || releases[0];
  const activePlaylistName = playlists.find(playlist=>playlist.id===activePlaylist)?.name || '';
  const mobileContextHeading = viewport.width<=700 && (stackMode || stretch>=.5);
  const mobileContextPicker = mixesMode ? 'music' : activePlaylist || showPlaylists ? 'playlists' : 'genres';
  const mobileContextPickerLabel = mobileContextPicker === 'music' ? (originalsMode ? (ru ? 'Выбрать трек' : 'Choose track') : (ru ? 'Выбрать микс' : 'Choose mix')) : mobileContextPicker === 'playlists' ? (ru ? 'Выбрать плейлист' : 'Choose playlist') : (ru ? 'Выбрать жанры' : 'Choose genres');
  useEffect(() => { if (!mobileContextHeading) setMobilePicker(null); }, [mobileContextHeading]);
  const mobileSectionKey = favoritesMode ? 'favorites' : originalsMode ? 'originals' : mixesMode ? 'mixes' : activePlaylist || showPlaylists ? 'playlists' : 'collection';
  const mobileSectionName = favoritesMode ? (ru?'Избранное':'Favorites') : originalsMode ? (ru?'Треки':'Tracks') : mixesMode ? (ru?'Миксы':'Mixes') : activePlaylist || showPlaylists ? (ru?'Плейлисты':'Playlists') : (ru?'Коллекция':'Collection');
  const mobileContextName = activePlaylistName || activeStyles.join(' + ') || (originalsMode ? (ru?'Все треки':'All tracks') : mixesMode ? (ru?'Все миксы':'All mixes') : favoritesMode ? '' : (ru?'Вся коллекция':'All collection'));
  const mobileSectionCount = mobileSectionKey === 'favorites' ? counts.favorites : mobileSectionKey === 'originals' ? (originalCount ?? counts.originals) : mobileSectionKey === 'mixes' ? (mixCount ?? counts.mixes) : mobileSectionKey === 'playlists' ? counts.playlists : (collectionCount ?? counts.releases);
  const mobileContextCount = activeStyles.length ? releases.length : activePlaylist ? (playlists.find(playlist=>playlist.id===activePlaylist)?.items.length ?? 0) : originalsMode ? (originalCount ?? counts.originals) : mixesMode ? (mixCount ?? counts.mixes) : null;
  function chooseMobileSection(section: MobileCollectionSection) {
    if (section === mobileSectionKey) return;
    if (section === 'collection') {
      if (mixesMode || favoritesMode) navigateSection('/', section);
      else { setPendingSection(null); selectPlaylist(null); }
    } else if (section === 'playlists') {
      if (mixesMode || favoritesMode) navigateSection('/?view=playlists', section);
      else { setPendingSection(null); setShowPlaylists(true); if (playlists[0]) selectPlaylist(playlists[0].id); }
    } else if (section === 'mixes') {
      if (!mixesMode || originalsMode) navigateSection('/mixes', section);
    } else if (section === 'originals') {
      if (!originalsMode) navigateSection('/tracks', section);
      else { setPendingSection(null); setShowPlaylists(false); }
    } else {
      if (!favoritesMode) navigateSection('/favorites', section);
      else { setPendingSection(null); setShowPlaylists(false); }
    }
  }
  function filterByStyle(style: string | null, query = search) {
    const current = activeStylesRef.current;
    const nextStyles = style === null
      ? []
      : current.includes(style)
        ? current.filter(value => value !== style)
        : current.length >= MAX_SELECTED_STYLES
          ? current
          : [...current, style].sort((a,b) => a.localeCompare(b));
    if (style !== null && nextStyles === current) return;
    applyStyleSelection(nextStyles, query);
  }
  function applyStyleSelection(nextStyles: string[], query = search) {
    activeStylesRef.current = nextStyles;
    replaceStyleHash(nextStyles);
    pendingShelfCenter.current = true;
    stopAutoLayout();
    if (filterTimer.current) clearTimeout(filterTimer.current);
    setPlaylistTransition(false);
    pendingReveal.current = null;
    setFiltering(true);
    setHovered(null);
    setSelected(null);
    setExpanded(false);
    filterTimer.current = setTimeout(() => {
      cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = 0;
      travel.current = { current: 0, target: 0 };
      transportOrigin.current = 0;
      if (transport.current) transport.current.style.transform = 'none';
      stage.current?.style.setProperty('--travel', '0px');
      stage.current?.querySelector('.paper-row')?.scrollTo(0, 0);
      setGridPan(0);
      setListPan(0);
      setWindowTravel(0); setWindowScroll(0);
      setActiveStyles(nextStyles);
      setAppliedSearch(query);
      setFiltering(false);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240);
  }
  useEffect(() => {
    if (!pendingReveal.current) return;
    const index = releases.findIndex(r => r.id === pendingReveal.current);
    if (index < 0) return;
    pendingReveal.current = null;
    setSelected(index);
    setExpanded(true);
  }, [releases]);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const limits = () => ({ min: -element.clientWidth / 2, max: (sleeves.at(-1)?.position || 0) - element.clientWidth / 2 });
    const clampTravel = (value: number) => {
      const { min, max } = limits();
      return Math.max(min, Math.min(Math.max(min, max), value));
    };
    const resize = () => {
      element.style.setProperty('--slope', String(element.clientHeight / Math.max(1, element.clientWidth)));
      travel.current.target = clampTravel(travel.current.target);
      travel.current.current = clampTravel(travel.current.current);
      setWindowTravel(Math.floor(travel.current.current / 128) * 128);
      element.style.setProperty('--travel', `${travel.current.current}px`);
      transportOrigin.current = travel.current.current;
      if (transport.current) transport.current.style.transform = 'none';
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    const draw = () => {
      const state = travel.current;
      state.current += (state.target - state.current) * (reduced.matches ? 1 : .14);
      const offset = state.current - transportOrigin.current;
      if (drawCompositedTravel(state.current)) {
        // Geometry stays fixed between commits; only the deck transform moves.
      } else if (stackMode) {
        element.style.setProperty('--travel', `${state.current}px`);
        if (transport.current) transport.current.style.transform = 'none';
      } else if (transport.current) {
        const verticalOffset = offset * element.clientHeight / Math.max(1, element.clientWidth);
        transport.current.style.transform = `translate3d(${-offset}px, ${verticalOffset}px, 0)`;
      }
      setWindowTravel(Math.floor(state.current / 128) * 128);
      if (Math.abs(state.target - state.current) > .1) scrollFrame.current = requestAnimationFrame(draw);
      else {scrollFrame.current = 0; hoverResumeAt.current = performance.now() + 160; element.classList.remove('is-scrolling');}
    };
    const wheel = (event: WheelEvent) => {
      if (!(event.target instanceof Element)) return;
      const overArchiveContent = event.target.closest('.paper-row');
      const overStackCanvas = stackMode && !event.target.closest('.paper-styles,.paper-playlists,.paper-mix-index,.paper-sections,.paper-header,.paper-tracklist,.mini-player');
      if (!overArchiveContent && !overStackCanvas) return;
      if (middleDrag.current) { event.preventDefault(); return; }
      if (gridMix >= 1) return;
      event.preventDefault();
      const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
      if (!delta) return;
      if (stackMode && performance.now() < wheelLock.current) return;
      hoverResumeAt.current = performance.now() + 600;
      if (selected !== null) {
        // One deliberate step at a time; momentum must not skip releases
        // immediately after collapsing the enlarged cover.
        if (performance.now() < wheelLock.current) return;
        wheelLock.current = performance.now() + 450;
        if (!stackMode && gridMix < .01) {
          captureCoverTransition();
          protectShelfTransition();
        }
        setHovered(null);
        if (expanded && !stackMode) {
          setExpanded(false);
          return;
        }
        const next = Math.max(0, Math.min(releases.length - 1, selected + Math.sign(delta)));
        setSelected(next);
        trigger.current = element.querySelector<HTMLButtonElement>(`.paper-record[data-index="${next}"] > .paper-record-open`);
        return;
      }
      element.classList.add('is-scrolling');
      travel.current.target = clampTravel(travel.current.target + delta * (stackMode ? 1 : .65));
      setHovered(null);
      if (!scrollFrame.current) scrollFrame.current = requestAnimationFrame(draw);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {observer.disconnect(); element.removeEventListener('wheel', wheel); cancelAnimationFrame(scrollFrame.current); scrollFrame.current = 0; element.classList.remove('is-scrolling');};
  }, [releases.length, sleeves, selected, expanded, gridMix, stackMode, compositorScroll, stackTransitioning, autoLayout, viewport.width, viewport.height]);
  useLayoutEffect(() => {
    if (selected === null || !stage.current) return;
    const element = stage.current;
    const centerRow = () => {
      const offset = (sleeves[selected]?.position || 0) - element.clientWidth / 2;
      travel.current = { current: offset, target: offset };
      setWindowTravel(Math.floor(offset / 128) * 128);
      transportOrigin.current = offset;
      if (transport.current) transport.current.style.transform = 'none';
      element.style.setProperty('--travel', `${offset}px`);
    };
    centerRow();
    const observer = new ResizeObserver(centerRow);
    observer.observe(element);
    return () => observer.disconnect();
  }, [selected, sleeves]);
  const handledRevealTrack = useRef<string | null>(null);
  useEffect(() => {
    const consumeReveal = (trackId: string) => {
      handledRevealTrack.current = trackId;
      const url = new URL(window.location.href);
      if (url.searchParams.get('reveal') === trackId) {
        url.searchParams.delete('reveal');
        window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      }
    };
    const reveal = (event: Event) => {
      const detail = (event as CustomEvent<{ releaseId?: string; trackId: string; layout?: string }>).detail;
      if (!detail) return;
      if (detail.layout === 'shelf' || detail.layout === 'stack' || detail.layout === 'grid' || detail.layout === 'tracks') changeCollectionLayout(detail.layout);
      stopAutoLayout();
      stage.current?.querySelector('.paper-row')?.scrollTo(0, 0);
      const index = releases.findIndex(r => r.id === detail.releaseId || r.tracks.some(t => t.id === detail.trackId));
      if (index < 0) {
        const matching = allReleases.find(r => r.id === detail.releaseId || r.tracks.some(t => t.id === detail.trackId));
        if (!matching) return;
        consumeReveal(detail.trackId);
        event.preventDefault();
        if (filterTimer.current) clearTimeout(filterTimer.current);
        pendingReveal.current = matching.id;
        setHovered(null);
        setSelected(null);
        setExpanded(false);
        setFiltering(false);
        activeStylesRef.current = [];
        setActiveStyles([]);
        replaceStyleHash([]);
        setActivePlaylist(null);
        setPlaylistTransition(false);
        setSearch('');
        setAppliedSearch('');
        return;
      }
      event.preventDefault(); // Tell the mini-player the archive handled the click.
      consumeReveal(detail.trackId);
      setHovered(null);
      setSelected(index);
      setExpanded(true);
      trigger.current = stage.current?.querySelector<HTMLButtonElement>(`.paper-record[data-index="${index}"] > .paper-record-open`) || null;
    };
    window.addEventListener('vinyl:reveal-release', reveal);
    return () => window.removeEventListener('vinyl:reveal-release', reveal);
  }, [releases, allReleases]);
  useEffect(() => {
    if (selected === null) return;
    const key = (event: KeyboardEvent) => {if (event.key === 'Escape') {setExpanded(false); setSelected(null); trigger.current?.focus({ preventScroll: true });}};
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [selected, expanded]);
  function play(id: string, source = release) {
    if (performance.now() < suppressTrackClick.current) return;
    if (!source) return;
    const sourceUrl=new URL(window.location.href);
    sourceUrl.searchParams.delete('focusTrack');sourceUrl.searchParams.delete('focusRelease');
    if(activePlaylist)sourceUrl.searchParams.set('playlist',activePlaylist);
    else sourceUrl.searchParams.delete('playlist');
    if(appliedSearch)sourceUrl.searchParams.set('search',appliedSearch);
    else sourceUrl.searchParams.delete('search');
    const sourceHref=sourceUrl.pathname+sourceUrl.search+sourceUrl.hash;
    const queue = releases.flatMap(r => {
      return r.tracks.filter(t => t.audioUrl).map(t => {
        const disc = vinylDisc(t.position);
        const frontCoverUrl = coverMobile(r, disc);
        const frontCoverFullUrl = coverFull(r, disc);
        const backCoverUrl = getBackCoverUrl(r, disc);
        const backCoverMobileUrl = getBackCoverUrl(r, disc, 'thumb');
        const backCoverMediumUrl = getBackCoverUrl(r, disc, 'medium');
        const backSide = Boolean(backCoverUrl) && isBackSidePosition(t.position);
        return { ...t, waveformData: t.waveformData || [], artist: r.artist,
          coverUrl: backSide ? backCoverMobileUrl : frontCoverUrl,
          coverFullUrl: backSide ? backCoverUrl : frontCoverFullUrl,
          frontCoverUrl, frontCoverFullUrl, frontCoverMobileUrl:coverMobile(r, disc), backCoverUrl, backCoverMobileUrl, backCoverMediumUrl,
          coverSide: backSide ? 'back' as const : 'front' as const,
          releaseId: r.id, isPublic: Boolean(r.isMix), isOriginal: r.isOriginal,
          playbackSource: { section: favoritesMode ? 'favorites' as const : activePlaylist ? 'playlists' as const : originalsMode ? 'originals' as const : mixesMode ? 'mixes' as const : 'collection' as const, name: activePlaylistName || undefined, href:sourceHref } };
      });
    });
    if (currentTrack?.id === id) {togglePlayback(); return;}
    const index = queue.findIndex(t => t.id === id);
    if (index >= 0) {
      const display = isTrackCollection || mixesMode ? queue : queue.filter(track => track.releaseId === source.id);
      playQueue(queue, index, display);
    }
  }
  async function movePlaylistTrack(from: string, to: string, side: 'before' | 'after' = 'before') {
    if (!activePlaylist || savingOrder || from === to) return;
    const playlist = playlists.find(p => p.id === activePlaylist);
    if (!playlist) return;
    const ids = [...playlist.items].sort((a,b) => a.sortOrder-b.sortOrder).map(i => i.track.id);
    const oldIndex = ids.indexOf(from);
    if (oldIndex < 0 || !ids.includes(to)) return;
    ids.splice(oldIndex,1);
    const targetIndex = ids.indexOf(to);
    ids.splice(side === 'after' ? targetIndex + 1 : targetIndex,0,from);
    setSavingOrder(true); setOrderStatus('');
    try {await reorderTracks(activePlaylist, ids); setOrderStatus(ru ? 'Порядок сохранён' : 'Order saved');}
    catch {setOrderStatus(ru ? 'Не удалось сохранить порядок. Попробуйте снова.' : 'Could not save order. Try again.');}
    finally {setSavingOrder(false);}
  }
  function trackActions(id: string) {
    return <div className="paper-track-actions" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
      <FavoriteButton trackId={id} lang={uiLang} alwaysVisible />
      <TrackPlaylistMenu trackId={id} lang={uiLang} portal />
    </div>;
  }
  // Keep the complete queue, but mount only covers close to the viewport.
  const isLayoutTransition = isDragging || autoLayout || (gridMix > 0 && gridMix < 1) || (listMix > 0 && listMix < 1);
  const overscan = isLayoutTransition
    ? Math.max(500, sleeveSize * 2)
    : listMix > 0
      ? Math.max(260, listSize * 2)
      : gridMix >= 1
        ? Math.max(220, gridSize)
        : Math.max(120, sleeveSize * .65);
  const scrollY = isDragging || autoLayout
    ? gridPan * (1-listMix) + listPan * listMix : windowScroll;
  const sideTravel = selected !== null
    ? (sleeves[selected]?.position || 0) - viewport.width / 2
    : isDragging || autoLayout ? travel.current.current : windowTravel;
  const rawVisibleIndices = releases.flatMap((r, i) => {
    if (stackMode) {
      if (selected !== null) return Math.abs(i - selected) <= 8 ? [i] : [];
      const distance = sleeves[i].position - sideTravel - viewport.width / 2;
      if (viewport.width <= 700) return Math.abs(distance * 4) < viewport.height / 2 + 300 ? [i] : [];
      return Math.abs(distance) < viewport.height / 2 + 220 ? [i] : [];
    }
    if (selected === i || hovered === i || r.tracks.some(t => t.id === dragTrack)) return [i];
    const split = selected === null ? 0 : i < selected ? -1 : 1;
    const along = sleeves[i].position - sideTravel + split * (expanded ? 420 : 220);
    const sideX = along - sleeveSize * .38;
    const shelfSlope = viewport.width <= 700 ? .28 : .5625;
    const shelfFloor = viewport.width <= 700 ? mobileGeometry.shelfFloor : viewport.height;
    const sideY = shelfFloor - along * shelfSlope - sleeveSize * .715 + sleeves[i].rise;
    const gridY = gridBounds.top + 12 + Math.floor(i / columns) * cell;
    const x = sideX * (1-gridMix) + (gridLeft + i % columns * cell) * gridMix;
    const y = listMix > 0
      ? gridY * (1-listMix) + listLayout.positions[i] * listMix - scrollY
      : sideY * (1-gridMix) + (gridY - (gridMix < 1 ? gridPan : scrollY)) * gridMix;
    const height = listMix > 0 ? Math.max(listSize, viewport.width <= 700 ? 92 + (r.trackCount ?? r.tracks.length) * 24 : 114 + (r.trackCount ?? r.tracks.length) * 36) : sleeveSize * 1.5;
    const nearY = y + height >= -overscan && y <= viewport.height + overscan;
    const nearX = gridMix >= 1 || x + sleeveSize >= -overscan && x <= viewport.width + overscan;
    return nearY && nearX ? [i] : [];
  });
  const shelfVisibleIndices = useRef<number[]>([]);
  const visibleCatalogKey = useMemo(() => releases.map(item => item.id).join('\0'), [releases]);
  const previousVisibleCatalogKey = useRef(visibleCatalogKey);
  if (previousVisibleCatalogKey.current !== visibleCatalogKey) {
    shelfVisibleIndices.current = [];
    previousVisibleCatalogKey.current = visibleCatalogKey;
  }
  const visibleIndices = (shelfTransitioning && !stackMode) || stackTransitioning || dragLayout !== null
    ? mergeVisibleReleaseIndices(shelfVisibleIndices.current, rawVisibleIndices, releases.length)
    : rawVisibleIndices;
  shelfVisibleIndices.current = visibleIndices;
  // Outgoing covers still need their morph, not off-screen track controls,
  // waveform mounts, detail requests and synchronous height measurements.
  const trackVisibleIndices = listMix >= 1 ? rawVisibleIndices : visibleIndices;
  const measuredCardKey = trackVisibleIndices.map(index => releases[index].id).join('\0');
  const measureMobileCards = viewport.width <= 700 && listMix >= 1 && !isTrackCollection;
  useLayoutEffect(() => {
    if (!measureMobileCards) return;
    const cards = Array.from(stage.current?.querySelectorAll<HTMLElement>('.paper-list-tracks[data-release-id]') || []);
    return observeCardHeights(cards, listSize, heights => {
      setMobileCardHeights(previous => Object.keys(heights).every(id => previous[id] === heights[id]) ? previous : { ...previous, ...heights });
    });
  }, [measureMobileCards, measuredCardKey, listSize]);
  // Stack and Shelf expose different windows. Warm the nearby Shelf edges
  // while Stack is idle, using the same mobile/desktop source as <picture>.
  const warmedCovers = useRef(new Set<string>());
  const shelfWarmUrls = stackMode && selected === null
    ? releases.map((r, i) => ({ r, x: sleeves[i].position - sideTravel - sleeveSize * .38 }))
      .filter(({ x }) => x + sleeveSize >= -120 && x <= viewport.width + 120)
      .sort((a, b) => Math.abs(a.x - viewport.width / 2) - Math.abs(b.x - viewport.width / 2))
      .map(({ r }) => viewport.width > 700 ? coverFull(r) : coverMedium(r))
    : [];
  const shelfWarmKey = JSON.stringify(shelfWarmUrls);
  useEffect(() => {
    let stop: (() => void) | undefined;
    const timer = setTimeout(() => {
      if (!document.hidden) {
        const loaded = new Set<string>();
        stage.current?.querySelectorAll<HTMLImageElement>('.paper-record-front img').forEach(image => {
          if (image.complete && image.naturalWidth > 0) loaded.add(image.currentSrc || image.src);
        });
        const urls: string[] = JSON.parse(shelfWarmKey);
        stop = warmCoverImages(urls.filter(url => !loaded.has(new URL(url, location.href).href)), warmedCovers.current);
      }
    }, 180);
    return () => { clearTimeout(timer); stop?.(); };
  }, [shelfWarmKey]);
  useLayoutEffect(() => {
    const frames = coverTransitionFrames.current;
    const root = stage.current;
    if (!root) return;
    const playCompositorCards = (context: NonNullable<typeof coverEntryTransition.current>) => {
      const scrollTop = root.querySelector<HTMLElement>('.paper-row')?.scrollTop ?? 0;
      const plans = Array.from(root.querySelectorAll<HTMLElement>('.paper-record'))
        .filter(card => !context.animated.has(card)).map(card => {
          const style = getComputedStyle(card);
          const destination: Keyframe = {
            left: style.left, top: style.top, width: style.width, height: style.height,
            margin: style.margin, transform: style.transform,
            transformOrigin: style.transformOrigin, opacity: style.opacity,
          };
          const captured = context.frames.get(card.dataset.index!);
          const previous = captured ?? coverEntryFrame(context.frames, card.dataset.index!, destination, context.scene);
          const keyframes = coverCompositorFrames(
            { ...previous, top: `${parseFloat(String(previous.top)) + scrollTop}px` }, destination,
          );
          return {card,keyframes,captured};
        });
      const duration = Math.max(360, context.duration - (performance.now() - context.started));
      plans.forEach(({card,keyframes,captured}) => {
        context.animated.add(card);
        card.dataset.coverMotion = captured ? 'morph' : 'fly-in';
        if (keyframes) coverTransitionAnimations.current.push(card.animate(keyframes, {
          duration, easing: context.easing,
        }));
      });
    };
    if (!frames) {
      const context = coverEntryTransition.current;
      if (compositorScroll && context && (stackTransitioning || shelfTransitioning)
        && performance.now() - context.started < context.duration) playCompositorCards(context);
      else if (!stackTransitioning && !shelfTransitioning) coverEntryTransition.current = null;
      return;
    }
    coverTransitionFrames.current = null;
    const stackStep = coverTransitionStackStep.current;
    coverTransitionStackStep.current = null;
    // React replaces className during the commit. Reapply the guard here so
    // computed styles are the final layout, not the first frame of a newly
    // started CSS transition (which would animate back to the old position).
    root.classList.add('is-cover-rebasing');
    const row = root.querySelector<HTMLElement>('.paper-row');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (compositorScroll && (coverTransitionIsLayout.current || (!stackMode && gridMix < .01))) {
      // Finish all reads before starting animations. Width/top/left are never keyframes.
      if (!reduced) {
        const context = {frames,scene:coverTransitionSource.current,started:performance.now(),
          duration:coverTransitionIsLayout.current ? 1200 : 1050,
          easing:coverTransitionIsLayout.current ? 'cubic-bezier(.45,0,.2,1)' : 'cubic-bezier(.19,1,.22,1)',
          animated:new WeakSet<HTMLElement>()};
        coverEntryTransition.current = context;
        playCompositorCards(context);
        if (listMix >= 1) root.querySelectorAll<HTMLElement>('.paper-list-tracks').forEach(article => {
          coverTransitionAnimations.current.push(article.animate([
            { opacity: 0, transform: 'translate3d(0,14px,0)' },
            { opacity: 1, transform: 'translate3d(0,0,0)' },
          ], { duration: 450, delay: 350, fill: 'backwards', easing: 'cubic-bezier(.16,1,.3,1)' }));
        });
      }
      root.classList.remove('is-cover-rebasing');
      return;
    }
    root.querySelectorAll<HTMLElement>('.paper-record').forEach(card => {
      const style = getComputedStyle(card);
      const destination: Keyframe = {
        left: style.left, top: style.top, width: style.width, height: style.height,
        margin: style.margin, transform: style.transform,
        transformOrigin: style.transformOrigin, opacity: style.opacity,
      };
      const previous = frames.get(card.dataset.index!)
        ?? (stackStep === null ? undefined : extrapolateStackCoverFrame(frames, card.dataset.index!, stackStep));
      if (!reduced && previous) coverTransitionAnimations.current.push(card.animate([
        { ...previous, top: `${parseFloat(String(previous.top)) + (row?.scrollTop ?? 0)}px` },
        destination,
      ], {
        duration: coverTransitionIsLayout.current ? 1200 : 1050,
        easing: coverTransitionIsLayout.current ? 'cubic-bezier(.45,0,.2,1)' : 'cubic-bezier(.19,1,.22,1)',
      }));
    });
    root.classList.remove('is-cover-rebasing');
  });
  useEffect(() => () => coverTransitionAnimations.current.forEach(animation => animation.cancel()), []);
  useLayoutEffect(() => {
    const frames = stackGridFrames.current;
    if (!frames || stackMode || gridMix < 1) return;
    stackGridFrames.current = null;
    const row = stage.current?.querySelector<HTMLElement>('.paper-row');
    // Capture final grid geometry after its scroll anchor has been applied.
    stage.current?.querySelectorAll<HTMLElement>('.paper-record').forEach(card => {
      const style = getComputedStyle(card);
      const destination: Keyframe = {
        left: style.left, top: style.top, width: style.width, height: style.height,
        margin: style.margin, transform: style.transform, opacity: style.opacity,
      };
      const previous = frames.get(card.dataset.index!);
      const origin: Keyframe = previous
        ? { ...previous, top: `${parseFloat(String(previous.top)) + (row?.scrollTop ?? 0)}px` }
        : { ...destination, opacity: 0 };
      stackGridAnimations.current.push(card.animate([origin, destination], {
        duration: 900, easing: 'cubic-bezier(.22,1,.36,1)',
      }));
    });
  }, [stackMode, gridMix]);
  useEffect(() => () => stackGridAnimations.current.forEach(animation => animation.cancel()), []);
  const isShelfLayout = !stackMode && gridMix < .01 && listMix < .01;
  const priorityCoverStart = Math.max(0, Math.floor((visibleIndices.length - 6) / 2));
  // SSR starts with a desktop-sized viewport. Also prioritize the covers that
  // will be central on a typical mobile screen before hydration corrects it.
  const mobileFirstView = viewport.width === 1280 && viewport.height === 720 && isShelfLayout
    ? visibleIndices.filter(i => {
        const x = sleeves[i].position - sideTravel - 180 * .38;
        return x + 180 >= -120 && x <= 390 + 120;
      })
    : [];
  const mobilePriorityStart = Math.max(0, Math.floor((mobileFirstView.length - 6) / 2));
  const mobilePriorityIndices = new Set(mobileFirstView.slice(mobilePriorityStart, mobilePriorityStart + 6));
  const detailIds = [...new Set([
    ...(expanded && release?.tracksLoaded === false ? [release.id] : []),
    ...(listMix > .85 ? trackVisibleIndices.map(i => releases[i]).filter(r => r.tracksLoaded === false).map(r => r.id) : []),
  ])].filter(id => !detailErrors[id]);
  const detailKey = JSON.stringify(detailIds);
  useEffect(() => {
    let cancelled = false;
    const ids = JSON.parse(detailKey) as string[];
    let cursor = 0;
    async function worker() {
      while (!cancelled && cursor < ids.length) {
        const id = ids[cursor++];
        await loadReleaseDetails(id).catch(() => {});
      }
    }
    for (let i = 0; i < Math.min(3, ids.length); i++) void worker();
    return () => { cancelled = true; };
  }, [detailKey, user?.id]);
  function readCollectionPosition() {
    const last = Math.max(0, releases.length - 1);
    if (selected !== null) return { index: selected, progress: last ? selected / last : 0 };
    const row = stage.current?.querySelector<HTMLElement>('.paper-row');
    if (gridMix >= 1 && row) {
      const maximum = Math.max(0, row.scrollHeight - row.clientHeight);
      const progress = maximum ? row.scrollTop / maximum : 0;
      const center = row.scrollTop + (gridBounds.top + viewport.height - gridBounds.bottom) / 2;
      let index = 0;
      if (listMix > .5) {
        listLayout.positions.forEach((y, i) => {
          if (Math.abs(y + listSize / 2 - center) < Math.abs((listLayout.positions[index] || 0) + listSize / 2 - center)) index = i;
        });
      } else index = Math.round((center - gridBounds.top - 12 - gridSize / 2) / cell) * columns + Math.floor(columns / 2);
      if (row.scrollTop <= 1) index = 0;
      else if (maximum > 0 && row.scrollTop >= maximum - 1) index = last;
      return { progress, index: Math.max(0, Math.min(last, index)) };
    }
    const center = travel.current.current + viewport.width / 2;
    let index = 0;
    sleeves.forEach((sleeve, i) => {
      if (Math.abs(sleeve.position - center) < Math.abs((sleeves[index]?.position || 0) - center)) index = i;
    });
    const maximum = sleeves.at(-1)?.position || 0;
    return { index, progress: maximum ? center / maximum : 0 };
  }
  const coverFlipControl = expanded && backCoverUrl ? <button type="button" className="paper-cover-flip paper-cover-flip--icon" aria-pressed={isCoverFlipped}
    aria-label={isCoverFlipped ? (ru?'Показать лицевую сторону':'Show front side') : (ru?'Показать обратную сторону':'Show back side')}
    title={isCoverFlipped ? (ru?'Показать лицевую сторону':'Show front side') : (ru?'Показать обратную сторону':'Show back side')}
    onClick={event=>{event.stopPropagation();if(release)setCoverSideOverrides(previous=>toggleReleaseCoverSide(previous,release,currentTrack,isTrackCollection));}}><Rotate3D size={17}/></button> : null;
  return <section ref={stage}
    data-scroll-motion={compositorScroll ? 'transform' : 'legacy'}
    data-layout={activeLayout}
    data-player-layout={activeLayout === 'stack' ? 'stack' : listMix > 0 ? 'tracks' : 'shelf'}
    style={{ '--drag-shelf': dragLayout === null ? 0 : Math.max(0, 1-dragLayout), '--drag-stack': dragLayout === null ? 0 : Math.max(0, 1-Math.abs(dragLayout-1)), '--drag-grid': dragLayout === null ? 0 : Math.max(0, Math.min(1, dragLayout-1)), '--grid-mix': gridMix, '--list-mix': listMix, '--list-size': `${listSize}px`, '--side-size': `${sideSize}px`, '--grid-size': `${gridSize}px`, '--grid-top': `${gridBounds.top}px`, '--grid-bottom': `${gridBounds.bottom}px` } as CSSProperties} className={`home-stage home-stage--shelf paper-archive${dragLayout !== null && dragLayout < 2 ? ' is-middle-morph' : ''}${motionEnabled ? ' has-motion' : ''}${release ? ' is-open' : ''}${expanded ? ' is-expanded' : ''}${filtering ? ' is-filtering' : ''}${isDragging || autoLayout ? ' is-stretching' : ''}${stackMode ? ' is-stack' : ''}${stackTransitioning ? ' is-stack-transitioning' : ''}${stackMode && stackSpread ? ' is-stack-spread' : ''}${gridMix >= 1 ? ' is-grid' : ''}${listMix > 0 ? ' is-listing' : ''}${isTrackCollection || playlistTransition || (mixesMode && listMix > 0) ? ' is-playlist' : ''}${mixesMode ? ' is-mixes' : ''}${originalsMode ? ' is-originals' : ''}`} aria-label={originalsMode ? 'Tracks' : mixesMode ? 'Mixes' : 'Vinyl collection'} onPointerMoveCapture={e => {
    if (e.pointerType === 'touch' || motionEnabled) return;
    e.currentTarget.classList.add('has-motion');
    setMotionEnabled(true);
  }} onFocusCapture={e => {
    if (motionEnabled) return;
    e.currentTarget.classList.add('has-motion');
    setMotionEnabled(true);
  }} onPointerDownCapture={() => setMotionEnabled(true)} onKeyDownCapture={() => setMotionEnabled(true)} onClick={e => {
    if (!(e.target instanceof Element) || e.target.closest('.paper-record, .paper-tracklist, a, button, input')) return;
    if (selected !== null && !stackMode && gridMix < .01 && listMix < .01) {
      captureCoverTransition();
      protectShelfTransition();
      settleShelfMotion();
    }
    setExpanded(false);
    setSelected(null);
    setHovered(null);
  }}>
    <header className="paper-header">
      <ArchivePageHeader lang={uiLang} search={search} searchStatus={searchStatus} onSearchChange={value => {setSearch(value);filterByStyle(null,value);}} activeLayout={activeLayout} onLayoutChange={changeCollectionLayout} onHome={() => {if (mixesMode || favoritesMode) navigateSection('/','collection');else {setPendingSection(null);selectPlaylist(null);}}} />
      {(viewport.width > 700 || mobileContextHeading || release) && <h1 className="paper-heading" aria-label={mobileContextHeading ? `${mobileSectionName}: ${mobileContextName}` : headingRelease ? `${headingRelease.artist} : ${headingRelease.title}` : 'Vinyl collection'}>
        <span className="paper-heading-window paper-heading-artist">{mobileContextHeading ? <button type="button" className="paper-heading-picker" aria-haspopup="dialog" aria-expanded={mobilePicker === 'sections'} aria-label={ru ? 'Выбрать раздел' : 'Choose section'} onClick={() => setMobilePicker('sections')}><span className={`paper-heading-section paper-heading-section-${mobileSectionKey}`}>{mobileSectionKey==='originals'?<AudioLines size={14}/>:mobileSectionKey==='favorites'?<Heart size={14}/>:mobileSectionKey==='mixes'?<Disc3 size={14}/>:mobileSectionKey==='playlists'?<ListMusic size={14}/>:<Library size={14}/>}<b>{mobileSectionName}</b><sup>{mobileSectionCount}</sup></span><ChevronDown aria-hidden="true" /></button> : <span key={headingRelease?.artist}>{headingRelease?.artist || (ru ? 'Коллекция винила' : 'Vinyl collection')}</span>}</span>
        {!(mobileContextHeading && favoritesMode) && <>
          <span className="paper-heading-colon" aria-hidden={!mobileContextName && mobileContextHeading}>:</span>
          <span className="paper-heading-window paper-heading-title">{mobileContextHeading ? <button type="button" className="paper-heading-picker" aria-haspopup="dialog" aria-expanded={mobilePicker === mobileContextPicker} aria-label={mobileContextPickerLabel} onClick={() => setMobilePicker(mobileContextPicker)}><span className="paper-heading-context" data-context-section={mobileSectionKey}>{mobileContextName || (ru ? 'Все треки' : 'All tracks')}{mobileSectionKey === 'collection' ? <sup><CollectionPosition count={releases.length} read={readCollectionPosition} /></sup> : mobileContextCount!==null?<sup>{mobileContextCount}</sup>:null}</span><ChevronDown aria-hidden="true" /></button> : <span key={headingRelease?.id} className="paper-release-title-regular">{headingRelease?.title || ''}</span>}</span>
        </>}
      </h1>}
    </header>
    <MobileCollectionPicker kind={mobilePicker} ru={ru} section={mobileSectionKey}
      music={releases.map(item => ({id:item.id,artist:item.artist,title:item.title}))}
      onMusic={id => {
        const index = releases.findIndex(item => item.id === id);
        if (index < 0) return;
        setHovered(index);
        if (stackMode) {setExpanded(false);setSelected(index);return;}
        const row = stage.current?.querySelector<HTMLElement>('.paper-row');
        const top = listMix > .5 ? (listLayout.positions[index] || 0) : gridBounds.top + 12 + Math.floor(index / columns) * cell;
        row?.scrollTo({top:Math.max(0,top-gridBounds.top),behavior:'smooth'});
      }}
      sections={[
        { key: 'collection', label: ru ? 'Коллекция' : 'Collection', count: collectionCount ?? counts.releases },
        { key: 'playlists', label: ru ? 'Плейлисты' : 'Playlists', count: counts.playlists },
        { key: 'mixes', label: ru ? 'Миксы' : 'Mixes', count: mixCount ?? counts.mixes },
        { key: 'originals', label: ru ? 'Треки' : 'Tracks', count: originalCount ?? counts.originals },
        { key: 'favorites', label: ru ? 'Избранное' : 'Favorites', count: counts.favorites },
      ]}
      genres={styleCounts} selectedGenres={activeStyles} maxGenres={MAX_SELECTED_STYLES}
      playlists={playlists.map(playlist => ({ id: playlist.id, name: playlist.name, count: playlist.items.length }))} selectedPlaylist={activePlaylist}
      onClose={() => setMobilePicker(null)} onSection={chooseMobileSection} onPlaylist={selectPlaylist}
      onGenres={styles => applyStyleSelection(normalizeStyleSelection(styles, new Set(styleCounts.map(([style]) => style))))} />
    <div className="paper-row" aria-label={originalsMode ? 'All tracks' : mixesMode ? 'All mixes' : 'All releases'} onScroll={e => {
      setWindowScroll(Math.floor(e.currentTarget.scrollTop / 128) * 128);
    }} onPointerDown={e => {
      if (e.pointerType === 'touch' && gridMix < 1) {
        if (!e.isPrimary) return;
        stopAutoLayout();
        settleShelfMotion();
        const stackScale = stackMode ? Math.abs(parseFloat(getComputedStyle(e.currentTarget).getPropertyValue('--stack-distance-scale')) || -1.6) : 0;
        touchDrag.current = { x: e.clientX, y: e.clientY, stackScale, travel: travel.current.current, selected, step: 0, lastOffset:travel.current.current, lastTime:performance.now(), velocity:0 };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      if (e.button !== 1) return;
      e.preventDefault();
      stopAutoLayout();
      settleShelfMotion();
      const mode = stackMode ? 1 : listMix > .5 ? 3 : gridMix >= .5 ? 2 : 0;
      let anchor = selected ?? 0;
      const centerY = (gridBounds.top + viewport.height - gridBounds.bottom) / 2;
      if (selected === null && gridMix >= 1) {
        const viewedY = e.currentTarget.scrollTop + centerY;
        if (listMix > .5) {
          listLayout.positions.forEach((y, i) => { if (Math.abs(y + listSize / 2 - viewedY) < Math.abs((listLayout.positions[anchor] || 0) + listSize / 2 - viewedY)) anchor = i; });
        } else anchor = Math.min(releases.length - 1, Math.max(0, Math.round((viewedY - gridBounds.top - 12 - gridSize / 2) / cell) * columns + Math.floor(columns / 2)));
      } else if (selected === null) {
        const x = travel.current.current + viewport.width / 2;
        sleeves.forEach((sleeve, i) => { if (Math.abs(sleeve.position - x) < Math.abs((sleeves[anchor]?.position || 0) - x)) anchor = i; });
      }
      setGridPan(Math.max(0, gridBounds.top + 12 + Math.floor(anchor / columns) * cell + gridSize / 2 - centerY));
      setListPan(Math.max(0, (listLayout.positions[anchor] || 0) + listSize / 2 - centerY));
      middleDrag.current = {
        y: e.clientY,
        mode, progress: mode, anchor,
      };
      setSelected(null); setExpanded(false); setStackMode(false); setStackSpread(false);
      setIsDragging(true);
      applyMiddleLayout(mode, anchor);
      e.currentTarget.setPointerCapture(e.pointerId);
      setHovered(null);
      wheelLock.current = performance.now() + 450;
    }} onPointerMove={e => {
      if (touchDrag.current) {
        if (!e.isPrimary) return;
        const drag = touchDrag.current;
        const pixels = drag.stackScale ? e.clientY - drag.y : drag.x - e.clientX;
        if (Math.abs(pixels) < 4) return;
        // Stack travel is magnified by its CSS projection; keep covers under the finger.
        const delta = drag.stackScale ? pixels / drag.stackScale : pixels;
        suppressCoverClick.current = performance.now() + 300;
        if (touchDrag.current.selected !== null) {
          const step = Math.trunc(pixels / Math.max(52, (drag.stackScale ? viewport.height : viewport.width) * .16));
          if (step !== touchDrag.current.step) {
            touchDrag.current.step = step;
            const next = Math.max(0,Math.min(releases.length-1,touchDrag.current.selected + step));
            if (compositorScroll && !stackMode && gridMix < .01 && next !== selected) {
              captureCoverTransition();
              protectShelfTransition();
            }
            setSelected(next);
            if (!drag.stackScale) setExpanded(false);
            setHovered(null);
          }
          return;
        }
        stage.current?.classList.add('is-scrolling');
        setHovered(null);
        const min = -viewport.width / 2;
        const max = Math.max(min, (sleeves.at(-1)?.position || 0) - viewport.width / 2);
        const offset = Math.max(min, Math.min(max, touchDrag.current.travel + delta));
        const now = performance.now();
        const elapsed = now - touchDrag.current.lastTime;
        if (elapsed > 0) {
          const speed = (offset - touchDrag.current.lastOffset) / elapsed;
          touchDrag.current.velocity = elapsed > 80 ? speed : touchDrag.current.velocity * .25 + speed * .75;
        }
        touchDrag.current.lastOffset = offset;
        touchDrag.current.lastTime = now;
        travel.current = { current: offset, target: offset };
        if (!drawCompositedTravel(offset)) {
          transportOrigin.current = offset;
          stage.current?.style.setProperty('--travel', `${offset}px`);
          if (transport.current) transport.current.style.transform = 'none';
        }
        setWindowTravel(Math.floor(offset / 128) * 128);
        return;
      }
      if (!middleDrag.current) {
        if (stackMode) {
          if (selected !== null || stackTransitioning || scrollFrame.current || performance.now() < hoverResumeAt.current || e.pointerType !== 'mouse') return;
          const pointedCover = e.target instanceof Element ? e.target.closest<HTMLElement>('.paper-record') : null;
          // Follow the visible, displaced sleeve rather than its resting position.
          if (pointedCover) {
            const nextHover = Number(pointedCover.dataset.index);
            if (Number.isInteger(nextHover) && nextHover !== hovered) setHovered(nextHover);
          } else if (hovered !== null) {
            const activeCover = e.currentTarget.querySelector<HTMLElement>(`.paper-record[data-index="${hovered}"]`);
            const bounds = activeCover?.getBoundingClientRect();
            // Preserve the preview across vertical gaps; leaving the deck sideways closes it.
            if (!bounds || e.clientX < bounds.left - 20 || e.clientX > bounds.right + 20) setHovered(null);
          }
          return;
        }
        // Only actual pointer movement changes hover, never a sleeve moving
        // underneath a stationary pointer during scrolling or its own lift.
        if (scrollFrame.current || performance.now() < hoverResumeAt.current || (gridMix > 0 && gridMix < 1) || e.pointerType === 'touch') return;
        const target = e.target instanceof Element ? e.target.closest<HTMLElement>('.paper-record, .paper-list-tracks') : null;
        const targetIndex = target ? Number(target.dataset.index) : null;
        // The first/only sleeve is already fully exposed and must stay still.
        setHovered(targetIndex !== null && releases.length > 1 && targetIndex > 0 ? targetIndex : null);
        return;
      }
      const drag = middleDrag.current;
      const next = Math.max(0, Math.min(3, drag.mode + (drag.y - e.clientY) / Math.max(160, viewport.height * .25)));
      drag.progress = next;
      suppressCoverClick.current = performance.now() + 400;
      applyMiddleLayout(next, drag.anchor);
    }} onPointerUp={e => {
      if (e.pointerType === 'touch') {
        if (!e.isPrimary) return;
        const drag = touchDrag.current;
        touchDrag.current = null;
        stage.current?.classList.remove('is-scrolling');
        if (drag && drag.selected === null && performance.now() - drag.lastTime < 80 && Math.abs(drag.velocity) > .05 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          const maxSpeed = 2.5 / (drag.stackScale || 1);
          let speed = Math.max(-maxSpeed,Math.min(maxSpeed,drag.velocity));
          let lastTime = performance.now();
          const min = -viewport.width / 2;
          const max = Math.max(min,(sleeves.at(-1)?.position || 0)-viewport.width / 2);
          stage.current?.classList.add('is-scrolling');
          setHovered(null);
          const coast = (now:number) => {
            const elapsed = Math.min(32,now-lastTime);
            lastTime = now;
            const previous = travel.current.current;
            const decay = Math.exp(-elapsed / 240);
            const offset = Math.max(min,Math.min(max,previous + speed * 240 * (1-decay)));
            speed *= decay;
            travel.current = {current:offset,target:offset};
            if (!drawCompositedTravel(offset)) {
              transportOrigin.current = offset;
              stage.current?.style.setProperty('--travel',`${offset}px`);
              if (transport.current) transport.current.style.transform = 'none';
            }
            setWindowTravel(Math.floor(offset / 128) * 128);
            if (Math.abs(speed) > .025 && offset > min && offset < max) scrollFrame.current = requestAnimationFrame(coast);
            else {
              scrollFrame.current = 0;
              stage.current?.classList.remove('is-scrolling');
              hoverResumeAt.current = performance.now() + 160;
            }
          };
          scrollFrame.current = requestAnimationFrame(coast);
        }
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        return;
      }
      if (e.button !== 1) return;
      finishMiddleLayout();
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    }} onLostPointerCapture={() => {if (middleDrag.current) finishMiddleLayout();if(touchDrag.current)stage.current?.classList.remove('is-scrolling');touchDrag.current = null;}} onPointerCancel={() => {if (middleDrag.current) finishMiddleLayout();if(touchDrag.current)stage.current?.classList.remove('is-scrolling');touchDrag.current = null;}} onAuxClick={e => {if(e.button === 1) e.preventDefault();}} onPointerLeave={() => setHovered(null)}><div className="paper-transport" ref={transport}>{visibleIndices.map((i, visibleRank) => {
      const r = releases[i];
      const p = sleeves[i].position / 24;
      const side = selected === null ? 0 : gridMix >= 1 ? (i % columns < Math.ceil(columns / 2) ? -1 : 1) : i < selected ? -1 : 1;
      const isPriorityCover = selected === i || mobilePriorityIndices.has(i) || (visibleRank >= priorityCoverStart && visibleRank < priorityCoverStart + 6);
      const recordSide = releaseCoverSide(r, currentTrack, coverSideOverrides[r.id], isTrackCollection);
      const disc = isTrackCollection && isTrackListInteractive ? vinylDisc(r.tracks[0]?.position) : recordSide.disc;
      const showBackCover = isTrackCollection && isTrackListInteractive
        ? trackRowCoverSide(r)
        : recordSide.back;
      return <div key={`${r.id}-${isTrackCollection ? r.tracks[0]?.id : ''}`} data-index={i} className={`paper-record${selected === i ? ' is-selected' : ''}${showBackCover ? ' is-flipped' : ''}${selected !== null && gridMix === 0 && (i === selected + 1 || i === 0) ? ' is-front-sleeve' : ''}${hovered === i && selected !== i ? ' is-hovered' : ''}${r.tracks.some(track=>track.id===currentTrack?.id) ? ' is-playing' : ''}`}
style={{ '--position': p, '--stack-hover-offset': `calc(var(--stack-size) * ${stackMode && selected === null && hovered !== null ? (i > hovered ? -.12 : i < hovered ? .23 : -.03) : 0})`, '--rise': `${sleeves[i].rise}px`, '--stack-relative': selected === null ? 0 : selected - i, '--stack-side': selected === null ? 0 : Math.sign(selected - i), '--grid-x': `${gridLeft + (i % columns) * cell}px`, '--grid-y': `${gridBounds.top + 12 + Math.floor(i / columns) * cell - (gridMix < 1 ? gridPan : 0)}px`, '--list-y': `${listLayout.positions[i]}px`, '--mix-list-x': `${3 + (i % 2) * 48.5}vw`, '--mix-column': i % 2, '--grid-side-x': `${i % columns < Math.ceil(columns / 2) ? 12 + (i % columns) * sideStep : viewport.width - sideSize - 12 - (columns - 1 - i % columns) * sideStep}px`, '--split': side, zIndex: selected === i ? releases.length + 2 : releases.length - i } as CSSProperties}
        >
        <button type="button" className="paper-record-open" aria-label={`${r.artist} — ${r.title}`} aria-expanded={selected === i}
        onFocus={() => {if(!stackMode && !scrollFrame.current && releases.length > 1 && i > 0) setHovered(i);}} onBlur={() => setHovered(null)}
        onClick={e => {
          if (performance.now() < suppressCoverClick.current) return;
          trigger.current = e.currentTarget;
          if (!stackMode && gridMix < .01 && listMix < .01) captureCoverTransition();
          stopAutoLayout();
          if (gridMix < .01 && listMix < .01) protectShelfTransition();
          settleShelfMotion();
          if (stackMode) {
            if (selected === i && expanded) {
              setExpanded(false);
              setSelected(null);
              setStackSpread(false);
            } else {
              setSelected(i);
              setStackSpread(true);
              setExpanded(true);
            }
            setHovered(null);
            return;
          }
          if (isTrackListInteractive) {const track = r.tracks.find(t => t.audioUrl); if(track) play(track.id,r); return;}
          if (gridMix > 0) {
            setStretch(1);
            setSelected(selected === i ? null : i);
            setExpanded(selected !== i);
          } else if(selected === i) setExpanded(v => !v);
          else {setSelected(i); setExpanded(false);}
          setHovered(null);
        }}>
        {/* The same sleeve moves out of the row and unfolds; no duplicate cover. */}
        <ShelfCoverImage deckPreview={gridMix < .01 && listMix < .01} compactPreview={viewport.width>700 && !stackMode && gridMix < .01 && listMix < .01}
          release={r} disc={disc} flipped={showBackCover} eager={isPriorityCover || stackTransitioning} priority={isPriorityCover} selected={selected === i} highQuality={selected === i && expanded} desktopViewport={viewport.width>700} displaySize={selected === i ? Math.max(sleeveSize,expandedSize) : viewport.width<=700 && gridMix < .01 && listMix < .01 ? mobileDeckCoverSize(viewport.width,viewport.height) : stackMode ? Math.min(viewport.width*.34,viewport.height*.4,420) : listMix>0 ? gridSize*(1-listMix)+listSize*listMix : gridMix>=1 ? gridSize : sleeveSize} /><span className="paper-record-edge" aria-hidden="true" /><span className="paper-record-caption"><b>{r.title}</b>{r.year ? <small>{r.year}</small> : null}</span>
      </button>
      </div>;
    })}
    {listMix > 0 && trackVisibleIndices.map(i => {
      const r = releases[i];
      return <article data-index={i} onFocus={() => setHovered(i)} onBlur={e => {if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHovered(null);}} onClick={() => setHovered(i)}
        onDragOver={e => {const target=r.tracks[0];if(activePlaylist&&dragTrack&&target){e.preventDefault();e.dataTransfer.dropEffect='move';const rect=e.currentTarget.getBoundingClientRect();setDropTarget({trackId:target.id,side:e.clientY<rect.top+rect.height/2?'before':'after'});}}}
        onDrop={e => {const target=r.tracks[0];if(!activePlaylist||!dragTrack||!target)return;e.preventDefault();const rect=e.currentTarget.getBoundingClientRect();void movePlaylistTrack(dragTrack,target.id,e.clientY<rect.top+rect.height/2?'before':'after');setDragTrack(null);setDropTarget(null);suppressTrackClick.current=performance.now()+250;}}
        className={`paper-list-tracks${isTrackCollection ? ' is-compact-track' : ''}${r.tracks.some(track=>track.id===currentTrack?.id) ? ' is-playing' : ''}`} data-release-id={r.id} key={`tracks-${r.id}-${isTrackCollection ? r.tracks[0]?.id : ''}`} style={{ top: (gridBounds.top + 12 + Math.floor(i / columns)*cell)*(1-listMix) + listLayout.positions[i]*listMix, '--release-divider-y': `${((mobileCardHeights[r.id] ?? listSize) + (listLayout.positions[i + 1] ?? listLayout.height - gridBounds.bottom) - listLayout.positions[i]) / 2}px`, opacity:listMix, pointerEvents:isTrackListInteractive ? 'auto':'none' } as CSSProperties}>
        {!isTrackCollection && <>{!mixesMode && <h2><span>{r.artist} : <span className="paper-release-title-regular">{r.title}</span></span>{r.year ? <time dateTime={String(r.year)}>{r.year}</time> : null}</h2>}{getBackCoverUrl(r, releaseCoverSide(r,currentTrack,coverSideOverrides[r.id]).disc) ? <button type="button" className="paper-list-cover-flip" aria-pressed={releaseCoverSide(r,currentTrack,coverSideOverrides[r.id]).back} aria-label={ru?'Перевернуть обложку':'Flip cover'} title={ru?'Перевернуть обложку':'Flip cover'} onClick={event=>{event.stopPropagation();setCoverSideOverrides(previous=>toggleReleaseCoverSide(previous,r,currentTrack));}}><Rotate3D size={16}/></button> : null}</>}
        {mixesMode ? <ShelfMixTrack release={r} lang={uiLang} queueReleases={releases} yearInHeading timelineControls actions={null} onCommentsOpenChange={(open,count)=>setOpenMixComments(current=>{const next=new Map(current);if(open)next.set(r.id,count);else next.delete(r.id);return next;})} /> : r.tracks.map(t => <div key={t.id} data-track-id={t.id} className={`paper-track-line${dragTrack === t.id ? ' is-dragging' : ''}${dropTarget?.trackId === t.id ? ` is-drop-${dropTarget.side}` : ''}${currentTrack?.id === t.id ? ' is-playing' : ''}`}
          draggable={Boolean(activePlaylist) && !savingOrder && isTrackListInteractive}
          onDragStart={e => {if ((e.target as Element).closest('.paper-track-actions')) {e.preventDefault();return;} e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',t.id);setDragTrack(t.id);suppressTrackClick.current=Infinity;}}
          onDragOver={e => {if (activePlaylist && dragTrack) {e.preventDefault();e.dataTransfer.dropEffect='move';const rect=e.currentTarget.getBoundingClientRect();setDropTarget({trackId:t.id,side:e.clientY<rect.top+rect.height/2?'before':'after'});}}}
          onDragEnd={() => {setDragTrack(null);setDropTarget(null);suppressTrackClick.current=performance.now()+250;}}>
          {activePlaylist && <button className="paper-track-grip" disabled={savingOrder} aria-label="Move track. Alt and up or down arrow" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.altKey && (e.key==='ArrowUp'||e.key==='ArrowDown')) {e.preventDefault();const movingDown=e.key==='ArrowDown';const other=releases[i+(movingDown?1:-1)]?.tracks[0];if(other)void movePlaylistTrack(t.id,other.id,movingDown?'after':'before');}}}>⠿</button>}
          <button className="paper-track-play" disabled={!t.audioUrl} onClick={() => play(t.id,r)}>{mixesMode ? null : <small>{isTrackCollection ? i + 1 : t.position || '—'}</small>}<span className={isTrackCollection?'paper-track-primary':undefined}>{isTrackCollection ? <><span className="paper-track-primary-line"><b>{r.artist}</b><em>{t.title}</em></span>{activePlaylist && <span className="paper-release-styles paper-compact-genres" aria-label={ru ? 'Стили релиза' : 'Release styles'}>{r.styles.length ? r.styles.map((style,index) => [index > 0 ? ' · ' : null,<em key={style} className={`paper-release-style${activeStyles.includes(style) ? ' is-active' : ''}`}>{style}</em>]) : (ru ? 'Стиль не указан' : 'Style unavailable')}</span>}</> : t.title}</span>{isTrackCollection && <span className="paper-track-release">{r.title}</span>}</button>
          {!mixesMode && <span className="paper-track-bpm" title="BPM">{t.bpm ?? '—'}</span>}
          {(activePlaylist || (!mixesMode && !favoritesMode)) && <span className="paper-track-key" title="Key">{t.key || '—'}</span>}
          {trackActions(t.id)}<time>{normalizeDurationLabel(t.durationRaw,t.durationSec,'—')}</time>
        </div>)}
        {!r.tracks.length && <p>{r.tracksLoaded === false ? (detailErrors[r.id] ? <button onClick={() => setDetailErrors(current => ({...current,[r.id]:false}))}>{ru ? 'Повторить загрузку' : 'Retry loading'}</button> : (ru ? 'Загрузка треков…' : 'Loading tracks…')) : (ru ? 'Треклист недоступен' : 'Tracklist unavailable')}</p>}
        {!isTrackCollection && !mixesMode && <p className="paper-release-styles" aria-label={ru ? 'Стили релиза' : 'Release styles'}>{r.styles.length ? r.styles.map((style, index) => [index > 0 ? ' · ' : null, <em key={style} className={`paper-release-style${activeStyles.includes(style) ? ' is-active' : ''}`}>{style}</em>]) : (ru ? 'Стиль не указан' : 'Style unavailable')}</p>}
      </article>;
    })}
    </div>{gridMix >= 1 && <div aria-hidden="true" style={{ height: (gridBounds.top + 12 + Math.ceil(releases.length / columns) * cell + Math.max(gridBounds.bottom, viewport.height / 2))*(1-listMix) + listLayout.height*listMix, pointerEvents: 'none' }} />}</div>
    {collectionView && !isLayoutTransition && (stackMode ? viewport.width <= 700 && selected === null : gridMix >= 1 && (listMix >= 1 || selected === null)) && <CollectionNavigator
      releases={releases.map(item => ({ id: item.id, artist: item.artist, title: item.title, cover: coverMobile(item) }))}
      positions={stackMode ? stackNavigatorPositions : navigatorPositions} getScroller={() => stage.current?.querySelector<HTMLElement>('.paper-row') || null}
      transport={stackMode ? { read: () => stackNavigatorState(stackNavigatorPositions, viewport.width, travel.current.current), seek: seekStackCollection } : undefined}
      top={gridBounds.top} bottom={gridBounds.bottom} ru={ru}
      right={listMix < 1 && viewport.width > 700 ? Math.max(0, gridLeft - 52) : undefined}
      playingReleaseId={currentTrack?.playbackSource?.section === 'collection' ? currentTrack.releaseId : undefined}
      playing={isPlaying}
      onRevealOutside={() => {
        if (!currentTrack?.releaseId) return;
        if (filterTimer.current) clearTimeout(filterTimer.current);
        setFiltering(false); activeStylesRef.current = []; setActiveStyles([]); replaceStyleHash([]);
        setSearch(''); setAppliedSearch(''); setSelected(null); setExpanded(false);
        setNavigatorReveal(currentTrack.releaseId);
      }}
    />}
    {stackMode && selected === null && hovered !== null && releases[hovered] && <div
      className="paper-stack-hover-label"
      key={`stack-label-${releases[hovered].id}`}
      style={{ '--hover-position': `${sleeves[hovered].position}px` } as CSSProperties}
    >
      <strong>{releases[hovered].artist}</strong>
      <span className="paper-stack-hover-meta"><span>{releases[hovered].title}</span>{releases[hovered].year ? <span>{releases[hovered].year}</span> : null}</span>
      <p className="paper-release-styles" aria-label={ru ? 'Стили релиза' : 'Release styles'}>{releases[hovered].styles.length ? releases[hovered].styles.map((style, index) => [index > 0 ? ' · ' : null, <em key={style} className={`paper-release-style${activeStyles.includes(style) ? ' is-active' : ''}`}>{style}</em>]) : (ru ? 'Стиль не указан' : 'Style unavailable')}</p>
    </div>}
    {release && (expanded || stackMode) && <aside className={`paper-tracklist${stackMode && !expanded ? ' is-stack-preview' : ''}`} aria-label={`${expanded ? 'Tracks' : 'Release'}: ${release.title}`} key={release.id}>
      {release.isMix ? <><p>{release.artist} <ShelfReleaseYear id={release.id} year={release.year} lang={uiLang} editable={expanded}/></p><h2 className="paper-release-heading"><span>{release.title}</span>{coverFlipControl}</h2></> : <><h2 className="paper-release-heading"><span>{release.artist}</span>{coverFlipControl}</h2><p>{release.title} <ShelfReleaseYear id={release.id} year={release.year} lang={uiLang} editable={expanded}/></p></>}
      {expanded && <>
      <ol>{release.tracks.map((t, i) => <li key={t.id} className={`paper-track-line${currentTrack?.id === t.id ? ' is-playing' : ''}`} style={{ '--line-delay': `${.48 + Math.min(i, 12) * .065}s` } as CSSProperties}><button className="paper-track-play" disabled={!t.audioUrl} onClick={() => play(t.id)} aria-label={`${currentTrack?.id === t.id && isPlaying ? 'Pause' : 'Play'}: ${t.title}`}>{mixesMode ? null : <small>{t.position?.trim() || '—'}</small>}<span>{t.title}</span></button>{trackActions(t.id)}<time>{normalizeDurationLabel(t.durationRaw,t.durationSec,'—')}</time></li>)}</ol>
      {!release.tracks.length && <p>{release.tracksLoaded === false ? (detailErrors[release.id] ? <button onClick={() => setDetailErrors(current => ({...current,[release.id]:false}))}>{ru ? 'Повторить загрузку' : 'Retry loading'}</button> : (ru ? 'Загрузка треков…' : 'Loading tracks…')) : (ru ? 'Треклист недоступен' : 'Tracklist unavailable')}</p>}
      <p className="paper-release-styles" style={{ animationDelay: `${.55 + Math.min(release.tracks.length, 12) * .065}s` }} aria-label="Release styles">{release.styles.length ? release.styles.map((style, index) => [index > 0 ? ' · ' : null, <em key={style} className={`paper-release-style${activeStyles.includes(style) ? ' is-active' : ''}`}>{style}</em>]) : (ru ? 'Стиль не указан' : 'Style unavailable')}</p>
      </>}
    </aside>}
    <nav className="paper-sections" aria-label="Collection sections">
      <button type="button" className="paper-section-collection" aria-current={(pendingSection ? pendingSection==='collection' : !showPlaylists && !activePlaylist && !favoritesMode && !mixesMode) ? 'page' : undefined} onClick={() => {if (mixesMode || favoritesMode) navigateSection('/','collection');else {setPendingSection(null);selectPlaylist(null);}}}><Library size={17} /><span>{ru ? 'Коллекция' : 'Collection'} <sup>{collectionCount ?? counts.releases}</sup></span></button>
      <button aria-expanded={showPlaylists} aria-current={(pendingSection ? pendingSection==='playlists' : showPlaylists || Boolean(activePlaylist)) ? 'page' : undefined} aria-controls="paper-playlists-panel" onClick={() => {if (mixesMode || favoritesMode) {navigateSection('/?view=playlists','playlists');return;}setPendingSection(null);if (showPlaylists) {setShowPlaylists(false);return;}setShowPlaylists(true);const first=playlists[0];if(first)selectPlaylist(first.id);}}><ListMusic size={17} /><span>{ru ? 'Плейлисты' : 'Playlists'} <sup>{counts.playlists}</sup></span></button>
      <button type="button" aria-current={(pendingSection ? pendingSection==='mixes' : mixesMode && !originalsMode && !showPlaylists && !activePlaylist) ? 'page' : undefined} className="paper-section-mixes" onClick={()=>{if(!mixesMode || originalsMode)navigateSection('/mixes','mixes');else {setPendingSection(null);setShowPlaylists(false);}}}><Disc3 size={17} /><span>{ru ? 'Миксы' : 'Mixes'} <sup>{mixCount ?? counts.mixes}</sup></span></button>
      <button type="button" aria-current={(pendingSection ? pendingSection==='originals' : originalsMode && !showPlaylists && !activePlaylist) ? 'page' : undefined} className="paper-section-originals" onClick={()=>{if(!originalsMode)navigateSection('/tracks','originals');else {setPendingSection(null);setShowPlaylists(false);}}}><AudioLines size={17} /><span>{ru ? 'Треки' : 'Tracks'} <sup>{originalCount ?? counts.originals}</sup></span></button>
      <button type="button" aria-current={(pendingSection ? pendingSection==='favorites' : favoritesMode && !showPlaylists && !activePlaylist) ? 'page' : undefined} className="paper-section-favorites" onClick={()=>{if(!favoritesMode)navigateSection('/favorites','favorites');else {setPendingSection(null);setShowPlaylists(false);}}}><Heart size={17} /><span>{ru ? 'Избранное' : 'Favorites'} <sup>{counts.favorites}</sup></span></button>
    </nav>
    <nav id="paper-playlists-panel" className="paper-playlists" aria-label="Playlists" data-open={showPlaylists} aria-hidden={!showPlaylists} inert={!showPlaylists}>
      {playlistsLoading && <span>{ru ? 'Загрузка плейлистов…' : 'Loading playlists…'}</span>}
      {playlists.map(p => <button key={p.id} aria-pressed={activePlaylist === p.id} onClick={() => selectPlaylist(p.id)}>{p.name} <sup>{p.items.length}</sup></button>)}
      {!playlistsLoading && !playlists.length && <Link href={user ? '/playlists?manage=1' : '/profile'}>{user ? (ru ? 'Создать плейлист ↗' : 'Create playlist ↗') : (ru ? 'Войти для плейлистов ↗' : 'Sign in for playlists ↗')}</Link>}
    </nav>
    {mixesMode && !showPlaylists && !activePlaylist ? <nav className="paper-mix-index" aria-label={originalsMode ? (ru ? 'Список треков' : 'Track list') : (ru ? 'Список миксов' : 'Mix list')}>
      {releases.map((mix,index) => <button key={mix.id} aria-pressed={hovered===index} onClick={() => {
        setHovered(index);
        const row = stage.current?.querySelector<HTMLElement>('.paper-row');
        if (row) row.scrollTo({top:Math.max(0,(listLayout.positions[index] || 0)-gridBounds.top),behavior:'smooth'});
      }}>{mix.title}</button>)}
    </nav> : null}
    {activePlaylist && orderStatus && <p className="paper-order-status" role="status">{orderStatus}</p>}
    <nav className="paper-styles" aria-label="Release styles" inert={showPlaylists || expanded || isTrackCollection || playlistTransition || mixesMode} aria-hidden={showPlaylists || expanded || isTrackCollection || playlistTransition || mixesMode}>
      <button aria-pressed={activeStyles.length === 0} onClick={() => filterByStyle(null)}>{ru ? 'Все' : 'All'} <sup>{activeStyles.length === 0 ? <CollectionPosition count={releases.length} read={readCollectionPosition} /> : allReleases.length}</sup></button>
      <section className="paper-styles-pinned" aria-label={ru ? 'Выбранные жанры' : 'Selected genres'}>
        {pinnedStyles.filter(style => activeStyles.includes(style)).map(style => <button key={style} aria-pressed="true" onClick={() => filterByStyle(style)}>{style} <sup><CollectionPosition count={releases.filter(release => release.styles.includes(style)).length} read={() => {
          const position = readCollectionPosition();
          const index = releases.slice(0, position.index + 1).filter(release => release.styles.includes(style)).length - 1;
          return { ...position, index };
        }} /></sup></button>)}
      </section>
      <div ref={styleScroller} onScroll={updatePinnedStyles}>{styleCounts.map(([style, count]) => {
        const selectedStyle = activeStyles.includes(style);
        const pinned = selectedStyle && (pinnedStyles.includes(style) || bottomPinnedStyles.includes(style));
        const limitReached = activeStyles.length >= MAX_SELECTED_STYLES && !selectedStyle;
        const matchingCount = selectedStyle ? releases.filter(release => release.styles.includes(style)).length : count;
        return <button key={style} data-style={style} className={pinned ? 'is-pinned-placeholder' : undefined} aria-hidden={pinned || undefined} tabIndex={pinned ? -1 : undefined} aria-pressed={selectedStyle} disabled={limitReached} title={limitReached ? (ru ? 'Можно выбрать не больше 5 жанров' : 'Choose up to 5 genres') : undefined} onClick={() => filterByStyle(style)}>{style} <sup>{selectedStyle ? <CollectionPosition count={matchingCount} read={() => {
          const position = readCollectionPosition();
          const index = releases.slice(0, position.index + 1).filter(release => release.styles.includes(style)).length - 1;
          return { ...position, index };
        }} /> : count}</sup></button>;
      })}</div>
      <section className="paper-styles-pinned paper-styles-pinned--bottom" aria-label={ru ? 'Выбранные жанры внизу' : 'Selected genres below'}>
        {bottomPinnedStyles.filter(style => activeStyles.includes(style)).map(style => <button key={style} aria-pressed="true" onClick={() => filterByStyle(style)}>{style} <sup><CollectionPosition count={releases.filter(release => release.styles.includes(style)).length} read={() => {
          const position = readCollectionPosition();
          const index = releases.slice(0, position.index + 1).filter(release => release.styles.includes(style)).length - 1;
          return { ...position, index };
        }} /></sup></button>)}
      </section>
    </nav>
    {!releases.length && <p className="paper-empty" role="status">{activePlaylist ? (ru ? 'Треков пока нет. Вернитесь в коллекцию или добавьте треки в управлении плейлистом.' : 'No tracks yet. Return to the collection or add tracks from playlist management.') : allReleases.length ? (ru ? 'Ничего не найдено. Измените поиск или выберите «Все».' : 'Nothing found. Change the search or choose All.') : originalsMode ? (ru ? 'Загрузи свою первую композицию в Tracks.' : 'Upload your first composition to Tracks.') : mixesMode ? (ru ? 'Миксов пока нет.' : 'No mixes yet.') : (ru ? 'Релизов пока нет.' : 'No releases yet.')}</p>}
  </section>;
}
