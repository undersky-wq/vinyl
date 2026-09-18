'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HomeRelease } from '../types';
import { SiteLang } from '../lib/language';
import { usePlayerActions, usePlayerTransport } from '../providers/player-provider';
import './record-archive.css';
import { normalizeDurationLabel } from '../lib/time';
import { useAuth } from '../providers/auth-provider';
import { usePlaylists } from '../providers/playlists-provider';
import { FavoriteButton, TrackPlaylistMenu } from './track-actions';
import { Heart, Library, ListMusic, Disc3 } from 'lucide-react';
import { useCollectionCounts } from './use-collection-counts';
import { ShelfThemeToggle } from './shelf-theme-toggle';
import { LanguageSwitcher } from './language-switcher';
import { ShelfMixTrack } from './shelf-mix-track';
import { getHomeReleaseDetails, getHomeReleases } from '../lib/api';
import { ShelfReleaseEditor } from './shelf-release-editor';
import { shelfMobileLayout } from '../lib/shelf-mobile-layout';
const coverPreview = (r: HomeRelease) => r.coverThumbStorageUrl || r.coverMediumStorageUrl || r.coverStorageUrl || r.coverImageUrl || '/icon.png';
const coverFull = (r: HomeRelease) => r.coverStorageUrl || r.coverImageUrl || r.coverMediumStorageUrl || r.coverThumbStorageUrl || '/icon.png';
const cover = coverPreview;
const MAX_SELECTED_STYLES = 5;

