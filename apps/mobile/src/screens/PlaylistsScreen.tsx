import { useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { FeedbackPressable as Pressable } from '../components/FeedbackPressable';
import { Image } from 'expo-image';
import { GripVertical, Search } from 'lucide-react-native';
import DraggableFlatList from 'react-native-draggable-flatlist';
import { AnimatedLogo } from '../components/AnimatedLogo';
import { TrackDownloadButton } from '../components/TrackDownloadButton';
import { getCoverUrl, reorderPlaylist, reorderPlaylists, updatePlaylist } from '../lib/api';
import { getKeyColor } from '../lib/key-color';
import { normalizeDurationLabel } from '../lib/time';
import { useDebouncedValue } from '../lib/use-debounced-value';
import { colors, radius, spacing } from '../theme';
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
}: PlaylistsScreenProps) {
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [query, setQuery] = useState('');
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [editingPlaylistName, setEditingPlaylistName] = useState('');
  const [draggedPlaylistId, setDraggedPlaylistId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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
    try {
      await onRefreshPlaylists();
    } catch {
      // Keep the current playlists visible if refresh fails.
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
      .filter(({ playerTrack }) => {
        if (!normalizedQuery || !playerTrack) {
          return true;
        }

        return (
          playerTrack.artist.toLocaleLowerCase().includes(normalizedQuery) ||
          playerTrack.title.toLocaleLowerCase().includes(normalizedQuery)
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
    if (!editingPlaylistId) {
      return;
    }

    const nextName = editingPlaylistName.trim();
    if (!nextName) {
      setEditingPlaylistId(null);
      setEditingPlaylistName('');
      return;
    }

    try {
      const updatedPlaylist = await updatePlaylist(editingPlaylistId, { name: nextName });
      onPlaylistsChange(playlists.map((playlist) => (playlist.id === updatedPlaylist.id ? updatedPlaylist : playlist)));
    } finally {
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
      <View style={styles.headerShell}>
        <View style={styles.headerTop}>
          <AnimatedLogo lang={lang} />
          <View style={styles.headerRight}>
            <View style={styles.language}>
              <Pressable onPress={() => setLang('ru')}>
                <Text style={[styles.languageText, lang === 'ru' && styles.languageActive]}>
                  {lang === 'ru' ? 'РУ' : 'RU'}
                </Text>
              </Pressable>
              <Pressable onPress={() => setLang('en')}>
                <Text style={[styles.languageText, lang === 'en' && styles.languageActive]}>
                  {lang === 'ru' ? 'АНГ' : 'ENG'}
                </Text>
              </Pressable>
            </View>
            <Pressable style={styles.avatar} onPress={onOpenProfile}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>M</Text>
              )}
            </Pressable>
          </View>
        </View>
        <View style={styles.search}>
          <Search size={18} color={colors.muted} strokeWidth={2.2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={lang === 'ru' ? 'Поиск треков...' : 'Search tracks...'}
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
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
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
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

          if (!playerTrack || !release) {
            return null;
          }

          return (
            <Pressable
              style={styles.trackRow}
              disabled={isDragging}
              onPress={() => onPlayTrack(playerTrack, queue)}
              onLongPress={normalizedQuery ? undefined : drag}
              delayLongPress={260}
            >
              <Image
                source={{ uri: getCoverUrl(release) }}
                style={styles.cover}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={playerTrack.id}
                transition={0}
              />
              <Text style={styles.number}>{displayIndex + 1}</Text>
              <View style={styles.trackText}>
                <Text numberOfLines={1} style={[styles.artist, isActive && styles.trackActiveText]}>
                  {playerTrack.artist}
                </Text>
                <Text numberOfLines={1} style={[styles.trackTitle, isActive && styles.trackActiveText]}>
                  {playerTrack.title}
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
              <TrackDownloadButton track={playerTrack} />
              <Text style={styles.time}>{normalizeDurationLabel(playerTrack.durationRaw, playerTrack.durationSec, '-')}</Text>
              <GripVertical size={17} color={colors.muted} strokeWidth={2.2} />
            </Pressable>
          );
        }}
        ListEmptyComponent={isLoading ? null : <Text style={styles.empty}>Плейлистов пока нет.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerShell: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    top: -6,
    zIndex: 10,
    paddingHorizontal: 12,
    paddingTop: (StatusBar.currentHeight || 0) + 10,
    paddingBottom: 9,
    gap: 9,
    borderRadius: 24,
    backgroundColor: 'rgba(24,24,24,0.96)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.55,
    shadowRadius: 30,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  language: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  languageText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
  },
  languageActive: {
    color: colors.text,
  },
  avatar: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.panelSoft,
  },
  avatarText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: radius.pill,
  },
  search: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
    borderRadius: 22,
    backgroundColor: colors.panelSoft,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    padding: 0,
  },
  list: {
    // Keep spacing inside measured cells so drag offsets include it.
    paddingHorizontal: spacing.md,
    paddingTop: (StatusBar.currentHeight || 0) + 158,
    paddingBottom: 160,
  },
  playlistChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 14,
  },
  chip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: 'transparent',
  },
  chipActive: {
    backgroundColor: 'transparent',
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
    color: colors.accent,
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
    minHeight: 62,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  cover: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.panelSoft,
  },
  number: {
    width: 22,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
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
    color: colors.accent,
  },
  artist: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  trackTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
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
    color: colors.accent,
  },
  time: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  empty: {
    color: colors.muted,
    fontWeight: '700',
  },
});
