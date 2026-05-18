import { useEffect, useState } from 'react';
import { FlatList, Image, Pressable, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { AnimatedLogo } from '../components/AnimatedLogo';
import { TrackDownloadButton } from '../components/TrackDownloadButton';
import { getCoverUrl, getPlaylists, reorderPlaylists, updatePlaylist } from '../lib/api';
import { colors, radius, spacing } from '../theme';
import { PlayerTrack, Playlist } from '../types';

type PlaylistsScreenProps = {
  onPlayTrack: (track: PlayerTrack, queue?: PlayerTrack[]) => void;
  onOpenProfile: () => void;
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

export function PlaylistsScreen({ onPlayTrack, onOpenProfile, avatarUrl }: PlaylistsScreenProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [query, setQuery] = useState('');
  const [lang, setLang] = useState<'ru' | 'en'>('en');
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [editingPlaylistName, setEditingPlaylistName] = useState('');
  const [draggedPlaylistId, setDraggedPlaylistId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function load() {
    setIsLoading(true);
    try {
      const nextPlaylists = await getPlaylists();
      setPlaylists(nextPlaylists);
      setSelectedPlaylistId((current) => current || nextPlaylists[0]?.id || '');
    } catch {
      setPlaylists([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const selectedPlaylist = playlists.find((playlist) => playlist.id === selectedPlaylistId) || playlists[0];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const tracks =
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
      }) || [];
  const queue = tracks.flatMap(({ playerTrack }) => (playerTrack ? [playerTrack] : []));

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
      setPlaylists((current) => current.map((playlist) => (playlist.id === updatedPlaylist.id ? updatedPlaylist : playlist)));
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
    setPlaylists(nextPlaylists);

    try {
      await reorderPlaylists(nextPlaylists.map((playlist) => playlist.id));
    } catch {
      setPlaylists(playlists);
    }
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

      <FlatList
        data={tracks}
        keyExtractor={({ item }) => item.track.id}
        refreshing={isLoading}
        onRefresh={load}
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
        renderItem={({ item, index }) => {
          const playerTrack = item.playerTrack;
          const release = item.item.track.release;

          if (!playerTrack || !release) {
            return null;
          }

          return (
            <Pressable style={styles.trackRow} onPress={() => onPlayTrack(playerTrack, queue)}>
              <Image source={{ uri: getCoverUrl(release) }} style={styles.cover} />
              <Text style={styles.number}>{index + 1}</Text>
              <View style={styles.trackText}>
                <Text numberOfLines={1} style={styles.artist}>
                  {playerTrack.artist}
                </Text>
                <Text numberOfLines={1} style={styles.trackTitle}>
                  {playerTrack.title}
                </Text>
              </View>
              <TrackDownloadButton track={playerTrack} />
              <Text style={styles.time}>{playerTrack.durationRaw || '-'}</Text>
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
    top: Math.max((StatusBar.currentHeight || 0) - 3, 0),
    zIndex: 10,
    paddingHorizontal: 12,
    paddingTop: 9,
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
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingTop: (StatusBar.currentHeight || 0) + 132,
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
    backgroundColor: colors.panel,
  },
  chipActive: {
    backgroundColor: 'rgba(181,120,255,0.14)',
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
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  renameText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
  },
  trackRow: {
    minHeight: 54,
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
  artist: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  trackTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
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
