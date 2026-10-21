import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Animated, BackHandler, Easing, Image, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChevronDown, Disc3, Download, Heart, Library, ListMusic, Moon, Sun, X } from 'lucide-react-native';
import { ReleaseCover } from '../components/ReleaseCover';
import { getHomeReleases, getLibraryFeedFiltered, getRelease, getReleaseStyles } from '../lib/api';
import { useDebouncedValue } from '../lib/use-debounced-value';
import { archiveGeometry, archiveStep, archiveWindow, clampPosition, expandedCoverSize, selectArchiveRelease, type ArchiveMode, type ArchiveSelection, type CoverGeometry } from '../lib/archive-geometry';
import { ArchiveTrackList } from '../components/ArchiveTrackList';
import { ArchiveTracksView } from '../components/ArchiveTracksView';
import { ArchiveGridView } from '../components/ArchiveGridView';
import { archiveMomentum } from '../lib/archive-momentum';
import { archiveSectionColor, ARCHIVE_SECTION_COLORS } from '../lib/archive-section-colors';
import { MINI_PLAYER_MASK_HEIGHT } from '../lib/mini-player-layout';
import { playlistArchiveItems, archiveItemKey } from '../lib/playlist-archive';
import { buildPlayableReleaseTracks } from '../lib/release-player-tracks';
import { adaptiveStyles, colors, type ThemeMode } from '../theme';
import type { LanguageProps, PlayerTrack, Playlist, Release, TabKey, Track } from '../types';

type Props = LanguageProps & {
  isActive?: boolean; isAdmin?: boolean; avatarUrl?: string | null;
  theme: ThemeMode; onToggleTheme: () => void; onNavigate: (tab: TabKey) => void;
  onOpenProfile: () => void; onOpenRelease: (release: Release) => void;
  activeTrackId?: string | null; isPlaying?: boolean;
  onPlayTrack: (track: PlayerTrack, queue?: PlayerTrack[]) => void;
  onTogglePlayback: () => void;
  playlistLibrary?: { playlists: Playlist[]; requiresSignIn: boolean; onManage: () => void };
  section?: 'collection' | 'favorites' | 'mixes'; favorites?: Track[]; requiresSignIn?: boolean;
  favoriteIds?: Set<string>; onFavoriteTrack?: (id: string) => void; showTrackMeta?: boolean;
  playlists?: Playlist[]; onPlaylistToggle?: (playlist: Playlist, trackId: string) => Promise<void>;
};
const PAGE_SIZE = 48;
const modes: ArchiveMode[] = ['shelf', 'stack', 'grid', 'tracks'];
const modeLabels = { en: ['Shelf', 'Stack', 'Grid', 'Tracks'], ru: ['Полка', 'Стопка', 'Сетка', 'Треки'] };
const COVER_BASE = 180;

