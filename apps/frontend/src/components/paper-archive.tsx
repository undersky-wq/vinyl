'use client';
import Link from 'next/link';
import { CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HomeRelease } from '../types';
import { SiteLang } from '../lib/language';
import { usePlayerActions, usePlayerTransport } from '../providers/player-provider';
import './record-archive.css';
import { normalizeDurationLabel } from '../lib/time';
import { useAuth } from '../providers/auth-provider';
import { usePlaylists } from '../providers/playlists-provider';
import { FavoriteButton, TrackPlaylistMenu } from './track-actions';
import { Heart, ListMusic, Disc3 } from 'lucide-react';
import { useCollectionCounts } from './use-collection-counts';
const cover = (r: HomeRelease) => r.coverMediumStorageUrl || r.coverThumbStorageUrl || r.coverStorageUrl || r.coverImageUrl || '/icon.png';
// Seeded by release ID: identical on the server, after hydration and on re-render.
function sleeveVariation(id: string) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const seed = hash >>> 0;
  return { gap: 17 + (seed % 15), rise: -((seed >>> 8) % 29) };
}

export function RecordShelfStage({ releases: allReleases, lang, favoritesMode = false }: { releases: HomeRelease[]; lang: SiteLang; favoritesMode?: boolean }) {
  const { user } = useAuth();
  const counts = useCollectionCounts();
  const { playlists, isLoading: playlistsLoading, reorderTracks } = usePlaylists();
  const [orderStatus, setOrderStatus] = useState('');
  const [savingOrder, setSavingOrder] = useState(false);
  const [dragTrack, setDragTrack] = useState<string | null>(null);
  const [dropTrack, setDropTrack] = useState<string | null>(null);
  const suppressTrackClick = useRef(0);
  const [activePlaylist, setActivePlaylist] = useState<string | null>(null);
  const isTrackCollection = Boolean(activePlaylist) || favoritesMode;
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [playlistTransition, setPlaylistTransition] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => setAvatarFailed(false), [user?.avatarStorageUrl]);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [stretch, setStretch] = useState(0);
  const layoutFrame = useRef(0);
  const [autoLayout, setAutoLayout] = useState(false);
  function stopAutoLayout() {
    cancelAnimationFrame(layoutFrame.current);
    layoutFrame.current = 0;
    setAutoLayout(false);
  }
  useEffect(() => () => cancelAnimationFrame(layoutFrame.current), []);
  const [viewport, setViewport] = useState({ width: 1280, height: 720 });
  const [gridPan, setGridPan] = useState(0);
  const [gridBounds, setGridBounds] = useState({ top: 88, bottom: 84 });
  const middleDrag = useRef<{ y: number; stretch: number; anchor: number } | null>(null);
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
  const columns = 5;
  const gridGap = viewport.width <= 700 ? 8 : 20;
  const sleeveSize = viewport.width <= 700 ? 180 : Math.max(180, Math.min(280, viewport.width * .18));
  // Never enlarge a sleeve to fill the grid; leave symmetrical side margins.
  const gridSize = Math.min(sleeveSize, Math.max(24, (viewport.width * .8 - gridGap * (columns - 1)) / columns));
  const cell = gridSize + gridGap;
  const gridLeft = (viewport.width - (columns * gridSize + (columns - 1) * gridGap)) / 2;
  const listSize = isTrackCollection ? 40 : Math.min(sleeveSize, viewport.width * .24);
  const sideSize = gridSize;
  // Reveal almost half of each sleeve, while reserving the expanded cover
  // and its tracklist in the middle. Three sleeves share the wider left fan.
  const expandedSize = Math.min(viewport.width * (viewport.width <= 700 ? .74 : .4), viewport.height * (viewport.width <= 700 ? .38 : .46));
  const sideStep = Math.max(0, Math.min(gridSize * .48, ((viewport.width - expandedSize) / 2 - sideSize - 40) / 2));
  const [activeStyle, setActiveStyle] = useState<string | null>(null);
  const [filtering, setFiltering] = useState(false);
  const filterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingReveal = useRef<string | null>(null);
  const releases = useMemo(() => {
    const words = appliedSearch.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const playlist = playlists.find(p => p.id === activePlaylist);
    // Keep each playlist item separate, including non-adjacent tracks of one release.
    const source: HomeRelease[] = playlist ? [...playlist.items].sort((a,b) => a.sortOrder-b.sortOrder).map(item => ({
      ...item.track.release,
      tracks: [{...item.track, audioUrl: item.track.audioFiles?.find(f => f.storageUrl)?.storageUrl || ''}],
    })) : allReleases;
    return source.filter(r => (activeStyle === null || r.styles.includes(activeStyle)) && words.every(word => `${r.artist} ${r.title} ${r.tracks.map(t => t.title).join(' ')}`.toLocaleLowerCase().includes(word)));
  }, [allReleases, activeStyle, appliedSearch, activePlaylist, playlists]);
  const listLayout = useMemo(() => {
    // Full-width playlist rows begin below the persistent playlist selector.
    let y = gridBounds.top + 16;
    const positions = releases.map(r => { const top = y; y += isTrackCollection ? 52 : Math.max(listSize, 114 + r.tracks.length * 36) + 56; return top; });
    return { positions, height: y + gridBounds.bottom };
  }, [releases, listSize, gridBounds, isTrackCollection, playlists.length, viewport]);
  const styleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    allReleases.forEach(r => new Set(r.styles.filter(Boolean)).forEach(style => counts.set(style, (counts.get(style) || 0) + 1)));
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [allReleases]);
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
    const observer = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  const travel = useRef({ current: 0, target: 0 });
  const scrollFrame = useRef(0);
  const wheelLock = useRef(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const { playQueue, togglePlayback } = usePlayerActions();
  const { currentTrack, isPlaying } = usePlayerTransport();
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => {
      const search = element.querySelector('.paper-search')?.getBoundingClientRect();
      const player = document.querySelector('.mini-player')?.getBoundingClientRect();
      setGridBounds({ top: Math.ceil(search?.bottom || 88) + 8, bottom: player ? Math.ceil(viewport.height - player.top) + 8 : 84 });
    };
    measure();
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [viewport, currentTrack?.id]);
  useLayoutEffect(() => {
    const row = stage.current?.querySelector('.paper-row');
    if (row) row.scrollTop = gridMix >= 1 ? gridPan * (1-listMix) + listPan * listMix : 0;
  }, [gridMix, gridPan, listMix, listPan]);
  function selectPlaylist(id: string | null) {
    if (id === null) setShowPlaylists(false);
    stopAutoLayout();
    if (filterTimer.current) clearTimeout(filterTimer.current);
    cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = 0;
    setPlaylistTransition(Boolean(id));
    pendingReveal.current = null;
    setFiltering(true); setSelected(null); setExpanded(false); setHovered(null);
    filterTimer.current = setTimeout(() => {
      setActivePlaylist(id); setActiveStyle(null); setSearch(''); setAppliedSearch('');
      setStretch(0); setGridPan(0); setListPan(0);
      setWindowTravel(0); setWindowScroll(0);
      travel.current = {current:0,target:0}; transportOrigin.current = 0;
      stage.current?.style.setProperty('--travel','0px');
      if (transport.current) transport.current.style.transform = 'none';
      setFiltering(false);
      setPlaylistTransition(false);
      if (id || favoritesMode) {
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
  const release = selected === null ? null : releases[selected];
  useEffect(() => {
    if (favoritesMode) selectPlaylist(null);
    else if (new URLSearchParams(window.location.search).get('view') === 'playlists') setShowPlaylists(true);
  }, [favoritesMode]);
  const playingListRelease = isTrackListInteractive
    ? releases.find(r => r.tracks.some(t => t.id === currentTrack?.id))
    : undefined;
  const headingRelease = (hovered === null ? null : releases[hovered]) || release || playingListRelease || releases[0];
  function filterByStyle(style: string | null, query = search) {
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
      setActiveStyle(style);
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
  useEffect(() => {
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
        setActiveStyle(null);
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
    const queue = (isTrackCollection ? releases : [source]).flatMap(r => r.tracks.filter(t => t.audioUrl).map(t => ({ ...t, waveformData: t.waveformData || [], artist: r.artist, coverUrl: cover(r), releaseId: r.id })));
    if (currentTrack?.id === id) {togglePlayback(); return;}
    const index = queue.findIndex(t => t.id === id); if (index >= 0) playQueue(queue, index);
  }
  async function movePlaylistTrack(from: string, to: string) {
    if (!activePlaylist || savingOrder || from === to) return;
    const playlist = playlists.find(p => p.id === activePlaylist);
    if (!playlist) return;
    const ids = [...playlist.items].sort((a,b) => a.sortOrder-b.sortOrder).map(i => i.track.id);
    const oldIndex = ids.indexOf(from), newIndex = ids.indexOf(to);
    if (oldIndex < 0 || newIndex < 0) return;
    ids.splice(oldIndex,1); ids.splice(newIndex,0,from);
    setSavingOrder(true); setOrderStatus('');
    try {await reorderTracks(activePlaylist, ids); setOrderStatus(lang === 'ru' ? 'Порядок сохранён' : 'Order saved');}
    catch {setOrderStatus(lang === 'ru' ? 'Не удалось сохранить порядок. Попробуйте ещё раз.' : 'Could not save order. Try again.');}
    finally {setSavingOrder(false);}
  }
  function trackActions(id: string) {
    return <div className="paper-track-actions" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
      <FavoriteButton trackId={id} lang={lang} alwaysVisible />
      <TrackPlaylistMenu trackId={id} lang={lang} portal />
    </div>;
  }
  // Keep the complete data/queue, but mount only covers near the viewport.
  // Use the interpolated geometry during the gesture, so records don't pop out
  // when moving between the diagonal shelf, five-column grid and track index.
  const overscan = Math.max(500, sleeveSize * 2);
  const scrollY = isDragging || autoLayout
    ? gridPan * (1-listMix) + listPan * listMix : windowScroll;
  const sideTravel = selected !== null
    ? (sleeves[selected]?.position || 0) - viewport.width / 2
    : isDragging || autoLayout ? travel.current.current : windowTravel;
  const visibleIndices = releases.flatMap((r, i) => {
    if (selected === i || hovered === i || r.tracks.some(t => t.id === dragTrack)) return [i];
    const split = selected === null ? 0 : i < selected ? -1 : 1;
    const along = sleeves[i].position - sideTravel + split * (expanded ? 420 : 220);
    const sideX = along - sleeveSize * .38;
    const sideY = viewport.height - along * viewport.height / viewport.width - sleeveSize * .715 + sleeves[i].rise;
    const gridY = gridBounds.top + 12 + Math.floor(i / columns) * cell;
    const x = sideX * (1-gridMix) + (gridLeft + i % columns * cell) * gridMix;
    const y = listMix > 0
      ? gridY * (1-listMix) + listLayout.positions[i] * listMix - scrollY
      : sideY * (1-gridMix) + (gridY - (gridMix < 1 ? gridPan : scrollY)) * gridMix;
    const height = listMix > 0 ? Math.max(listSize, 114 + r.tracks.length * 36) : sleeveSize * 1.5;
    const nearY = y + height >= -overscan && y <= viewport.height + overscan;
    const nearX = gridMix >= 1 || x + sleeveSize >= -overscan && x <= viewport.width + overscan;
    return nearY && nearX ? [i] : [];
  });
  return <section ref={stage} style={{ '--grid-mix': gridMix, '--list-mix': listMix, '--list-size': `${listSize}px`, '--side-size': `${sideSize}px`, '--grid-size': `${gridSize}px`, '--grid-top': `${gridBounds.top}px`, '--grid-bottom': `${gridBounds.bottom}px` } as CSSProperties} className={`home-stage home-stage--shelf paper-archive${release ? ' is-open' : ''}${expanded ? ' is-expanded' : ''}${filtering ? ' is-filtering' : ''}${isDragging || autoLayout ? ' is-stretching' : ''}${gridMix >= 1 ? ' is-grid' : ''}${listMix > 0 ? ' is-listing' : ''}${isTrackCollection || playlistTransition ? ' is-playlist' : ''}`} aria-label="Коллекция пластинок" onClick={e => {
    if (!(e.target instanceof Element) || e.target.closest('.paper-record, .paper-tracklist, a, button, input')) return;
    setExpanded(false);
    setSelected(null);
    setHovered(null);
  }}>
    <header className="paper-header">
      <div className="paper-identity">
        <Link href="/profile" className="paper-avatar" aria-label="Настройки профиля">
          {user?.avatarStorageUrl && !avatarFailed ? <img src={user.avatarStorageUrl} alt="" onError={() => setAvatarFailed(true)} /> : <span>{user?.displayName?.slice(0,1).toUpperCase() || '○'}</span>}
        </Link>
        <div><Link href="/" className="paper-brand" onClick={e => {if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) selectPlaylist(null);}}>Vinyl collection</Link>
          <input className="paper-search" type="search" value={search} placeholder="Поиск релизов" aria-label="Поиск по артисту и названию релиза" onChange={e => {setSearch(e.target.value);filterByStyle(activeStyle, e.target.value);}} />
        </div>
      </div>
      <h1 className="paper-heading" aria-label={headingRelease ? `${headingRelease.artist} : ${headingRelease.title}` : 'Vinyl collection'}>
        <span className="paper-heading-window paper-heading-artist"><span key={headingRelease?.artist}>{headingRelease?.artist || 'Vinyl collection'}</span></span>
        <span className="paper-heading-colon">:</span>
        <span className="paper-heading-window paper-heading-title"><span key={headingRelease?.id}>{headingRelease?.title || ''}</span></span>
      </h1>
    </header>
    <div className="paper-row" aria-label="Все релизы" onScroll={e => setWindowScroll(Math.floor(e.currentTarget.scrollTop / 128) * 128)} onPointerDown={e => {
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
      if (!middleDrag.current) {
        // Only actual pointer movement changes hover, never a sleeve moving
        // underneath a stationary pointer during scrolling or its own lift.
        if (scrollFrame.current || performance.now() < hoverResumeAt.current || (gridMix > 0 && gridMix < 1) || e.pointerType === 'touch') return;
        const target = e.target instanceof Element ? e.target.closest<HTMLElement>('.paper-record, .paper-list-tracks') : null;
        setHovered(target ? Number(target.dataset.index) : null);
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
      if (e.button !== 1) return;
      middleDrag.current = null;
      setIsDragging(false);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    }} onLostPointerCapture={() => {middleDrag.current = null;setIsDragging(false);}} onPointerCancel={() => {middleDrag.current = null;setIsDragging(false);}} onAuxClick={e => {if(e.button === 1) e.preventDefault();}} onPointerLeave={() => setHovered(null)}><div className="paper-transport" ref={transport}>{visibleIndices.map(i => {
      const r = releases[i];
      const p = sleeves[i].position / 24;
      const side = selected === null ? 0 : gridMix >= 1 ? (i % columns < columns / 2 ? -1 : 1) : i < selected ? -1 : 1;
      return <button type="button" key={`${r.id}-${isTrackCollection ? r.tracks[0]?.id : ''}`} data-index={i} className={`paper-record${selected === i ? ' is-selected' : ''}${selected !== null && gridMix === 0 && (i === selected + 1 || i === 0) ? ' is-front-sleeve' : ''}${hovered === i && selected !== i ? ' is-hovered' : ''}`}
        style={{ '--position': p, '--rise': `${sleeves[i].rise}px`, '--grid-x': `${gridLeft + (i % columns) * cell}px`, '--grid-y': `${gridBounds.top + 12 + Math.floor(i / columns) * cell - (gridMix < 1 ? gridPan : 0)}px`, '--list-y': `${listLayout.positions[i]}px`, '--grid-side-x': `${i % columns < 3 ? 16 + (i % columns) * sideStep : viewport.width - sideSize - 16 - (4 - i % columns) * sideStep}px`, '--split': side, zIndex: selected === i ? releases.length + 2 : releases.length - i } as CSSProperties}
        aria-label={`${r.artist} — ${r.title}`} aria-expanded={selected === i}
        onFocus={() => {if(!scrollFrame.current) setHovered(i);}} onBlur={() => setHovered(null)}
        onClick={e => {
          trigger.current = e.currentTarget;
          stopAutoLayout();
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
        <img src={cover(r)} alt="" loading={selected === i ? 'eager' : 'lazy'} decoding="async" draggable={false} /><span className="paper-record-edge" aria-hidden="true" />
      </button>;
    })}
    {listMix > 0 && visibleIndices.map(i => {
      const r = releases[i];
      return <article data-index={i} onFocus={() => setHovered(i)} onBlur={e => {if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHovered(null);}} onClick={() => setHovered(i)} className={`paper-list-tracks${isTrackCollection ? ' is-compact-track' : ''}`} key={`tracks-${r.id}-${isTrackCollection ? r.tracks[0]?.id : ''}`} style={{ top: (gridBounds.top + 12 + Math.floor(i / columns)*cell)*(1-listMix) + listLayout.positions[i]*listMix, opacity:listMix, pointerEvents:isTrackListInteractive ? 'auto':'none' }}>
        {!isTrackCollection && <h2>{r.artist} : {r.title}</h2>}
        {r.tracks.map(t => <div key={t.id} className={`paper-track-line${dragTrack === t.id ? ' is-dragging' : ''}${dropTrack === t.id ? ' is-drop-target' : ''}`}
          draggable={Boolean(activePlaylist) && !savingOrder && isTrackListInteractive}
          onDragStart={e => {if ((e.target as Element).closest('.paper-track-actions')) {e.preventDefault();return;} e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',t.id);setDragTrack(t.id);suppressTrackClick.current=Infinity;}}
          onDragOver={e => {if (activePlaylist && dragTrack) {e.preventDefault();e.dataTransfer.dropEffect='move';setDropTrack(t.id);}}}
          onDrop={e => {e.preventDefault();if(dragTrack) void movePlaylistTrack(dragTrack,t.id);setDragTrack(null);setDropTrack(null);suppressTrackClick.current=performance.now()+250;}}
          onDragEnd={() => {setDragTrack(null);setDropTrack(null);suppressTrackClick.current=performance.now()+250;}}>
          {activePlaylist && <button className="paper-track-grip" disabled={savingOrder} aria-label={lang === 'ru' ? 'Переместить трек. Alt и стрелки вверх или вниз' : 'Move track. Alt and up or down arrow'} onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.altKey && (e.key==='ArrowUp'||e.key==='ArrowDown')) {e.preventDefault();const other=releases[i+(e.key==='ArrowUp'?-1:1)]?.tracks[0];if(other)void movePlaylistTrack(t.id,other.id);}}}>⠿</button>}
          <button className="paper-track-play" disabled={!t.audioUrl} onClick={() => play(t.id,r)}><small>{isTrackCollection ? i + 1 : t.position || '—'}</small><span>{isTrackCollection ? `${r.artist} — ${t.title}` : t.title}</span>{isTrackCollection && <span className="paper-track-release">{r.title}</span>}</button>
          {isTrackCollection && <span className="paper-track-bpm" title="BPM">{t.bpm ?? '—'}</span>}{activePlaylist && <span className="paper-track-key" title={lang==='ru'?'Тональность':'Key'}>{t.key || '—'}</span>}
          {trackActions(t.id)}<time>{normalizeDurationLabel(t.durationRaw,t.durationSec,'—')}</time>
        </div>)}
        {!r.tracks.length && <p>Треклист не указан</p>}
        {!isTrackCollection && <p className="paper-release-styles" aria-label="Стили релиза">{r.styles.join(' · ') || 'Стиль не указан'}</p>}
      </article>;
    })}
    </div>{gridMix >= 1 && <div aria-hidden="true" style={{ height: (gridBounds.top + 12 + Math.ceil(releases.length / columns) * cell + Math.max(gridBounds.bottom, viewport.height / 2))*(1-listMix) + listLayout.height*listMix, pointerEvents: 'none' }} />}</div>
    {release && expanded && <aside className="paper-tracklist" aria-label={`Треки: ${release.title}`} key={release.id}>
      <p>{release.artist} <span>{release.year}</span></p><h2>{release.title}</h2>
      <ol>{release.tracks.map((t, i) => <li key={t.id} className="paper-track-line" style={{ '--line-delay': `${.48 + Math.min(i, 12) * .065}s` } as CSSProperties}><button className="paper-track-play" disabled={!t.audioUrl} onClick={() => play(t.id)} aria-label={`${currentTrack?.id === t.id && isPlaying ? 'Пауза' : 'Воспроизвести'}: ${t.title}`}><small>{t.position?.trim() || '—'}</small><span>{t.title}</span></button>{trackActions(t.id)}<time>{normalizeDurationLabel(t.durationRaw,t.durationSec,'—')}</time></li>)}</ol>
      {!release.tracks.length && <p>Треклист не указан</p>}
      <p className="paper-release-styles" style={{ animationDelay: `${.55 + Math.min(release.tracks.length, 12) * .065}s` }} aria-label="Стили релиза">{release.styles.join(' · ') || 'Стиль не указан'}</p>
    </aside>}
    <nav className="paper-sections" aria-label="Разделы коллекции">
      <button aria-expanded={showPlaylists} aria-current={activePlaylist ? 'page' : undefined} aria-controls="paper-playlists-panel" onClick={() => setShowPlaylists(v => !v)}><ListMusic size={17} /><span>Playlists <sup>{counts.playlists}</sup></span></button>
      <Link href="/mixes" className="paper-section-mixes"><Disc3 size={17} /><span>Mixes <sup>{counts.mixes}</sup></span></Link>
      <Link href="/favorites" aria-current={favoritesMode && !activePlaylist ? 'page' : undefined} className="paper-section-favorites"><Heart size={17} /><span>Favorites <sup>{counts.favorites}</sup></span></Link>
    </nav>
    <nav id="paper-playlists-panel" className="paper-playlists" aria-label="Плейлисты" data-open={showPlaylists} aria-hidden={!showPlaylists} inert={!showPlaylists}>
      {playlistsLoading && <span>Загрузка плейлистов…</span>}
      {playlists.map(p => <button key={p.id} aria-pressed={activePlaylist === p.id} onClick={() => selectPlaylist(p.id)}>{p.name} <sup>{p.items.length}</sup></button>)}
      {!playlistsLoading && !playlists.length && <Link href="/playlists">{user ? 'Создать плейлист ↗' : 'Войти и открыть плейлисты ↗'}</Link>}
    </nav>
    {favoritesMode ? <Link href="/?skin=shelf" className="paper-collection-back">Вся коллекция</Link> : activePlaylist && <button className="paper-collection-back" onClick={() => selectPlaylist(null)}>Вся коллекция</button>}
    {activePlaylist && orderStatus && <p className="paper-order-status" role="status">{orderStatus}</p>}
    <nav className="paper-styles" aria-label="Стили релизов" inert={showPlaylists || expanded || isTrackCollection || playlistTransition} aria-hidden={showPlaylists || expanded || isTrackCollection || playlistTransition}>
      <button aria-pressed={activeStyle === null} onClick={() => filterByStyle(null)}>All <sup>{allReleases.length}</sup></button>
      <div>{styleCounts.map(([style, count]) => <button key={style} aria-pressed={activeStyle === style} onClick={() => filterByStyle(style)}>{style} <sup>{count}</sup></button>)}</div>
    </nav>
    {!releases.length && <p className="paper-empty" role="status">{activePlaylist ? 'Здесь пока нет треков. Вернитесь в коллекцию или добавьте треки на странице плейлистов.' : allReleases.length ? 'Ничего не найдено. Измените поиск или выберите All.' : 'В коллекции пока нет релизов.'}</p>}
  </section>;
}
