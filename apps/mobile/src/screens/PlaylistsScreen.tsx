import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { FeedbackPressable as Pressable } from '../components/FeedbackPressable';
import { Image } from 'expo-image';
import { ArrowLeft, GripVertical, ListMusic } from 'lucide-react-native';
import DraggableFlatList from 'react-native-draggable-flatlist';
import { ShelfScreenHeader } from '../components/ShelfScreenHeader';
import { TrackDownloadButton } from '../components/TrackDownloadButton';
import { getCoverUrl, reorderPlaylist, reorderPlaylists, updatePlaylist } from '../lib/api';
import { getKeyColor } from '../lib/key-color';
import { ARCHIVE_SECTION_COLORS } from '../lib/archive-section-colors';
import { normalizeDurationLabel } from '../lib/time';
import { useDebouncedValue } from '../lib/use-debounced-value';
import { colors, radius, shelfStyles, type ThemeMode } from '../theme';
import { LanguageProps } from '../types';
import { PlayerTrack, Playlist } from '../types';

type PlaylistsScreenProps = LanguageProps & {
  activeTrackId: string | null;
  playlists: Playlist[];
  onPlaylistsChange: (playlists: Playlist[]) => void;
  onPlayTrack: (track: PlayerTrack, queue?: PlayerTrack[]) => void;
  onOpenProfile: () => void;
  onRefreshPlaylists: () => Promise<void>;
  showTrackMeta?: boolean;
  avatarUrl?: string | null;
  requiresSignIn?: boolean;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onHome: () => void;
  onBackToArchive?: () => void;
};

function getTrackArtist(track: Playlist['items'][number]['track']) {
  return track.artists?.length ? track.artists.join(', ') : track.release?.artist || '';
}

function toPlayerTrack(item: Playlist['items'][number]): PlayerTrack | null {
  const audioUrl = item.track.audioFiles.find((file) => file.storageUrl)?.storageUrl;
  if (!audioUrl || !item.track.release) {
    return null;
  }

  return {
    id: item.track.id,
    title: item.track.title,
    artist: getTrackArtist(item.track),
    audioUrl,
    coverUrl: getCoverUrl(item.track.release),
    releaseId: item.track.release.id,
    durationRaw: item.track.durationRaw,
    durationSec: item.track.durationSec,
    waveformData: item.track.waveformData,
  };
}

type PlaylistTrackRow = {
  item: Playlist['items'][number];
  playerTrack: PlayerTrack | null;
};

function getTrackOrderSignature(rows: PlaylistTrackRow[]) {
  return rows.map(({ item }) => item.track.id).join('|');
}