const Sleeve = memo(function Sleeve({ index, release, geometry, origin, mode, moving, browsing, reducedMotion, onPress, isAdmin, tracks, labelWidth, scroll, anchor, scrollX, scrollY }: {
  index: number;
  release: Release; geometry: CoverGeometry; moving: boolean; browsing: boolean; reducedMotion: boolean;
  onPress: (index: number) => void; isAdmin: boolean; tracks: boolean; labelWidth: number;
  scroll: Animated.Value; anchor: number; scrollX: number; scrollY: number;
  mode: ArchiveMode;
  origin?: CoverGeometry;
}) {
  const values = useRef(new Animated.ValueXY({ x: geometry.x + geometry.size / 2 - COVER_BASE / 2, y: geometry.y + geometry.size / 2 - COVER_BASE / 2 })).current;
  const tilt = useRef(new Animated.Value(geometry.rotateX)).current;
  const rotation = useRef(new Animated.Value(geometry.rotateZ)).current;
  const rotationAfter = useRef(new Animated.Value(geometry.rotateZAfter)).current;
  const scale = useRef(new Animated.Value(geometry.scale * geometry.size / COVER_BASE)).current;
  const perspective = useRef(new Animated.Value(geometry.perspective)).current;
  const labels = useRef(new Animated.Value(tracks ? 1 : 0)).current;
  const labelPosition = useRef(new Animated.ValueXY({ x: geometry.x + 60, y: geometry.y })).current;
  const opacity = useRef(new Animated.Value(geometry.opacity ?? 1)).current;
  const wasBrowsing = useRef(browsing);
  const previousMode = useRef(mode);
  const offset = useMemo(() => Animated.subtract(scroll, anchor), [scroll, anchor]);
  const translateX = useMemo(() => Animated.add(values.x, Animated.multiply(offset, scrollX)), [values, offset, scrollX]);
  const translateY = useMemo(() => Animated.add(values.y, Animated.multiply(offset, scrollY)), [values, offset, scrollY]);
  const labelY = useMemo(() => Animated.add(labelPosition.y, Animated.multiply(offset, scrollY)), [labelPosition, offset, scrollY]);
  useLayoutEffect(() => {
    if (!origin) return;
    // Start an opened Grid cover at its actual scrolled cell, not the hidden canvas's stale position.
    values.setValue({ x: origin.x + origin.size / 2 - COVER_BASE / 2, y: origin.y + origin.size / 2 - COVER_BASE / 2 });
    scale.setValue(origin.scale * origin.size / COVER_BASE);
    tilt.setValue(origin.rotateX); rotation.setValue(origin.rotateZ); rotationAfter.setValue(origin.rotateZAfter);
  }, [origin]);
  useLayoutEffect(() => {
    const target = { x: geometry.x + geometry.size / 2 - COVER_BASE / 2, y: geometry.y + geometry.size / 2 - COVER_BASE / 2 };
    const labelTarget = { x: geometry.x + 60, y: geometry.y };
    const direct = moving || reducedMotion || (browsing && wasBrowsing.current);
    wasBrowsing.current = browsing;
    if (direct) { values.setValue(target); labelPosition.setValue(labelTarget); return; }
    const animation = Animated.parallel([
      Animated.timing(values, { toValue: target, duration: 750, easing: Easing.bezier(.16, 1, .3, 1), useNativeDriver: true }),
      Animated.timing(labelPosition, { toValue: labelTarget, duration: 750, easing: Easing.bezier(.16, 1, .3, 1), useNativeDriver: true }),
    ]);
    animation.start(); return () => animation.stop();
  }, [geometry.x, geometry.y, geometry.size, moving, browsing, reducedMotion]);
  useLayoutEffect(() => {
    const enteringStack = previousMode.current !== mode && mode === 'stack';
    previousMode.current = mode;
    // Perspective is a camera setting, not a distance to tween from 1e6 to 1200.
    // Enter Stack at its final orientation; only transport and scale assemble it.
    perspective.setValue(geometry.perspective);
    if (enteringStack || reducedMotion) {
      tilt.setValue(geometry.rotateX); rotation.setValue(geometry.rotateZ); rotationAfter.setValue(geometry.rotateZAfter);
      return;
    }
    const config = { duration: 750, easing: Easing.bezier(.16, 1, .3, 1), useNativeDriver: true };
    const animation = Animated.parallel([
      Animated.timing(tilt, { ...config, toValue: geometry.rotateX }),
      Animated.timing(rotation, { ...config, toValue: geometry.rotateZ }),
      Animated.timing(rotationAfter, { ...config, toValue: geometry.rotateZAfter }),
    ]);
    animation.start(); return () => animation.stop();
  }, [mode, geometry.rotateX, geometry.rotateZ, geometry.rotateZAfter, geometry.perspective, reducedMotion]);
  useEffect(() => {
    const config = { duration: reducedMotion ? 0 : 750, easing: Easing.bezier(.16, 1, .3, 1), useNativeDriver: true };
    const animation = Animated.parallel([
      Animated.timing(scale, { ...config, toValue: geometry.scale * geometry.size / COVER_BASE }),
      Animated.timing(labels, { ...config, toValue: tracks ? 1 : 0 }),
      Animated.timing(opacity, { ...config, toValue: geometry.opacity ?? 1 }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [geometry.size, geometry.scale, geometry.opacity, tracks, reducedMotion]);
  const angles = useMemo(() => [rotation, tilt, rotationAfter].map(value => value.interpolate({ inputRange: [-180, 180], outputRange: ['-180deg', '180deg'] })), [rotation, tilt, rotationAfter]);
  return <View pointerEvents={(geometry.opacity ?? 1) === 0 ? 'none' : 'box-none'} style={[styles.sleeveLayer, { zIndex: geometry.zIndex }]}>
    <Animated.View renderToHardwareTextureAndroid style={[styles.sleeve, { width: COVER_BASE, height: COVER_BASE, opacity, transformOrigin: 'center', transform: [{ translateX }, { translateY }, { perspective }, { rotateZ: angles[0] }, { rotateX: angles[1] }, { rotateZ: angles[2] }, { scale }] }]}>
    <Pressable onPress={() => onPress(index)} accessibilityRole="button" accessibilityLabel={`${release.artist} : ${release.title}`} style={styles.coverButton}>
      <ReleaseCover release={release} isAdmin={isAdmin} style={styles.cover} highQuality={geometry.zIndex === 20000} />
    </Pressable>
    </Animated.View>
    <Animated.View pointerEvents={tracks ? 'auto' : 'none'} accessibilityElementsHidden={!tracks} importantForAccessibility={tracks ? 'auto' : 'no-hide-descendants'} style={[styles.canvasTrackLabels, { opacity: labels, width: labelWidth, transform: [{ translateX: labelPosition.x }, { translateY: labelY }] }]}><Pressable onPress={() => onPress(index)} style={styles.canvasTrackButton}><View style={styles.trackLabels}><Text style={styles.trackArtist} numberOfLines={1}>{release.artist}</Text><Text style={styles.trackTitle} numberOfLines={1}>{release.title}</Text></View><Text style={styles.trackYear}>{release.year}</Text></Pressable></Animated.View>
  </View>;
}, (previous, next) => {
  const { geometry: a, ...before } = previous;
  const { geometry: b, ...after } = next;
  return Object.keys(before).every(key => before[key as keyof typeof before] === after[key as keyof typeof after])
    && Object.keys(a).every(key => a[key as keyof CoverGeometry] === b[key as keyof CoverGeometry]);
});

export function HomeScreen({ lang, onLanguageChange, isActive = true, isAdmin = false, avatarUrl, theme, onToggleTheme, onNavigate, onOpenProfile, activeTrackId, isPlaying = false, onPlayTrack, onTogglePlayback, playlistLibrary, section = 'collection', favorites, requiresSignIn = false, favoriteIds, onFavoriteTrack, showTrackMeta = true, playlists = [], onPlaylistToggle }: Props) {
  const [catalogReleases, setReleases] = useState<Release[]>([]);
  const [genres, setGenres] = useState<Array<{ name: string; count: number }>>([]);
  const [selectedStyle, setSelectedStyle] = useState('');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<ArchiveMode>('shelf');
  const [position, setPosition] = useState(0);
  const [moving, setMoving] = useState(false);
  const [shelfAnchor, setShelfAnchor] = useState(0);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [picker, setPicker] = useState<'sections' | 'genres' | 'playlists' | 'trackPlaylists' | null>(null);
  const [playlistTrackId, setPlaylistTrackId] = useState<string | null>(null);
  const [savingPlaylist, setSavingPlaylist] = useState(false);
  const [playlistId, setPlaylistId] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [selection, setSelection] = useState<ArchiveSelection>(null);
  const [selectionOrigin, setSelectionOrigin] = useState<{ index: number; geometry: CoverGeometry } | null>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const [detail, setDetail] = useState<Release | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [detailRetry, setDetailRetry] = useState(0);
  const playlistMode = Boolean(playlistLibrary);
  const trackCollection = playlistMode || section === 'favorites';
  const mixesMode = section === 'mixes';
  const sectionKey = playlistMode ? 'playlists' : section === 'collection' ? 'home' : section;
  const sectionColor = archiveSectionColor(sectionKey, colors.muted);
  const sectionHighlight = { color: sectionColor };
  const playlistHighlight = { color: ARCHIVE_SECTION_COLORS.playlists };
  const activePlaylist = playlistLibrary?.requiresSignIn ? undefined : playlistLibrary?.playlists.find(item => item.id === playlistId) || playlistLibrary?.playlists[0];
  const debouncedQuery = useDebouncedValue(query);
  const releases = useMemo(() => playlistMode ? playlistArchiveItems(activePlaylist, debouncedQuery) : section === 'favorites' ? playlistArchiveItems({ items: requiresSignIn ? [] : (favorites || []).map(track => ({ track })) }, debouncedQuery) : catalogReleases, [playlistMode, activePlaylist, section, requiresSignIn, favorites, debouncedQuery, catalogReleases]);
  const playlistQueue = useMemo(() => trackCollection || mixesMode ? releases.flatMap(buildPlayableReleaseTracks) : undefined, [trackCollection, mixesMode, releases]);
  const expanded = selection?.expanded === true;
  const selectedRelease = selection ? releases[selection.index] : null;
  const panel = useRef(new Animated.Value(0)).current;
  const chrome = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(panel, { toValue: expanded ? 1 : 0, duration: reducedMotion ? 0 : 350, delay: expanded && !reducedMotion ? 250 : 0, useNativeDriver: true }),
      Animated.timing(chrome, { toValue: expanded ? 0 : 1, duration: reducedMotion ? 0 : 250, useNativeDriver: true }),
    ]);
    animation.start(); return () => animation.stop();
  }, [expanded, reducedMotion]);
  useEffect(() => {
    if (!selectedRelease || trackCollection) { setDetail(null); setDetailLoading(false); setDetailError(false); return; }
    let cancelled = false;
    setDetailLoading(true); setDetailError(false);
    void getRelease(selectedRelease.id).then(next => { if (!cancelled) setDetail(next); }).catch(() => { if (!cancelled) setDetailError(true); }).finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedRelease?.id, detailRetry, trackCollection]);
  function collapseRelease() {
    setSelectionOrigin(null);
    if (mode === 'grid' && !reducedMotion) {
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
      setTransitioning(true);
      transitionTimer.current = setTimeout(() => setTransitioning(false), 750);
    }
    setSelection(current => current?.expanded && mode === 'shelf' ? { ...current, expanded: false } : null);
  }
  useEffect(() => {
    if (!isActive || !selection) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { collapseRelease(); return true; });
    return () => subscription.remove();
  }, [isActive, selection, mode]);
  const request = useRef(0);
  const busy = useRef(false);
  const positionRef = useRef(position);
  const scroll = useRef(new Animated.Value(0)).current;
  const motionGeneration = useRef(0);
  const windowPosition = useRef(0);
  function stopScroll() {
    motionGeneration.current += 1;
    scroll.stopAnimation(value => {
      positionRef.current = value; windowPosition.current = Math.floor(value);
      setPosition(value); setMoving(false);
    });
  }
  useEffect(() => {
    const listener = scroll.addListener(({ value }) => {
      positionRef.current = value;
      // Only reconcile the cover window when a release boundary is crossed.
      if (Math.floor(value) !== windowPosition.current) {
        windowPosition.current = Math.floor(value); setPosition(value);
      }
    });
    return () => { motionGeneration.current += 1; scroll.removeListener(listener); scroll.stopAnimation(); };
  }, [scroll]);
  useEffect(() => { if (!isActive) stopScroll(); }, [isActive]);
  const dragOrigin = useRef(0);
  const dragSelection = useRef<number | null>(null);
  const dragSelectionStep = useRef(0);
  const gridPhase = useRef(0);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionIndices, setTransitionIndices] = useState<number[]>([]);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (transitionTimer.current) clearTimeout(transitionTimer.current); }, []);
  function changeMode(next: ArchiveMode) {
    if (next === mode) return;
    stopScroll();
    setSelection(null);
    setSelectionOrigin(null);
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    if (next === 'grid') gridPhase.current = position % 4;
    setTransitionIndices(current => [...new Set([...current, ...archiveWindow(position, releases.length, mode), ...archiveWindow(position, releases.length, next)])]);
    setMoving(false); setTransitioning(!reducedMotion); setMode(next);
    transitionTimer.current = setTimeout(() => { setTransitioning(false); setTransitionIndices([]); }, reducedMotion ? 0 : 950);
  }
  const ru = lang === 'ru';
  const total = trackCollection ? releases.length : selectedStyle ? genres.find(genre => genre.name === selectedStyle)?.count || releases.length : releases.length;

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => sub.remove();
  }, []);
  useEffect(() => { void getReleaseStyles().then(setGenres).catch(() => undefined); }, []);
  useEffect(() => { request.current += 1; stopScroll(); setSelection(null); }, [query, selectedStyle]);
  useEffect(() => {
    request.current += 1; busy.current = false;
    stopScroll(); scroll.setValue(0); positionRef.current = 0; windowPosition.current = 0;
    setPosition(0); setSelection(null); setSelectionOrigin(null); setPicker(null); setError(''); setLoading(false);
    if (!trackCollection) setReleases([]);
  }, [playlistMode, section, activePlaylist?.id, trackCollection ? debouncedQuery : '']);
  useEffect(() => {
    if (trackCollection) return;
    const controller = new AbortController();
    const id = ++request.current;
    busy.current = true; setLoading(true); setError('');
    const filters = { styles: selectedStyle ? [selectedStyle] : [], search: debouncedQuery };
    const page = mixesMode ? getLibraryFeedFiltered(PAGE_SIZE, 0, { ...filters, isMix: true }, controller.signal).then(feed => ({ releases: feed.releases, hasMore: feed.hasMore })) : getHomeReleases(PAGE_SIZE, 0, filters, controller.signal).then(items => ({ releases: items, hasMore: items.length === PAGE_SIZE }));
    void page.then(({ releases: next, hasMore: more }) => {
      if (controller.signal.aborted || id !== request.current) return;
      stopScroll(); scroll.setValue(0); windowPosition.current = 0;
      setReleases(next); setHasMore(more); setPosition(0); positionRef.current = 0;
    }).catch(() => {
      if (!controller.signal.aborted && id === request.current) setError(ru ? 'Нет соединения. Откройте загрузки или повторите.' : 'No connection. Open downloads or retry.');
    }).finally(() => { if (id === request.current) { busy.current = false; setLoading(false); } });
    return () => controller.abort();
  }, [debouncedQuery, selectedStyle, trackCollection, mixesMode]);
  async function loadMore() {
    if (trackCollection || busy.current || !hasMore || !isActive || query !== debouncedQuery) return;
    const id = request.current; busy.current = true;
    try {
      const filters = { styles: selectedStyle ? [selectedStyle] : [], search: debouncedQuery };
      const feed = mixesMode ? await getLibraryFeedFiltered(PAGE_SIZE, releases.length, { ...filters, isMix: true }) : null;
      const next = feed ? feed.releases : await getHomeReleases(PAGE_SIZE, releases.length, filters);
      if (id !== request.current) return;
      setReleases(current => [...current, ...next.filter(release => !current.some(existing => existing.id === release.id))]);
      setHasMore(feed ? feed.hasMore : next.length === PAGE_SIZE);
    } catch { if (id === request.current) setError(ru ? 'Не удалось загрузить следующую страницу.' : 'Unable to load the next page.'); }
    finally { if (id === request.current) busy.current = false; }
  }
  useEffect(() => { if (position >= releases.length - 12 && releases.length) void loadMore(); }, [position, releases.length, isActive]);
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => !expanded && !transitioning && Math.max(Math.abs(gesture.dx), Math.abs(gesture.dy)) > 8,
    onPanResponderGrant: () => {
      motionGeneration.current += 1; scroll.stopAnimation();
      const currentSelection = selectionRef.current;
      dragSelection.current = mode === 'shelf' && currentSelection && !currentSelection.expanded ? currentSelection.index : null;
      dragSelectionStep.current = 0;
      if (dragSelection.current === null) setSelection(null);
      dragOrigin.current = positionRef.current; setMoving(dragSelection.current === null);
      setShelfAnchor(positionRef.current);
    },
    onPanResponderMove: (_event, gesture) => {
      if (dragSelection.current !== null) {
        const step = Math.trunc(-gesture.dx / Math.max(52, viewport.width * .16));
        if (step !== dragSelectionStep.current) {
          dragSelectionStep.current = step;
          const index = clampPosition(dragSelection.current + step, releases.length);
          positionRef.current = index; scroll.setValue(index); setPosition(index);
          setSelection({ index, expanded: false });
        }
        return;
      }
      const distance = mode === 'shelf' ? (-gesture.dx + gesture.dy * 0.35) / 24 : -gesture.dy / archiveStep(mode, viewport);
      const next = clampPosition(dragOrigin.current + distance, releases.length);
      positionRef.current = next; scroll.setValue(next);
    },
    onPanResponderRelease: (_event, gesture) => {
      if (dragSelection.current !== null) { dragSelection.current = null; setMoving(false); return; }
      const velocity = mode === 'shelf' ? (-gesture.vx + gesture.vy * .35) / 24 : -gesture.vy / archiveStep(mode, viewport);
      const momentum = archiveMomentum(positionRef.current, velocity, releases.length);
      const generation = ++motionGeneration.current;
      if (reducedMotion || momentum.duration === 0) { setPosition(positionRef.current); setMoving(false); return; }
      Animated.timing(scroll, { toValue: momentum.target, duration: momentum.duration, easing: Easing.out(Easing.cubic), useNativeDriver: true, isInteraction: false }).start(({ finished }) => {
        if (!finished || generation !== motionGeneration.current) return;
        positionRef.current = momentum.target; setPosition(momentum.target); setMoving(false);
      });
    },
    onPanResponderTerminate: () => stopScroll(),
  }), [mode, viewport.width, viewport.height, releases.length, transitioning, expanded, reducedMotion]);
  const sections = [
    { key: 'home' as TabKey, label: ru ? 'Коллекция' : 'Collection', Icon: Library },
    { key: 'playlists' as TabKey, label: ru ? 'Плейлисты' : 'Playlists', Icon: ListMusic },
    { key: 'mixes' as TabKey, label: ru ? 'Миксы' : 'Mixes', Icon: Disc3 },
    { key: 'favorites' as TabKey, label: ru ? 'Избранное' : 'Favorites', Icon: Heart },
    { key: 'downloads' as TabKey, label: ru ? 'Загрузки' : 'Downloads', Icon: Download },
  ];
  const SectionIcon = sections.find(item => item.key === sectionKey)?.Icon || Library;
  const selectGenre = (name: string) => { setSelectedStyle(name); setPicker(null); };
  const tracksVisible = mode === 'tracks' && !transitioning && !selection;
  const gridVisible = mode === 'grid' && !transitioning && !selection;
  const nativeListVisible = tracksVisible || gridVisible;
  const sectionLabel = sectionKey === 'playlists' ? (ru ? 'Плейлисты' : 'Playlists') : sectionKey === 'favorites' ? (ru ? 'Избранное' : 'Favorites') : sectionKey === 'mixes' ? (ru ? 'Миксы' : 'Mixes') : (ru ? 'Коллекция' : 'Collection');
  const signInNeeded = playlistLibrary?.requiresSignIn || (section === 'favorites' && requiresSignIn);
  function openTrackPlaylists(id: string) {
    if (requiresSignIn) { onOpenProfile(); return; }
    setPlaylistTrackId(id); setPicker('trackPlaylists');
  }
  async function toggleTrackPlaylist(playlist: Playlist) {
    if (!playlistTrackId || !onPlaylistToggle || savingPlaylist) return;
    setSavingPlaylist(true);
    try { await onPlaylistToggle(playlist, playlistTrackId); }
    catch { Alert.alert(ru ? 'Не удалось сохранить' : 'Unable to save', ru ? 'Проверьте соединение и повторите.' : 'Check your connection and retry.'); }
    finally { setSavingPlaylist(false); }
  }
  const shelfTransport = mode === 'shelf' && !selection && !transitioning;
  const layoutPosition = shelfTransport && moving ? shelfAnchor : position;
  const shelfOffset = useMemo(() => Animated.subtract(scroll, layoutPosition), [scroll, layoutPosition]);
  const shelfTranslateX = useMemo(() => Animated.multiply(shelfOffset, -24), [shelfOffset]);
  const shelfTranslateY = useMemo(() => Animated.multiply(shelfOffset, 24 * .28), [shelfOffset]);
  const pressRelease = useCallback((index: number) => {
    if (moving || transitioning) return;
    if (selection?.index === index && selection.expanded && mode !== 'shelf') { collapseRelease(); return; }
    if (mode === 'tracks' && playlistQueue) {
      const track = playlistQueue.find(item => item.id === releases[index].tracks[0]?.id);
      if (track) { if (track.id === activeTrackId) onTogglePlayback(); else onPlayTrack(track, playlistQueue); }
      return;
    }
    positionRef.current = index; scroll.setValue(index); setPosition(index);
    setSelection(current => selectArchiveRelease(current, index, mode));
  }, [moving, transitioning, selection, mode, playlistQueue, releases, activeTrackId, onTogglePlayback, onPlayTrack, reducedMotion, scroll]);
  return <View style={styles.screen} onLayout={event => setViewport(event.nativeEvent.layout)}>
    <View style={styles.header}>
      <Pressable style={styles.avatar} onPress={onOpenProfile} accessibilityLabel={ru ? 'Профиль' : 'Profile'}>
        {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatar} /> : <Text style={styles.avatarInitial}>M</Text>}
      </Pressable>
      <View style={styles.headerBody}>
        <View style={styles.brandRow}>
          <Pressable onPress={() => onNavigate('home')}><Text style={styles.brand}>{ru ? 'Коллекция винила' : 'Vinyl collection'}</Text></Pressable>
          <Pressable onPress={onToggleTheme} hitSlop={8} accessibilityLabel={ru ? 'Сменить тему' : 'Change theme'}>{theme === 'dark' ? <Sun size={14} color={colors.muted} /> : <Moon size={14} color={colors.muted} />}</Pressable>
          <Pressable onPress={() => onLanguageChange(ru ? 'en' : 'ru')} hitSlop={6}><Text style={styles.language}>{ru ? 'RU' : 'ENG'}</Text></Pressable>
        </View>
        <View style={styles.searchRow}>
          <TextInput value={query} onChangeText={setQuery} style={styles.search} placeholder={ru ? 'Поиск' : 'Search'} placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} accessibilityLabel={ru ? 'Поиск релизов и миксов' : 'Search releases and mixes'} />
          <Animated.View pointerEvents={expanded ? 'none' : 'auto'} style={[styles.modes, { opacity: chrome }]}>{modes.map((key, index) => <Pressable key={key} onPress={() => changeMode(key)} accessibilityRole="tab" accessibilityState={{ selected: mode === key }} style={[styles.mode, mode === key && styles.modeSelected]}><Text style={[styles.modeText, mode === key && styles.modeTextSelected]}>{modeLabels[lang][index]}</Text></Pressable>)}</Animated.View>
        </View>
      </View>
    </View>
    <Animated.View pointerEvents={expanded ? 'none' : 'box-none'} style={[styles.archiveChrome, { opacity: chrome }]}>
    {mode === 'shelf' ? <>
      <View style={styles.sections}>{sections.map(({ key, label, Icon }) => <Pressable key={key} onPress={() => { if (key === 'playlists' && playlistMode) setPicker('playlists'); else onNavigate(key); }} style={styles.section}><Icon size={13} color={key === sectionKey ? archiveSectionColor(key, colors.muted) : colors.muted} strokeWidth={1.5} /><Text style={[styles.sectionLabel, key === sectionKey && styles.sectionActive]}>{label}</Text></Pressable>)}</View>
      {selectedRelease && !expanded && <Text style={[styles.heading, { top: Math.max(215, viewport.height * 0.265) }]} numberOfLines={2}><Text style={styles.headingArtist}>{selectedRelease.artist}</Text>{` : ${selectedRelease.title}`}</Text>}
      <ScrollView style={[styles.genreColumn, { height: Math.min(190, viewport.height * 0.24) + 84 }]} contentContainerStyle={{ paddingBottom: activeTrackId ? MINI_PLAYER_MASK_HEIGHT : 0 }} showsVerticalScrollIndicator={false}>
        {playlistLibrary ? <>
          {playlistLibrary.playlists.map(item => <Pressable key={item.id} style={styles.genre} onPress={() => setPlaylistId(item.id)}><Text style={[styles.genreText, item.id === activePlaylist?.id && sectionHighlight]}>{item.name} <Text style={styles.count}>{item.items.length}</Text></Text></Pressable>)}
          <Pressable style={styles.genre} onPress={playlistLibrary.onManage}><Text style={styles.genreText}>{ru ? 'Управление' : 'Manage playlists'}</Text></Pressable>
        </> : <>
        <Pressable style={styles.genre} onPress={() => selectGenre('')}><Text style={[styles.genreText, !selectedStyle && sectionHighlight]}>{ru ? 'Все' : 'All'} <Text style={styles.count}>{Math.min(releases.length, Math.round(position) + 1)} - {total}{hasMore && !trackCollection && !selectedStyle ? '+' : ''}</Text></Text></Pressable>
        {!trackCollection && genres.map(genre => <Pressable key={genre.name} onPress={() => selectGenre(genre.name)} style={styles.genre}><Text style={[styles.genreText, genre.name === selectedStyle && sectionHighlight]}>{genre.name} <Text style={styles.count}>{genre.count}</Text></Text></Pressable>)}
        </>}
      </ScrollView>
    </> : <View style={styles.context}>
      <Pressable style={styles.contextButton} onPress={() => setPicker('sections')}><SectionIcon size={14} color={sectionColor} /><Text style={styles.contextText}>{sectionLabel}</Text><ChevronDown size={13} color={colors.text} /></Pressable>
      <Pressable style={[styles.contextButton, { flex: 1, justifyContent: 'flex-end', minWidth: 0 }]} onPress={() => setPicker(playlistMode ? 'playlists' : 'genres')}><Text numberOfLines={1} style={[styles.contextText, sectionHighlight, { flexShrink: 1 }]}>{playlistMode ? activePlaylist?.name || (ru ? 'Выбрать плейлист' : 'Choose playlist') : selectedStyle || (ru ? 'Все' : 'All')} <Text style={styles.count}>{Math.min(releases.length, Math.round(position) + 1)} - {total}</Text></Text><ChevronDown size={13} color={sectionColor} /></Pressable>
    </View>}
    </Animated.View>
    <View style={[styles.archiveViewport, nativeListVisible && { opacity: 0 }]} pointerEvents={nativeListVisible ? 'none' : 'auto'} aria-hidden={nativeListVisible} accessibilityElementsHidden={nativeListVisible} importantForAccessibility={nativeListVisible ? 'no-hide-descendants' : 'auto'} onTouchStart={() => { if (moving) stopScroll(); }} {...pan.panHandlers}>
      <Animated.View pointerEvents="box-none" style={[styles.sleeveLayer, shelfTransport && { transform: [{ translateX: shelfTranslateX }, { translateY: shelfTranslateY }] }]}>
      {[...new Set([...archiveWindow(position, releases.length, mode), ...transitionIndices, ...(selection ? [selection.index] : [])])].filter(index => viewport.width > 0 && index < releases.length).sort((a, b) => a - b).map(index => {
        const geometry = archiveGeometry(mode, index, mode === 'grid' ? position - gridPhase.current : layoutPosition, viewport, selection);
        return <Sleeve index={index} key={archiveItemKey(releases[index], trackCollection)} release={mode === 'tracks' && trackCollection ? { ...releases[index], title: releases[index].tracks[0]?.title || releases[index].title } : releases[index]} geometry={geometry} origin={selectionOrigin?.index === index ? selectionOrigin.geometry : undefined} mode={mode} moving={moving} browsing={!selection && !transitioning} reducedMotion={reducedMotion} scroll={scroll} anchor={layoutPosition} scrollX={0} scrollY={!selection && !transitioning && mode !== 'shelf' ? -archiveStep(mode, viewport) : 0} isAdmin={isAdmin} tracks={mode === 'tracks' && !selection} labelWidth={viewport.width * 0.94 - 60} onPress={pressRelease} />;
      })}
      </Animated.View>
    </View>
    {gridVisible && <ArchiveGridView releases={releases} width={viewport.width} initialPosition={position - gridPhase.current} trackCollection={trackCollection} isAdmin={isAdmin} onLoadMore={() => void loadMore()} onAnchor={value => { const next = clampPosition(value, releases.length); gridPhase.current = 0; positionRef.current = next; scroll.setValue(next); setPosition(next); }} onSelect={(index, value) => { const next = clampPosition(value, releases.length); gridPhase.current = 0; positionRef.current = next; scroll.setValue(next); setPosition(next); setSelectionOrigin({ index, geometry: archiveGeometry('grid', index, next, viewport) }); setSelection({ index, expanded: true }); }} />}
    {tracksVisible && <ArchiveTracksView releases={releases} initialIndex={position} compact={trackCollection} queue={playlistQueue} lang={lang} onLanguageChange={onLanguageChange} activeTrackId={activeTrackId} isPlaying={isPlaying} onPlayTrack={onPlayTrack} onTogglePlayback={onTogglePlayback} favoriteIds={favoriteIds} onFavoriteTrack={onFavoriteTrack || (() => onOpenProfile())} onPlaylistMenu={openTrackPlaylists} showTrackMeta={showTrackMeta} showKey={section !== 'favorites'} onLoadMore={() => void loadMore()} onAnchor={index => { const next = clampPosition(index, releases.length); positionRef.current = next; scroll.setValue(next); setPosition(next); }} />}
    {!expanded && <View pointerEvents="none" style={styles.archiveTopMask} />}
    {selection && <Pressable style={styles.closeRelease} onPress={collapseRelease} accessibilityLabel={ru ? 'Закрыть релиз' : 'Close release'}><X color={colors.text} size={22} /></Pressable>}
    {selectedRelease && <Animated.View pointerEvents={expanded ? 'auto' : 'none'} accessibilityElementsHidden={!expanded} importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'} style={[styles.releasePanel, { top: viewport.height * .16 + expandedCoverSize(viewport) + 16, opacity: panel, transform: [{ translateY: panel.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }]}>
      <ArchiveTrackList release={!trackCollection && detail?.id === selectedRelease.id ? detail : selectedRelease} loading={detailLoading} error={detailError} onRetry={() => setDetailRetry(value => value + 1)} lang={lang} activeTrackId={activeTrackId} isPlaying={isPlaying} onPlayTrack={onPlayTrack} onTogglePlayback={onTogglePlayback} playbackQueue={playlistQueue} favoriteIds={favoriteIds} onFavoriteTrack={onFavoriteTrack} onPlaylistMenu={openTrackPlaylists} showTrackMeta={showTrackMeta} showKey={section !== 'favorites'} />
    </Animated.View>}
    {!releases.length || error ? <View style={styles.status} pointerEvents="box-none"><Text style={styles.statusText}>{signInNeeded ? (ru ? 'Войдите, чтобы увидеть личные треки.' : 'Sign in to see your library.') : error || (loading ? (ru ? 'Загрузка...' : 'Loading...') : playlistMode && !activePlaylist ? (ru ? 'Плейлистов пока нет.' : 'No playlists yet.') : section === 'favorites' && !debouncedQuery ? (ru ? 'Избранных треков пока нет.' : 'No favorite tracks yet.') : mixesMode && !debouncedQuery ? (ru ? 'Миксов пока нет.' : 'No mixes yet.') : (ru ? 'Ничего не найдено' : 'Nothing found'))}</Text>{signInNeeded ? <Pressable onPress={onOpenProfile}><Text style={sectionHighlight}>{ru ? 'Войти' : 'Sign in'}</Text></Pressable> : error ? <Pressable onPress={() => onNavigate('downloads')}><Text style={sectionHighlight}>{ru ? 'Открыть загрузки' : 'Open downloads'}</Text></Pressable> : null}</View> : null}
    <Modal visible={picker !== null} transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={() => setPicker(null)}>
      <View style={styles.pickerRoot}><Pressable style={styles.scrim} onPress={() => setPicker(null)} accessibilityLabel={ru ? 'Закрыть' : 'Close'} /><View style={styles.picker}>
        <View style={styles.pickerTitle}><Text style={styles.brand}>{picker === 'playlists' || picker === 'trackPlaylists' ? (ru ? 'Плейлисты' : 'Playlists') : picker === 'genres' ? (ru ? 'Жанры' : 'Styles') : (ru ? 'Коллекция' : 'Collection')}</Text><Pressable onPress={() => setPicker(null)} hitSlop={12}><X color={colors.text} size={20} /></Pressable></View>
        <ScrollView>{picker === 'trackPlaylists' ? <>{playlists.map(item => <Pressable key={item.id} style={styles.pickerItem} disabled={savingPlaylist} onPress={() => void toggleTrackPlaylist(item)}><Text style={[styles.pickerText, item.items.some(entry => entry.track.id === playlistTrackId) && playlistHighlight]}>{item.name}</Text><Text style={styles.trackYear}>{item.items.some(entry => entry.track.id === playlistTrackId) ? '✓' : '+'}</Text></Pressable>)}{!playlists.length && <Text style={styles.statusText}>{ru ? 'Создайте плейлист в полном плеере.' : 'Create a playlist in the full player.'}</Text>}</> : picker === 'playlists' ? <>{playlistLibrary?.playlists.map(item => <Pressable key={item.id} style={styles.pickerItem} onPress={() => { setPlaylistId(item.id); setPicker(null); }}><Text style={[styles.pickerText, item.id === activePlaylist?.id && sectionHighlight]}>{item.name}</Text><Text style={styles.trackYear}>{item.items.length}</Text></Pressable>)}<Pressable style={styles.pickerItem} onPress={() => { setPicker(null); playlistLibrary?.onManage(); }}><Text style={styles.pickerText}>{ru ? 'Управление плейлистами' : 'Manage playlists'}</Text></Pressable></> : picker === 'genres' ? [{ name: '', count: total }, ...genres].map(genre => <Pressable key={genre.name} style={styles.pickerItem} onPress={() => selectGenre(genre.name)}><Text style={[styles.pickerText, selectedStyle === genre.name && sectionHighlight]}>{genre.name || (ru ? 'Все' : 'All')}</Text><Text style={styles.trackYear}>{genre.count}</Text></Pressable>) : sections.map(({ key, label }) => <Pressable key={key} style={styles.pickerItem} onPress={() => { setPicker(null); onNavigate(key); }}><Text style={[styles.pickerText, key === sectionKey && { color: archiveSectionColor(key, colors.muted) }]}>{label}</Text></Pressable>)}</ScrollView>
      </View></View>
    </Modal>
  </View>;
}