function ShelfCoverImage({ release, eager, priority, selected }: { release: HomeRelease; eager: boolean; priority: boolean; selected: boolean }) {
  const preview = coverPreview(release);
  const full = coverFull(release);
  return <>
    <img src={preview} alt="" width={320} height={320} loading={eager ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} decoding="async" draggable={false} />
    {selected && full !== preview ? <img className="paper-record-hires" src={full} alt="" loading="eager" fetchPriority="high" decoding="async" draggable={false} /> : null}
  </>;
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

export function RecordShelfStage({ releases: allReleases, lang, favoritesMode = false, mixesMode = false, collectionCount, mixCount, initialSearch = '' }: { releases: HomeRelease[]; lang: SiteLang; favoritesMode?: boolean; mixesMode?: boolean; collectionCount?: number; mixCount?: number; initialSearch?: string }) {
  const router = useRouter();
  const [uiLang,setUiLang] = useState<SiteLang>(lang);
  useEffect(() => setUiLang(lang),[lang]);
  useEffect(() => {
    const update = (event: Event) => setUiLang((event as CustomEvent<SiteLang>).detail);
    window.addEventListener('vinyl:language-change',update);
    return () => window.removeEventListener('vinyl:language-change',update);
  },[]);
  const ru = uiLang === 'ru';
  useEffect(() => {
    router.prefetch('/');
    router.prefetch('/?view=playlists');
    router.prefetch('/mixes');
    router.prefetch('/favorites');
  },[router]);
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
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [pendingSection, setPendingSection] = useState<'collection'|'playlists'|'mixes'|'favorites'|null>(null);
  const [playlistTransition, setPlaylistTransition] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => setAvatarFailed(false), [user?.avatarStorageUrl]);
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
  }
  useEffect(() => () => {
    cancelAnimationFrame(layoutFrame.current);
    if (shelfTransitionTimer.current) clearTimeout(shelfTransitionTimer.current);
  }, []);
  const [viewport, setViewport] = useState({ width: 1280, height: 720 });
  const [gridPan, setGridPan] = useState(0);
  const [gridBounds, setGridBounds] = useState({ top: 88, bottom: 84 });
  const [mobileGeometry, setMobileGeometry] = useState({ coverSize:180, shelfFloor:446 });
  const middleDrag = useRef<{ y: number; stretch: number; anchor: number } | null>(null);
  const touchDrag = useRef<{ x: number; travel: number; selected: number | null; step: number; lastOffset: number; lastTime: number; velocity: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Snap the endpoint: (1 - .55) / .45 can be 0.9999999999999999.
  // Without this, the grid's scrolling and opening styles never activate.
  const gridMix = stretch >= .999 ? 1 : Math.max(0, (stretch - .55) / .45);
  const listMix = Math.max(0, Math.min(1, stretch - 1));
  // A tiny overshoot past the grid is still a cover view, not a playable row.
  const isTrackListInteractive = listMix > .85;
  const [listPan, setListPan] = useState(0);
  // Quantized scroll snapshots only update the mounted window, not every frame.
  const [windowTravel, setWindowTravel] = useState(0);
  const [windowScroll, setWindowScroll] = useState(0);
  const columns = viewport.width <= 700 ? 4 : 5;
  const gridGap = viewport.width <= 700 ? 6 : 20;
  const sleeveSize = viewport.width <= 700 ? mobileGeometry.coverSize : Math.max(180, Math.min(280, viewport.width * .18));
  // Never enlarge a sleeve to fill the grid; leave symmetrical side margins.
  const gridWidth = viewport.width * (viewport.width <= 700 ? .94 : .8);
  const gridSize = viewport.width <= 700
    ? Math.min(
        sleeveSize,
        Math.max(24, (gridWidth - gridGap * (columns - 1)) / columns),
        Math.max(52, (viewport.height - gridBounds.top - gridBounds.bottom - gridGap * 6 - 18) / 7),
      )
    : Math.min(sleeveSize, Math.max(24, (gridWidth - gridGap * (columns - 1)) / columns));
  const cell = gridSize + gridGap;
  const gridLeft = (viewport.width - (columns * gridSize + (columns - 1) * gridGap)) / 2;
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
    })) : (appliedSearch ? searchCatalog || allReleases : mixesMode || favoritesMode ? allReleases : allReleases.filter(r=>!r.isMix)).map(r => releaseDetails[r.id] ? { ...r, ...releaseDetails[r.id] } : r);
    return source.filter(r => (!activeStyles.length || r.styles.some(style => activeStyles.includes(style))) && words.every(word => `${r.artist} ${r.title} ${r.trackSearchText || r.tracks.map(t => t.title).join(' ')}`.toLocaleLowerCase().includes(word)));
  }, [allReleases, searchCatalog, releaseDetails, activeStyles, appliedSearch, activePlaylist, playlists, mixesMode, favoritesMode]);
  const listLayout = useMemo(() => {
    // Full-width playlist rows begin below the persistent playlist selector.
    let y = gridBounds.top + 16;
    const mobile = viewport.width <= 700;
    if (mixesMode && mobile) {
      const cardSize = viewport.width * .455;
      const rowHeight = cardSize + 48;
      const positions = releases.map((_,index) => gridBounds.top + 16 + Math.floor(index / 2) * rowHeight);
      return { positions, height: gridBounds.top + 16 + Math.ceil(releases.length / 2) * rowHeight + gridBounds.bottom };
    }
    const positions = releases.map(r => {
      const top = y;
      const commentCount = openMixComments.get(r.id);
      const commentsSpace = commentCount === undefined ? 0 : Math.min(250, 74 + commentCount * 46);
      const count = r.trackCount ?? r.tracks.length;
      y += (isTrackCollection ? 52 : mobile ? Math.max(listSize, 92 + count * 28) + 24 : Math.max(listSize, 114 + count * 36) + 56) + commentsSpace;
      return top;
    });
    return { positions, height: y + gridBounds.bottom };
  }, [releases, listSize, gridBounds, isTrackCollection, playlists.length, viewport, mixesMode, openMixComments]);
  const styleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    allReleases.forEach(r => new Set(r.styles.filter(Boolean)).forEach(style => counts.set(style, (counts.get(style) || 0) + 1)));
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [allReleases]);
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
  const [selected, setSelected] = useState<number | null>(null);
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
    const offset = travel.current.current;
    travel.current = { current: offset, target: offset };
    transportOrigin.current = offset;
    stage.current?.style.setProperty('--travel', `${offset}px`);
    if (transport.current) transport.current.style.transform = 'none';
    stage.current?.classList.remove('is-scrolling');
    setWindowTravel(Math.floor(offset / 128) * 128);
    hoverResumeAt.current = performance.now() + 180;
  }
  const { playQueue, togglePlayback } = usePlayerActions();
  const { currentTrack, isPlaying } = usePlayerTransport();
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => {
      const origin = element.getBoundingClientRect().top;
      const search = element.querySelector('.paper-search')?.getBoundingClientRect();
      const player = document.querySelector('.mini-player')?.getBoundingClientRect();
      const heading = element.querySelector('.paper-heading')?.getBoundingClientRect();
      if (viewport.width <= 700) {
        const nav = element.querySelector('.paper-sections') as HTMLElement | null;
        const title = element.querySelector('.paper-heading') as HTMLElement | null;
        const layout = shelfMobileLayout(viewport.width, viewport.height,
          (search?.bottom || 72) - origin, nav?.offsetHeight || 88,
          title?.offsetHeight || 36, player ? player.top - origin : viewport.height - 24,
          stretch >= .5);
        element.style.setProperty('--mobile-nav-top', `${layout.navigationTop}px`);
        element.style.setProperty('--mobile-heading-top', `${layout.headingTop}px`);
        element.style.setProperty('--mobile-content-top', `${layout.contentTop}px`);
        element.style.setProperty('--mobile-content-bottom', `${layout.bottom}px`);
        element.style.setProperty('--mobile-panel-height', `${layout.panelHeight}px`);
        element.style.setProperty('--mobile-shelf-floor', `${layout.shelfFloor}px`);
        element.style.setProperty('--cover', `${layout.coverSize}px`);
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
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    for (const node of [element.querySelector('.paper-search'), element.querySelector('.paper-sections'), element.querySelector('.paper-heading'), document.querySelector('.mini-player')]) if (node) observer.observe(node);
    window.visualViewport?.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(frame);observer.disconnect();window.visualViewport?.removeEventListener('resize',measure); };
  }, [viewport, currentTrack?.id, stretch]);
  useLayoutEffect(() => {
    const row = stage.current?.querySelector('.paper-row');
    if (row) row.scrollTop = gridMix >= 1 ? gridPan * (1-listMix) + listPan * listMix : 0;
  }, [gridMix, gridPan, listMix, listPan]);
  function selectPlaylist(id: string | null) {
    const returnToShelf = id === null && (activePlaylist !== null || stretch > .05);
    pendingShelfCenter.current = true;
    if (id === null) setShowPlaylists(false);
    stopAutoLayout();
    if (filterTimer.current) clearTimeout(filterTimer.current);
    cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = 0;
    setPlaylistTransition(Boolean(id));
    pendingReveal.current = null;
    setFiltering(true); setSelected(null); setExpanded(false); setHovered(null);
    filterTimer.current = setTimeout(() => {
      activeStylesRef.current = []; setActiveStyles([]); replaceStyleHash([]);
      setActivePlaylist(id); setSearch(''); setAppliedSearch('');
      setStretch(returnToShelf ? 2 : 0); setGridPan(0); setListPan(0);
      setWindowTravel(0); setWindowScroll(0);
      travel.current = {current:0,target:0}; transportOrigin.current = 0;
      stage.current?.style.setProperty('--travel','0px');
      if (transport.current) transport.current.style.transform = 'none';
      setFiltering(false);
      setPlaylistTransition(false);
      if (returnToShelf) {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          setStretch(0);
        } else {
          setAutoLayout(true);
          const start = performance.now() + 120;
          const fold = (now: number) => {
            const progress = Math.max(0, Math.min(1, (now - start) / 1500));
            const eased = 1 - Math.pow(1 - progress, 3);
            setStretch(2 * (1 - eased));
            if (progress < 1) layoutFrame.current = requestAnimationFrame(fold);
            else {layoutFrame.current = 0; setAutoLayout(false);}
          };
          layoutFrame.current = requestAnimationFrame(fold);
        }
      } else if (id || favoritesMode || mixesMode) {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          setStretch(2);
        } else {
          setAutoLayout(true);
          const start = performance.now() + 250;
          const unfold = (now: number) => {
            const progress = Math.max(0, Math.min(1, (now - start) / 2000));
            const eased = progress * progress * (3 - 2 * progress);
            setStretch(2 * eased);
            if (progress < 1) layoutFrame.current = requestAnimationFrame(unfold);
            else {layoutFrame.current = 0; setAutoLayout(false);}
          };
          layoutFrame.current = requestAnimationFrame(unfold);
        }
      }
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240);
  }
  function navigateSection(path: string, section: 'collection'|'mixes'|'favorites'|'playlists') {
    setPendingSection(section);
    setShowPlaylists(false);
    setHovered(null);
    setSelected(null);
    setExpanded(false);
    router.push(path);
  }
  function changeMobileLayout(target: 0 | 1 | 2) {
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
    alignShelf(stretch);
    setSelected(null); setExpanded(false); setHovered(null);
    const startValue = stretch;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {alignShelf(target);setStretch(target);return;}
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
  const release = selected === null ? null : releases[selected];
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
  const playingListRelease = isTrackListInteractive
    ? releases.find(r => r.tracks.some(t => t.id === currentTrack?.id))
    : undefined;
  const headingRelease = (hovered === null ? null : releases[hovered]) || release || playingListRelease || releases[0];
  const activePlaylistName = playlists.find(playlist=>playlist.id===activePlaylist)?.name || '';
  const mobileContextHeading = viewport.width<=700 && stretch>=.5;
  const mobileSectionKey = favoritesMode ? 'favorites' : mixesMode ? 'mixes' : activePlaylist || showPlaylists ? 'playlists' : 'collection';
  const mobileSectionName = favoritesMode ? (ru?'Избранное':'Favorites') : mixesMode ? (ru?'Миксы':'Mixes') : activePlaylist || showPlaylists ? (ru?'Плейлисты':'Playlists') : (ru?'Коллекция':'Collection');
  const mobileContextName = activePlaylistName || activeStyles.join(' + ') || (mixesMode ? (ru?'Все миксы':'All mixes') : favoritesMode ? '' : (ru?'Вся коллекция':'All collection'));
  const mobileSectionCount = mobileSectionKey === 'favorites' ? counts.favorites : mobileSectionKey === 'mixes' ? (mixCount ?? counts.mixes) : mobileSectionKey === 'playlists' ? counts.playlists : (collectionCount ?? counts.releases);
  const mobileContextCount = activeStyles.length ? releases.length : activePlaylist ? (playlists.find(playlist=>playlist.id===activePlaylist)?.items.length ?? 0) : mixesMode ? (mixCount ?? counts.mixes) : null;
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
      if (transport.current) transport.current.style.transform = `translate3d(${-offset}px, ${offset * element.clientHeight / Math.max(1, element.clientWidth)}px, 0)`;
      setWindowTravel(Math.floor(state.current / 128) * 128);
      if (Math.abs(state.target - state.current) > .1) scrollFrame.current = requestAnimationFrame(draw);
      else {scrollFrame.current = 0; hoverResumeAt.current = performance.now() + 160; element.classList.remove('is-scrolling');}
    };
    const wheel = (event: WheelEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.paper-row')) return;
      if (gridMix >= 1 || middleDrag.current) return;
      event.preventDefault();
      const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
      if (!delta) return;
      hoverResumeAt.current = performance.now() + 600;
      if (selected !== null) {
        // One deliberate step at a time; momentum must not skip releases
        // immediately after collapsing the enlarged cover.
        if (performance.now() < wheelLock.current) return;
        wheelLock.current = performance.now() + 450;
        setHovered(null);
        if (expanded) { setExpanded(false); return; }
        const next = Math.max(0, Math.min(releases.length - 1, selected + Math.sign(delta)));
        setSelected(next);
        trigger.current = element.querySelector<HTMLButtonElement>(`.paper-record[data-index="${next}"]`);
        return;
      }
      element.classList.add('is-scrolling');
      travel.current.target = clampTravel(travel.current.target + delta * .65);
      setHovered(null);
      if (!scrollFrame.current) scrollFrame.current = requestAnimationFrame(draw);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {observer.disconnect(); element.removeEventListener('wheel', wheel); cancelAnimationFrame(scrollFrame.current); scrollFrame.current = 0; element.classList.remove('is-scrolling');};
  }, [releases.length, sleeves, selected, expanded, gridMix]);
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
  useEffect(() => {
    const reveal = (event: Event) => {
      const detail = (event as CustomEvent<{ releaseId?: string; trackId: string }>).detail;
      if (!detail) return;
      stopAutoLayout();
      setStretch(0);
      stage.current?.querySelector('.paper-row')?.scrollTo(0, 0);
      const index = releases.findIndex(r => r.id === detail.releaseId || r.tracks.some(t => t.id === detail.trackId));
      if (index < 0) {
        const matching = allReleases.find(r => r.id === detail.releaseId || r.tracks.some(t => t.id === detail.trackId));
        if (!matching) return;
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
      setHovered(null);
      setSelected(index);
      setExpanded(true);
      trigger.current = stage.current?.querySelector<HTMLButtonElement>(`.paper-record[data-index="${index}"]`) || null;
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
    const queue = (isTrackCollection ? releases : [source]).flatMap(r => r.tracks.filter(t => t.audioUrl).map(t => ({ ...t, waveformData: t.waveformData || [], artist: r.artist, coverUrl: cover(r), coverFullUrl: r.coverStorageUrl || r.coverImageUrl || cover(r), releaseId: r.id, isPublic: Boolean(r.isMix) })));
    if (currentTrack?.id === id) {togglePlayback(); return;}
    const index = queue.findIndex(t => t.id === id); if (index >= 0) playQueue(queue, index);
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
  const visibleIndices = shelfTransitioning
    ? [...new Set([...shelfVisibleIndices.current, ...rawVisibleIndices])].sort((a,b) => a-b)
    : rawVisibleIndices;
  shelfVisibleIndices.current = visibleIndices;
  const isShelfLayout = gridMix < .01 && listMix < .01;
  const priorityCoverStart = Math.max(0, Math.floor((visibleIndices.length - 6) / 2));
  const detailIds = [...new Set([
    ...(expanded && release?.tracksLoaded === false ? [release.id] : []),
    ...(listMix > .85 ? visibleIndices.map(i => releases[i]).filter(r => r.tracksLoaded === false).map(r => r.id) : []),
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
  return <section ref={stage} style={{ '--grid-mix': gridMix, '--list-mix': listMix, '--list-size': `${listSize}px`, '--side-size': `${sideSize}px`, '--grid-size': `${gridSize}px`, '--grid-top': `${gridBounds.top}px`, '--grid-bottom': `${gridBounds.bottom}px` } as CSSProperties} className={`home-stage home-stage--shelf paper-archive${motionEnabled ? ' has-motion' : ''}${release ? ' is-open' : ''}${expanded ? ' is-expanded' : ''}${filtering ? ' is-filtering' : ''}${isDragging || autoLayout ? ' is-stretching' : ''}${gridMix >= 1 ? ' is-grid' : ''}${listMix > 0 ? ' is-listing' : ''}${isTrackCollection || playlistTransition || (mixesMode && listMix > 0) ? ' is-playlist' : ''}${mixesMode ? ' is-mixes' : ''}`} aria-label={mixesMode ? 'Mixes' : 'Vinyl collection'} onPointerMoveCapture={e => {
    if (e.pointerType === 'touch' || motionEnabled) return;
    e.currentTarget.classList.add('has-motion');
    setMotionEnabled(true);
  }} onFocusCapture={e => {
    if (motionEnabled) return;
    e.currentTarget.classList.add('has-motion');
    setMotionEnabled(true);
  }} onPointerDownCapture={() => setMotionEnabled(true)} onKeyDownCapture={() => setMotionEnabled(true)} onClick={e => {
    if (!(e.target instanceof Element) || e.target.closest('.paper-record, .paper-tracklist, a, button, input')) return;
    setExpanded(false);
    setSelected(null);
    setHovered(null);
  }}>
    <header className="paper-header">
      <div className="paper-identity">
        <Link href="/profile" className="paper-avatar" aria-label="Profile settings">
          {user?.avatarStorageUrl && !avatarFailed ? <img src={user.avatarStorageUrl} alt="" onError={() => setAvatarFailed(true)} /> : <span>{user?.displayName?.slice(0,1).toUpperCase() || '○'}</span>}
        </Link>
        <div className="paper-identity__content">
          <div className="paper-brand-row">
            <Link href="/" className="paper-brand" onClick={e => {if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) selectPlaylist(null);}}>{ru ? 'Коллекция винила' : 'Vinyl collection'}</Link>
            <ShelfThemeToggle compact iconOnly />
            <LanguageSwitcher lang={lang} single />
          </div>
          <div className="paper-search-row">
            <input className="paper-search" type="search" value={search} placeholder={ru ? 'Поиск' : 'Search'} aria-label={ru ? 'Поиск релизов и миксов' : 'Search releases and mixes'} onChange={e => {setSearch(e.target.value);filterByStyle(null, e.target.value);}} />
            {searchStatus && <span className="paper-search-status" role="status">{searchStatus}</span>}
            <nav className="paper-layout-controls" aria-label="Collection view">
              <button aria-pressed={stretch < .5} onClick={() => changeMobileLayout(0)}>{ru ? 'Полка' : 'Shelf'}</button>
              <button aria-pressed={stretch >= .5 && stretch < 1.5} onClick={() => changeMobileLayout(1)}>{ru ? 'Сетка' : 'Grid'}</button>
              <button aria-pressed={stretch >= 1.5} onClick={() => changeMobileLayout(2)}>{ru ? 'Треки' : 'Tracks'}</button>
            </nav>
          </div>
        </div>
      </div>
      <h1 className="paper-heading" aria-label={headingRelease ? `${headingRelease.artist} : ${headingRelease.title}` : 'Vinyl collection'}>
        <span className="paper-heading-window paper-heading-artist"><span key={mobileContextHeading?mobileSectionName:headingRelease?.artist} className={mobileContextHeading?`paper-heading-section paper-heading-section-${mobileSectionKey}`:undefined}>{mobileContextHeading ? <>{mobileSectionKey==='favorites'?<Heart size={14}/>:mobileSectionKey==='mixes'?<Disc3 size={14}/>:mobileSectionKey==='playlists'?<ListMusic size={14}/>:<Library size={14}/>}<b>{mobileSectionName}</b><sup>{mobileSectionCount}</sup></> : headingRelease?.artist || (ru ? 'Коллекция винила' : 'Vinyl collection')}</span></span>
        <span className="paper-heading-colon" aria-hidden={!mobileContextName && mobileContextHeading}>:</span>
        <span className="paper-heading-window paper-heading-title"><span key={mobileContextHeading?mobileContextName:headingRelease?.id} className={mobileContextHeading?'paper-heading-context':'paper-release-title-regular'} data-context-section={mobileContextHeading ? (activePlaylist ? 'playlists' : mixesMode ? 'mixes' : favoritesMode ? 'favorites' : 'collection') : undefined}>{mobileContextHeading ? <>{mobileContextName}{mobileContextCount!==null?<sup>{mobileContextCount}</sup>:null}</> : headingRelease?.title || ''}</span></span>
      </h1>
    </header>
    <div className="paper-row" aria-label={mixesMode ? 'All mixes' : 'All releases'} onScroll={e => {
      setWindowScroll(Math.floor(e.currentTarget.scrollTop / 128) * 128);
    }} onPointerDown={e => {
      if (e.pointerType === 'touch' && gridMix < 1) {
        stopAutoLayout();
        settleShelfMotion();
        touchDrag.current = { x: e.clientX, travel: travel.current.current, selected, step: 0, lastOffset:travel.current.current, lastTime:performance.now(), velocity:0 };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      if (e.button !== 1) return;
      e.preventDefault();
      stopAutoLayout();
      cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = 0;
      stage.current?.classList.remove('is-scrolling');
      let anchorIndex = 0;
      if (listMix > .5) {
        const middleY = e.currentTarget.scrollTop + (gridBounds.top + viewport.height - gridBounds.bottom) / 2;
        listLayout.positions.forEach((y, i) => {if (Math.abs(y + listSize/2 - middleY) < Math.abs((listLayout.positions[anchorIndex] || 0) + listSize/2 - middleY)) anchorIndex = i;});
        setListPan(e.currentTarget.scrollTop);
        setGridPan(Math.max(0, gridBounds.top + 12 + Math.floor(anchorIndex / columns)*cell + gridSize/2 - (gridBounds.top + viewport.height - gridBounds.bottom)/2));
      } else if (gridMix >= 1) {
        const middleY = e.currentTarget.scrollTop + (gridBounds.top + viewport.height - gridBounds.bottom) / 2;
        anchorIndex = Math.min(releases.length - 1, Math.max(0, Math.round((middleY - gridBounds.top - 12 - gridSize / 2) / cell) * columns + 2));
        setGridPan(e.currentTarget.scrollTop);
        setListPan(Math.max(0, (listLayout.positions[anchorIndex] || 0) + listSize/2 - (gridBounds.top + viewport.height - gridBounds.bottom)/2));
      } else {
        const center = travel.current.current + viewport.width / 2;
        sleeves.forEach((sleeve, index) => {if (Math.abs(sleeve.position - center) < Math.abs((sleeves[anchorIndex]?.position || 0) - center)) anchorIndex = index;});
        const targetY = gridBounds.top + 12 + Math.floor(anchorIndex / columns) * cell + gridSize / 2;
        setGridPan(Math.max(0, targetY - (gridBounds.top + viewport.height - gridBounds.bottom) / 2));
        setListPan(Math.max(0, (listLayout.positions[anchorIndex] || 0) + listSize/2 - (gridBounds.top + viewport.height - gridBounds.bottom)/2));
      }
      middleDrag.current = {
        y: e.clientY,
        stretch,
        anchor: (sleeves[anchorIndex]?.position || 0) / (1 + Math.min(stretch,1) * 2),
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsDragging(true);
      setExpanded(false);
      setSelected(null);
      setHovered(null);
      wheelLock.current = performance.now() + 450;
    }} onPointerMove={e => {
      if (touchDrag.current) {
        const delta = touchDrag.current.x - e.clientX;
        if (Math.abs(delta) < 4) return;
        suppressCoverClick.current = performance.now() + 300;
        if (touchDrag.current.selected !== null) {
          const step = Math.trunc(delta / Math.max(52, viewport.width * .16));
          if (step !== touchDrag.current.step) {
            touchDrag.current.step = step;
            const next = Math.max(0,Math.min(releases.length-1,touchDrag.current.selected + step));
            setSelected(next);
            setExpanded(false);
            setHovered(null);
          }
          return;
        }
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
        transportOrigin.current = offset;
        stage.current?.style.setProperty('--travel', `${offset}px`);
        if (transport.current) transport.current.style.transform = 'none';
        setWindowTravel(Math.floor(offset / 128) * 128);
        return;
      }
      if (!middleDrag.current) {
        // Only actual pointer movement changes hover, never a sleeve moving
        // underneath a stationary pointer during scrolling or its own lift.
        if (scrollFrame.current || performance.now() < hoverResumeAt.current || (gridMix > 0 && gridMix < 1) || e.pointerType === 'touch') return;
        const target = e.target instanceof Element ? e.target.closest<HTMLElement>('.paper-record, .paper-list-tracks') : null;
        const targetIndex = target ? Number(target.dataset.index) : null;
        // The first/only sleeve is already fully exposed and must stay still.
        setHovered(targetIndex !== null && releases.length > 1 && targetIndex > 0 ? targetIndex : null);
        return;
      }
      const next = Math.max(0, Math.min(2, middleDrag.current.stretch + (middleDrag.current.y - e.clientY) / Math.max(180, viewport.height * .45)));
      // Expand around the visible center, not around the start of the archive.
      // Rebase the transport so a previous wheel translation isn't applied twice.
      const offset = middleDrag.current.anchor * (1 + Math.min(next,1) * 2) - viewport.width / 2;
      travel.current = { current: offset, target: offset };
      transportOrigin.current = offset;
      stage.current?.style.setProperty('--travel', `${offset}px`);
      if (transport.current) transport.current.style.transform = 'none';
      setStretch(next);
    }} onPointerUp={e => {
      if (e.pointerType === 'touch') {
        const drag = touchDrag.current;
        touchDrag.current = null;
        if (drag && drag.selected === null && performance.now() - drag.lastTime < 80 && Math.abs(drag.velocity) > .05 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          let speed = Math.max(-2.5,Math.min(2.5,drag.velocity));
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
            transportOrigin.current = offset;
            stage.current?.style.setProperty('--travel',`${offset}px`);
            if (transport.current) transport.current.style.transform = 'none';
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
      middleDrag.current = null;
      setIsDragging(false);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    }} onLostPointerCapture={() => {middleDrag.current = null;touchDrag.current = null;setIsDragging(false);}} onPointerCancel={() => {middleDrag.current = null;touchDrag.current = null;setIsDragging(false);}} onAuxClick={e => {if(e.button === 1) e.preventDefault();}} onPointerLeave={() => setHovered(null)}><div className="paper-transport" ref={transport}>{visibleIndices.map((i, visibleRank) => {
      const r = releases[i];
      const p = sleeves[i].position / 24;
      const side = selected === null ? 0 : gridMix >= 1 ? (i % columns < Math.ceil(columns / 2) ? -1 : 1) : i < selected ? -1 : 1;
      const isPriorityCover = selected === i || (visibleRank >= priorityCoverStart && visibleRank < priorityCoverStart + 6);
      return <button type="button" key={`${r.id}-${isTrackCollection ? r.tracks[0]?.id : ''}`} data-index={i} className={`paper-record${selected === i ? ' is-selected' : ''}${selected !== null && gridMix === 0 && (i === selected + 1 || i === 0) ? ' is-front-sleeve' : ''}${hovered === i && selected !== i ? ' is-hovered' : ''}${r.tracks.some(track=>track.id===currentTrack?.id) ? ' is-playing' : ''}`}
        style={{ '--position': p, '--rise': `${sleeves[i].rise}px`, '--grid-x': `${gridLeft + (i % columns) * cell}px`, '--grid-y': `${gridBounds.top + 12 + Math.floor(i / columns) * cell - (gridMix < 1 ? gridPan : 0)}px`, '--list-y': `${listLayout.positions[i]}px`, '--mix-list-x': `${3 + (i % 2) * 48.5}vw`, '--mix-column': i % 2, '--grid-side-x': `${i % columns < Math.ceil(columns / 2) ? 12 + (i % columns) * sideStep : viewport.width - sideSize - 12 - (columns - 1 - i % columns) * sideStep}px`, '--split': side, zIndex: selected === i ? releases.length + 2 : releases.length - i } as CSSProperties}
        aria-label={`${r.artist} — ${r.title}`} aria-expanded={selected === i}
        onFocus={() => {if(!scrollFrame.current && releases.length > 1 && i > 0) setHovered(i);}} onBlur={() => setHovered(null)}
        onClick={e => {
          if (performance.now() < suppressCoverClick.current) return;
          trigger.current = e.currentTarget;
          stopAutoLayout();
          if (gridMix < .01 && listMix < .01) protectShelfTransition();
          settleShelfMotion();
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
        <ShelfCoverImage release={r} eager={isShelfLayout || isPriorityCover} priority={isPriorityCover} selected={selected === i} /><span className="paper-record-edge" aria-hidden="true" /><span className="paper-record-caption"><b>{r.title}</b>{r.year ? <small>{r.year}</small> : null}</span>
      </button>;
    })}
    {listMix > 0 && visibleIndices.map(i => {
      const r = releases[i];
      return <article data-index={i} onFocus={() => setHovered(i)} onBlur={e => {if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHovered(null);}} onClick={() => setHovered(i)}
        onDragOver={e => {const target=r.tracks[0];if(activePlaylist&&dragTrack&&target){e.preventDefault();e.dataTransfer.dropEffect='move';const rect=e.currentTarget.getBoundingClientRect();setDropTarget({trackId:target.id,side:e.clientY<rect.top+rect.height/2?'before':'after'});}}}
        onDrop={e => {const target=r.tracks[0];if(!activePlaylist||!dragTrack||!target)return;e.preventDefault();const rect=e.currentTarget.getBoundingClientRect();void movePlaylistTrack(dragTrack,target.id,e.clientY<rect.top+rect.height/2?'before':'after');setDragTrack(null);setDropTarget(null);suppressTrackClick.current=performance.now()+250;}}
        className={`paper-list-tracks${isTrackCollection ? ' is-compact-track' : ''}${r.tracks.some(track=>track.id===currentTrack?.id) ? ' is-playing' : ''}`} key={`tracks-${r.id}-${isTrackCollection ? r.tracks[0]?.id : ''}`} style={{ top: (gridBounds.top + 12 + Math.floor(i / columns)*cell)*(1-listMix) + listLayout.positions[i]*listMix, opacity:listMix, pointerEvents:isTrackListInteractive ? 'auto':'none' }}>
        {!isTrackCollection && <h2><span>{r.artist} : <span className="paper-release-title-regular">{r.title}</span></span>{r.year ? <time dateTime={String(r.year)}>{r.year}</time> : null}</h2>}
        {mixesMode ? <ShelfMixTrack release={r} lang={uiLang} yearInHeading actions={r.tracks[0] ? trackActions(r.tracks[0].id) : null} onCommentsOpenChange={(open,count)=>setOpenMixComments(current=>{const next=new Map(current);if(open)next.set(r.id,count);else next.delete(r.id);return next;})} /> : r.tracks.map(t => <div key={t.id} className={`paper-track-line${dragTrack === t.id ? ' is-dragging' : ''}${dropTarget?.trackId === t.id ? ` is-drop-${dropTarget.side}` : ''}${currentTrack?.id === t.id ? ' is-playing' : ''}`}
          draggable={Boolean(activePlaylist) && !savingOrder && isTrackListInteractive}
          onDragStart={e => {if ((e.target as Element).closest('.paper-track-actions')) {e.preventDefault();return;} e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',t.id);setDragTrack(t.id);suppressTrackClick.current=Infinity;}}
          onDragOver={e => {if (activePlaylist && dragTrack) {e.preventDefault();e.dataTransfer.dropEffect='move';const rect=e.currentTarget.getBoundingClientRect();setDropTarget({trackId:t.id,side:e.clientY<rect.top+rect.height/2?'before':'after'});}}}
          onDragEnd={() => {setDragTrack(null);setDropTarget(null);suppressTrackClick.current=performance.now()+250;}}>
          {activePlaylist && <button className="paper-track-grip" disabled={savingOrder} aria-label="Move track. Alt and up or down arrow" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.altKey && (e.key==='ArrowUp'||e.key==='ArrowDown')) {e.preventDefault();const movingDown=e.key==='ArrowDown';const other=releases[i+(movingDown?1:-1)]?.tracks[0];if(other)void movePlaylistTrack(t.id,other.id,movingDown?'after':'before');}}}>⠿</button>}
          <button className="paper-track-play" disabled={!t.audioUrl} onClick={() => play(t.id,r)}>{mixesMode ? null : <small>{isTrackCollection ? i + 1 : t.position || '—'}</small>}<span className={isTrackCollection?'paper-track-primary':undefined}>{isTrackCollection ? <><b>{r.artist}</b><em>{t.title}</em></> : t.title}</span>{isTrackCollection && <span className="paper-track-release">{r.title}</span>}</button>
          {!mixesMode && <span className="paper-track-bpm" title="BPM">{t.bpm ?? '—'}</span>}
          {(activePlaylist || (!mixesMode && !favoritesMode)) && <span className="paper-track-key" title="Key">{t.key || '—'}</span>}
          {trackActions(t.id)}<time>{normalizeDurationLabel(t.durationRaw,t.durationSec,'—')}</time>
        </div>)}
        {!r.tracks.length && <p>{r.tracksLoaded === false ? (detailErrors[r.id] ? <button onClick={() => setDetailErrors(current => ({...current,[r.id]:false}))}>{ru ? 'Повторить загрузку' : 'Retry loading'}</button> : (ru ? 'Загрузка треков…' : 'Loading tracks…')) : (ru ? 'Треклист недоступен' : 'Tracklist unavailable')}</p>}
        {r.isMix && <ShelfReleaseEditor id={r.id} lang={uiLang} className="shelf-mix-edit-corner"/>}
        {!isTrackCollection && !mixesMode && <p className="paper-release-styles" aria-label={ru ? 'Стили релиза' : 'Release styles'}>{r.styles.join(' · ') || (ru ? 'Стиль не указан' : 'Style unavailable')}</p>}
      </article>;
    })}
    </div>{gridMix >= 1 && <div aria-hidden="true" style={{ height: (gridBounds.top + 12 + Math.ceil(releases.length / columns) * cell + Math.max(gridBounds.bottom, viewport.height / 2))*(1-listMix) + listLayout.height*listMix, pointerEvents: 'none' }} />}</div>
    {release && expanded && <aside className="paper-tracklist" aria-label={`Tracks: ${release.title}`} key={release.id}>
      {(release.isMix || (gridMix === 0 && listMix === 0)) && <ShelfReleaseEditor id={release.id} lang={uiLang} className={release.isMix ? 'shelf-mix-edit-corner' : undefined}/>}
      {release.isMix ? <><p>{release.artist} <span>{release.year}</span></p><h2>{release.title}</h2></> : <><h2>{release.artist}</h2><p>{release.title} <span>{release.year}</span></p></>}
      <ol>{release.tracks.map((t, i) => <li key={t.id} className={`paper-track-line${currentTrack?.id === t.id ? ' is-playing' : ''}`} style={{ '--line-delay': `${.48 + Math.min(i, 12) * .065}s` } as CSSProperties}><button className="paper-track-play" disabled={!t.audioUrl} onClick={() => play(t.id)} aria-label={`${currentTrack?.id === t.id && isPlaying ? 'Pause' : 'Play'}: ${t.title}`}>{mixesMode ? null : <small>{t.position?.trim() || '—'}</small>}<span>{t.title}</span></button>{trackActions(t.id)}<time>{normalizeDurationLabel(t.durationRaw,t.durationSec,'—')}</time></li>)}</ol>
      {!release.tracks.length && <p>{release.tracksLoaded === false ? (detailErrors[release.id] ? <button onClick={() => setDetailErrors(current => ({...current,[release.id]:false}))}>{ru ? 'Повторить загрузку' : 'Retry loading'}</button> : (ru ? 'Загрузка треков…' : 'Loading tracks…')) : (ru ? 'Треклист недоступен' : 'Tracklist unavailable')}</p>}
      <p className="paper-release-styles" style={{ animationDelay: `${.55 + Math.min(release.tracks.length, 12) * .065}s` }} aria-label="Release styles">{release.styles.join(' · ') || (ru ? 'Стиль не указан' : 'Style unavailable')}</p>
    </aside>}
    <nav className="paper-sections" aria-label="Collection sections">
      <button type="button" className="paper-section-collection" aria-current={(pendingSection ? pendingSection==='collection' : !showPlaylists && !activePlaylist && !favoritesMode && !mixesMode) ? 'page' : undefined} onClick={() => {if (mixesMode || favoritesMode) navigateSection('/','collection');else {setPendingSection(null);selectPlaylist(null);}}}><Library size={17} /><span>{ru ? 'Коллекция' : 'Collection'} <sup>{collectionCount ?? counts.releases}</sup></span></button>
      <button aria-expanded={showPlaylists} aria-current={(pendingSection ? pendingSection==='playlists' : showPlaylists || Boolean(activePlaylist)) ? 'page' : undefined} aria-controls="paper-playlists-panel" onClick={() => {if (mixesMode || favoritesMode) {navigateSection('/?view=playlists','playlists');return;}setPendingSection(null);if (showPlaylists) {setShowPlaylists(false);return;}setShowPlaylists(true);const first=playlists[0];if(first)selectPlaylist(first.id);}}><ListMusic size={17} /><span>{ru ? 'Плейлисты' : 'Playlists'} <sup>{counts.playlists}</sup></span></button>
      <Link href="/mixes" aria-current={(pendingSection ? pendingSection==='mixes' : mixesMode && !showPlaylists && !activePlaylist) ? 'page' : undefined} className="paper-section-mixes" onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();if(!mixesMode)navigateSection('/mixes','mixes');else {setPendingSection(null);setShowPlaylists(false);}}}><Disc3 size={17} /><span>{ru ? 'Миксы' : 'Mixes'} <sup>{mixCount ?? counts.mixes}</sup></span></Link>
      <Link href="/favorites" aria-current={(pendingSection ? pendingSection==='favorites' : favoritesMode && !showPlaylists && !activePlaylist) ? 'page' : undefined} className="paper-section-favorites" onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();if(!favoritesMode)navigateSection('/favorites','favorites');else {setPendingSection(null);setShowPlaylists(false);}}}><Heart size={17} /><span>{ru ? 'Избранное' : 'Favorites'} <sup>{counts.favorites}</sup></span></Link>
    </nav>
    <nav id="paper-playlists-panel" className="paper-playlists" aria-label="Playlists" data-open={showPlaylists} aria-hidden={!showPlaylists} inert={!showPlaylists}>
      {playlistsLoading && <span>{ru ? 'Загрузка плейлистов…' : 'Loading playlists…'}</span>}
      {playlists.map(p => <button key={p.id} aria-pressed={activePlaylist === p.id} onClick={() => selectPlaylist(p.id)}>{p.name} <sup>{p.items.length}</sup></button>)}
      {!playlistsLoading && !playlists.length && <Link href={user ? '/playlists?manage=1' : '/profile'}>{user ? (ru ? 'Создать плейлист ↗' : 'Create playlist ↗') : (ru ? 'Войти для плейлистов ↗' : 'Sign in for playlists ↗')}</Link>}
    </nav>
    {mixesMode && !showPlaylists && !activePlaylist ? <nav className="paper-mix-index" aria-label={ru ? 'Список миксов' : 'Mix list'}>
      {releases.map((mix,index) => <button key={mix.id} aria-pressed={hovered===index} onClick={() => {
        setHovered(index);
        const row = stage.current?.querySelector<HTMLElement>('.paper-row');
        if (row) row.scrollTo({top:Math.max(0,(listLayout.positions[index] || 0)-gridBounds.top),behavior:'smooth'});
      }}>{mix.title}</button>)}
    </nav> : null}
    {activePlaylist && orderStatus && <p className="paper-order-status" role="status">{orderStatus}</p>}
    <nav className="paper-styles" aria-label="Release styles" inert={showPlaylists || expanded || isTrackCollection || playlistTransition || mixesMode} aria-hidden={showPlaylists || expanded || isTrackCollection || playlistTransition || mixesMode}>
      <button aria-pressed={activeStyles.length === 0} onClick={() => filterByStyle(null)}>{ru ? 'Все' : 'All'} <sup>{allReleases.length}</sup></button>
      <div>{styleCounts.map(([style, count]) => {
        const selectedStyle = activeStyles.includes(style);
        const limitReached = activeStyles.length >= MAX_SELECTED_STYLES && !selectedStyle;
        return <button key={style} aria-pressed={selectedStyle} disabled={limitReached} title={limitReached ? (ru ? 'Можно выбрать не больше 5 жанров' : 'Choose up to 5 genres') : undefined} onClick={() => filterByStyle(style)}>{style} <sup>{count}</sup></button>;
      })}</div>
    </nav>
    {!releases.length && <p className="paper-empty" role="status">{activePlaylist ? (ru ? 'Треков пока нет. Вернитесь в коллекцию или добавьте треки в управлении плейлистом.' : 'No tracks yet. Return to the collection or add tracks from playlist management.') : allReleases.length ? (ru ? 'Ничего не найдено. Измените поиск или выберите «Все».' : 'Nothing found. Change the search or choose All.') : mixesMode ? (ru ? 'Миксов пока нет.' : 'No mixes yet.') : (ru ? 'Релизов пока нет.' : 'No releases yet.')}</p>}
  </section>;
}