export function PlaylistsScreen({
  lang,
  onLanguageChange: setLang,
  activeTrackId,
  playlists,
  onPlaylistsChange,
  onPlayTrack,
  onOpenProfile,
  onRefreshPlaylists,
  showTrackMeta = true,
  avatarUrl,
  requiresSignIn = false,
  theme, onToggleTheme, onHome, onBackToArchive,
}: PlaylistsScreenProps) {
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [query, setQuery] = useState('');
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [editingPlaylistName, setEditingPlaylistName] = useState('');
  const [draggedPlaylistId, setDraggedPlaylistId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const savingRename = useRef(false);
  const trackOrderRequestRef = useRef(0);
  const trackOrderSaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const pendingTrackOrderSignatureRef = useRef<string | null>(null);
  const [dragPosition, setDragPosition] = useState<{ from: number; to: number } | null>(null);
  const playlistsRef = useRef(playlists);
  playlistsRef.current = playlists;
  const selectedPlaylistIdRef = useRef(selectedPlaylistId);
  selectedPlaylistIdRef.current = selectedPlaylistId;
  const debouncedQuery = useDebouncedValue(query);

  async function load() {
    setIsLoading(true);
    setError('');
    try {
      await onRefreshPlaylists();
    } catch {
      setError(lang === 'ru' ? 'Не удалось обновить плейлисты.' : 'Unable to refresh playlists.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    setSelectedPlaylistId((current) =>
      current && playlists.some((playlist) => playlist.id === current)
        ? current
        : playlists[0]?.id || '',
    );
  }, [playlists]);

  const selectedPlaylist = playlists.find((playlist) => playlist.id === selectedPlaylistId) || playlists[0];
  const normalizedQuery = debouncedQuery.trim().toLocaleLowerCase();
  const sourceTracks = useMemo<PlaylistTrackRow[]>(() => (
    selectedPlaylist?.items
      .map((item) => ({ item, playerTrack: toPlayerTrack(item) }))
      .filter(({ item }) => {
        if (!normalizedQuery) {
          return true;
        }

        return (
          getTrackArtist(item.track).toLocaleLowerCase().includes(normalizedQuery) ||
          item.track.title.toLocaleLowerCase().includes(normalizedQuery)
        );
      }) || []
  ), [normalizedQuery, selectedPlaylist]);
  const [tracks, setTracks] = useState<PlaylistTrackRow[]>(sourceTracks);

  useEffect(() => {
    const sourceSignature = getTrackOrderSignature(sourceTracks);
    setTracks((current) => {
      if (current.length === sourceTracks.length && current.every((row, index) => row.item === sourceTracks[index].item)) {
        return current;
      }
      if (
        pendingTrackOrderSignatureRef.current === sourceSignature &&
        getTrackOrderSignature(current) === sourceSignature
      ) {
        pendingTrackOrderSignatureRef.current = null;
        return current;
      }
      pendingTrackOrderSignatureRef.current = null;
      return sourceTracks;
    });
  }, [sourceTracks]);

  const queue = useMemo(
    () => tracks.flatMap(({ playerTrack }) => (playerTrack ? [playerTrack] : [])),
    [tracks],
  );

  function startRename(playlist: Playlist) {
    setEditingPlaylistId(playlist.id);
    setEditingPlaylistName(playlist.name);
  }

  async function saveRename() {
    if (!editingPlaylistId || savingRename.current) {
      return;
    }

    const nextName = editingPlaylistName.trim();
    if (!nextName) {
      setEditingPlaylistId(null);
      setEditingPlaylistName('');
      return;
    }

    try {
      savingRename.current = true;
      const updatedPlaylist = await updatePlaylist(editingPlaylistId, { name: nextName });
      onPlaylistsChange(playlists.map((playlist) => (playlist.id === updatedPlaylist.id ? updatedPlaylist : playlist)));
    } catch {
      setError(lang === 'ru' ? 'Название не сохранено. Проверьте соединение.' : 'Name not saved. Check your connection.');
    } finally {
      savingRename.current = false;
      setEditingPlaylistId(null);
      setEditingPlaylistName('');
    }
  }

  async function movePlaylist(activePlaylistId: string, overPlaylistId: string) {
    if (activePlaylistId === overPlaylistId) {
      return;
    }

    const fromIndex = playlists.findIndex((playlist) => playlist.id === activePlaylistId);
    const toIndex = playlists.findIndex((playlist) => playlist.id === overPlaylistId);

    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return;
    }

    const nextPlaylists = [...playlists];
    const [movedPlaylist] = nextPlaylists.splice(fromIndex, 1);
    nextPlaylists.splice(toIndex, 0, movedPlaylist);
    onPlaylistsChange(nextPlaylists);

    try {
      await reorderPlaylists(nextPlaylists.map((playlist) => playlist.id));
    } catch {
      onPlaylistsChange(playlists);
    }
  }

  function saveTrackOrder(nextTracks: PlaylistTrackRow[]) {
    if (!selectedPlaylist || normalizedQuery) return;

    const request = trackOrderRequestRef.current + 1;
    trackOrderRequestRef.current = request;
    const playlistId = selectedPlaylist.id;
    const trackIds = nextTracks.map(({ item }) => item.track.id);
    pendingTrackOrderSignatureRef.current = trackIds.join('|');
    setTracks(nextTracks);
    const previousPlaylist = selectedPlaylist;
    // Publish the optimistic order with the existing item objects. A successful
    // save only acknowledges this order; it must not replace every visible row.
    onPlaylistsChange(playlistsRef.current.map((playlist) => playlist.id === playlistId
      ? { ...playlist, items: nextTracks.map(({ item }) => item) }
      : playlist));

    trackOrderSaveChainRef.current = trackOrderSaveChainRef.current
      .catch(() => undefined)
      .then(async () => {
        await reorderPlaylist(playlistId, trackIds);
        if (request !== trackOrderRequestRef.current) return;
        pendingTrackOrderSignatureRef.current = null;
      })
      .catch(() => {
        if (request !== trackOrderRequestRef.current) return;
        pendingTrackOrderSignatureRef.current = null;
        onPlaylistsChange(playlistsRef.current.map((playlist) => playlist.id === playlistId ? previousPlaylist : playlist));
        if (selectedPlaylistIdRef.current === playlistId) setTracks(sourceTracks);
      });
  }

  return (
    <View style={styles.screen}>
      <ShelfScreenHeader lang={lang} onLanguageChange={setLang} avatarUrl={avatarUrl} theme={theme} onToggleTheme={onToggleTheme} onOpenProfile={onOpenProfile} onHome={onHome} query={query} onQueryChange={setQuery} />
      <View style={styles.context}>
        <Pressable onPress={onBackToArchive || onHome} accessibilityLabel={onBackToArchive ? (lang === 'ru' ? 'Вернуться к обложкам' : 'Back to covers') : (lang === 'ru' ? 'Вернуться в коллекцию' : 'Back to collection')} style={styles.contextButton}><ArrowLeft size={14} color={colors.muted} /><Text style={styles.contextBack}>{onBackToArchive ? (lang === 'ru' ? 'Обложки' : 'Covers') : (lang === 'ru' ? 'Коллекция' : 'Collection')}</Text></Pressable>
        <View style={styles.contextButton}><ListMusic size={14} color={ARCHIVE_SECTION_COLORS.playlists} /><Text style={styles.contextTitle}>{lang === 'ru' ? 'Плейлисты' : 'Playlists'} <Text style={styles.count}>{playlists.length}</Text></Text></View>
      </View>

      <DraggableFlatList
        data={tracks}
        keyExtractor={({ item }) => item.track.id}
        refreshing={isLoading}
        onRefresh={load}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        activationDistance={8}
        dragItemOverflow
        animationConfig={{ damping: 28, stiffness: 220, mass: 0.7, overshootClamping: true }}
        onDragBegin={(from) => setDragPosition({ from, to: from })}
        onPlaceholderIndexChange={(to) => setDragPosition((current) => current ? { ...current, to } : null)}
        onDragEnd={({ data, from, to }) => {
          setDragPosition(null);
          if (from !== to) void saveTrackOrder(data);
        }}
        style={styles.trackList}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            {error ? <Text style={styles.empty}>{error}</Text> : null}
            <View style={styles.playlistChips}>
            {playlists.map((playlist) => {
              const active = playlist.id === selectedPlaylist?.id;
              const editing = editingPlaylistId === playlist.id;

              return (
                <Pressable
                  key={playlist.id}
                  style={[styles.chip, active && styles.chipActive, draggedPlaylistId === playlist.id && styles.chipDragging]}
                  onPress={() => {
                    if (draggedPlaylistId && draggedPlaylistId !== playlist.id) {
                      void movePlaylist(draggedPlaylistId, playlist.id);
                      setDraggedPlaylistId(null);
                      return;
                    }

                    setSelectedPlaylistId(playlist.id);
                  }}
                  onLongPress={() => setDraggedPlaylistId(playlist.id)}
                >
                  {editing ? (
                    <TextInput
                      autoFocus
                      value={editingPlaylistName}
                      onChangeText={setEditingPlaylistName}
                      onBlur={() => void saveRename()}
                      onSubmitEditing={() => void saveRename()}
                      style={[styles.chipInput, active && styles.chipTextActive]}
                    />
                  ) : (
                    <>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{playlist.name}</Text>
                      {active ? (
                        <Pressable
                          style={styles.renameButton}
                          onPress={(event) => {
                            event.stopPropagation();
                            startRename(playlist);
                          }}
                        >
                          <Text style={styles.renameText}>✎</Text>
                        </Pressable>
                      ) : null}
                    </>
                  )}
                </Pressable>
              );
            })}
            </View>
          </View>
        }
        renderItem={({ item, getIndex, drag, isActive: isDragging }) => {
          const index = getIndex() ?? 0;
          let displayIndex = index;
          if (dragPosition) {
            const { from, to } = dragPosition;
            if (index === from) displayIndex = to;
            else if (from < to && index > from && index <= to) displayIndex = index - 1;
            else if (from > to && index >= to && index < from) displayIndex = index + 1;
          }
          const playerTrack = item.playerTrack;
          const release = item.item.track.release;
          const isActive = playerTrack?.id === activeTrackId;

          if (!release) {
            return null;
          }

          return (
            <Pressable
              style={styles.trackRow}
              disabled={isDragging}
              onPress={() => { if (playerTrack) onPlayTrack(playerTrack, queue); }}
              onLongPress={normalizedQuery ? undefined : drag}
              delayLongPress={260}
            >
              <Image
                source={{ uri: getCoverUrl(release) }}
                style={styles.cover}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={item.item.track.id}
                transition={0}
              />
              <Text style={styles.number}>{displayIndex + 1}</Text>
              <View style={styles.trackText}>
                <Text numberOfLines={1} style={[styles.artist, isActive && styles.trackActiveText]}>
                  {getTrackArtist(item.item.track)}
                </Text>
                <Text numberOfLines={1} style={[styles.trackTitle, isActive && styles.trackActiveText]}>
                  {item.item.track.title}
                </Text>
              </View>
              {showTrackMeta ? (
                <View style={styles.metaPills}>
                  {typeof item.item.track.bpm === 'number' ? (
                    <Text style={[styles.metaPill, isActive && styles.metaPillActive]}>
                      {Math.round(item.item.track.bpm)} BPM
                    </Text>
                  ) : null}
                  {item.item.track.key ? (
                    <Text
                      style={[
                        styles.metaPill,
                        isActive && styles.metaPillActive,
                        { color: getKeyColor(item.item.track.key) },
                      ]}
                    >
                      {item.item.track.key}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {playerTrack ? <TrackDownloadButton track={playerTrack} /> : null}
              <Text style={styles.time}>{normalizeDurationLabel(item.item.track.durationRaw, item.item.track.durationSec, '-')}</Text>
              <GripVertical size={17} color={colors.muted} strokeWidth={2.2} />
            </Pressable>
          );
        }}
        ListEmptyComponent={isLoading ? null : <Pressable onPress={requiresSignIn ? onOpenProfile : undefined}><Text style={styles.empty}>{requiresSignIn ? (lang === 'ru' ? 'Войдите, чтобы увидеть свои плейлисты.' : 'Sign in to see your playlists.') : !playlists.length ? (lang === 'ru' ? 'Плейлистов пока нет. Создайте плейлист в полном плеере.' : 'No playlists yet. Create one in the full player.') : normalizedQuery ? (lang === 'ru' ? 'Ничего не найдено.' : 'No matching tracks.') : (lang === 'ru' ? 'В плейлисте пока нет треков.' : 'This playlist has no tracks yet.')}</Text></Pressable>}
      />
    </View>
  );
}

const styles = shelfStyles(StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  context: { marginHorizontal: '3%', marginTop: 22, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  contextButton: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 28 },
  contextBack: { color: colors.muted, fontSize: 13 },
  contextTitle: { color: colors.text, fontSize: 14, fontWeight: '600', letterSpacing: -.4 },
  count: { fontSize: 10, color: colors.muted },
  trackList: { flex: 1 },
  list: {
    // Keep spacing inside measured cells so drag offsets include it.
    paddingHorizontal: '3%',
    paddingTop: 0,
    paddingBottom: 84,
  },
  playlistChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingBottom: 14,
  },
  chip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    justifyContent: 'flex-start',
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
    backgroundColor: 'transparent',
  },
  chipActive: {
    backgroundColor: 'transparent',
    borderBottomColor: colors.text,
  },
  chipDragging: {
    opacity: 0.58,
    transform: [{ scale: 0.97 }],
  },
  chipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
  },
  chipTextActive: {
    color: ARCHIVE_SECTION_COLORS.playlists,
  },
  chipInput: {
    minWidth: 120,
    maxWidth: 220,
    color: colors.text,
    fontSize: 13,
    fontWeight: '500',
    padding: 0,
  },
  renameButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: 'transparent',
  },
  renameText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
  },
  trackRow: {
    minHeight: 54,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cover: {
    width: 40,
    height: 40,
    borderRadius: 0,
    backgroundColor: colors.panelSoft,
  },
  number: {
    width: 18,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '400',
    textAlign: 'center',
  },
  trackText: {
    flex: 1,
  },
  metaPills: {
    alignItems: 'flex-end',
    gap: 3,
    minWidth: 44,
  },
  metaPill: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '600',
  },
  metaPillActive: {
    color: ARCHIVE_SECTION_COLORS.playlists,
  },
  artist: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '400',
  },
  trackTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '400',
  },
  trackRowDragging: {
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  trackActiveText: {
    color: ARCHIVE_SECTION_COLORS.playlists,
  },
  time: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '400',
  },
  empty: {
    color: colors.muted,
    fontWeight: '700',
  },
}));