const styles = adaptiveStyles(StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { position: 'absolute', top: 18, left: '3%', right: '3%', zIndex: 30, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.background },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.panelSoft, alignItems: 'center', justifyContent: 'center' }, avatarInitial: { fontSize: 17, color: colors.text },
  headerBody: { flex: 1, gap: 7 }, brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 }, brand: { color: colors.text, fontSize: 13, fontWeight: '700', letterSpacing: -0.35 }, language: { fontSize: 10, color: colors.muted },
  searchRow: { flexDirection: 'row', gap: 10, alignItems: 'center' }, search: { flex: 1, minWidth: 30, color: colors.text, padding: 0, paddingBottom: 4, fontSize: 13, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  modes: { flexDirection: 'row', gap: 7 }, mode: { paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: 'transparent' }, modeSelected: { borderBottomColor: colors.text }, modeText: { color: colors.muted, fontSize: 12, letterSpacing: -0.4 }, modeTextSelected: { color: colors.text },
  sections: { position: 'absolute', top: 94, left: '3%', zIndex: 20, gap: 4 }, section: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 21 }, sectionLabel: { fontSize: 14, color: colors.muted, fontWeight: '600', letterSpacing: -0.4 }, sectionActive: { color: colors.text },
  heading: { position: 'absolute', left: '6%', right: '6%', zIndex: 15, textAlign: 'center', fontSize: 13, lineHeight: 18, color: colors.text }, headingArtist: { fontWeight: '700' },
  genreColumn: { position: 'absolute', right: '3%', bottom: 0, overflow: 'hidden', width: '31%', zIndex: 20 }, genre: { alignItems: 'flex-end', height: 24, paddingVertical: 2 }, genreText: { color: colors.muted, fontWeight: '600', fontSize: 14, lineHeight: 20, includeFontPadding: false, letterSpacing: -0.6 }, count: { fontSize: 9, fontWeight: '500' }, blue: { color: colors.accent },
  context: { position: 'absolute', top: 91, left: '3%', right: '3%', zIndex: 25, flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.background, paddingBottom: 12 }, contextButton: { flexDirection: 'row', alignItems: 'center', gap: 5 }, contextText: { fontSize: 14, color: colors.text, fontWeight: '600' },
  sleeve: { position: 'absolute' }, coverButton: { flex: 1 }, cover: { width: '100%', height: '100%', borderRadius: 0 },
  archiveViewport: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 78, overflow: 'hidden' },
  archiveTopMask: { position: 'absolute', top: 0, left: 0, right: 0, height: 126, zIndex: 10, backgroundColor: colors.background },
  archiveChrome: { ...StyleSheet.absoluteFillObject, zIndex: 20 },
  sleeveLayer: { ...StyleSheet.absoluteFillObject },
  closeRelease: { position: 'absolute', top: 76, right: '3%', width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 45 },
  releasePanel: { position: 'absolute', left: '6%', right: '6%', bottom: 84, zIndex: 25 },
  canvasTrackLabels: { position: 'absolute', left: 0, top: 0, height: 48, flexDirection: 'row', alignItems: 'center', gap: 8 },
  canvasTrackButton: { flex: 1, height: 48, flexDirection: 'row', alignItems: 'center', gap: 8 },
  listViewport: { position: 'absolute', top: 126, left: '3%', right: '3%', bottom: 78 }, list: { paddingBottom: 24 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, gridTile: { width: '31.5%', aspectRatio: 1 }, gridCover: { width: '100%', height: '100%' },
  trackRow: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 64 }, trackCover: { width: 48, height: 48 }, trackLabels: { flex: 1, gap: 3 }, trackArtist: { fontSize: 13, color: colors.text, fontWeight: '600' }, trackTitle: { fontSize: 12, color: colors.muted }, trackYear: { fontSize: 12, color: colors.muted },
  status: { position: 'absolute', top: '42%', left: '10%', right: '10%', alignItems: 'center', gap: 14 }, statusText: { color: colors.muted, textAlign: 'center', fontSize: 13 },
  pickerRoot: { flex: 1, justifyContent: 'flex-end' }, scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0005' }, picker: { maxHeight: '65%', backgroundColor: colors.background, padding: 22, paddingBottom: 30, borderTopWidth: 1, borderTopColor: colors.border }, pickerTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16 }, pickerItem: { minHeight: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, pickerText: { fontSize: 17, color: colors.text },
}));
