import { useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { Heart, ListMusic, Search } from 'lucide-react-native';
import { AnimatedLogo } from '../components/AnimatedLogo';
import { TrackDownloadButton } from '../components/TrackDownloadButton';
import {
  addTrackToPlaylist,
  createPlaylist,
  getCoverUrl,
  getFavorites,
  getLibraryFeedFiltered,
  getPlaylists,
  getPlayableReleaseStyles,
  removeTrackFromPlaylist,
  toggleFavoriteTrack,
} from '../lib/api';
import { colors, radius, spacing } from '../theme';
import { PlayerTrack, Playlist, Release } from '../types';

type LibraryScreenProps = {
  activeTrackId: string | null;
  onPlayTrack: (track: PlayerTrack, queue?: PlayerTrack[]) => void;
  onOpenProfile: () => void;
  avatarUrl?: string | null;
};

function getTrackArtist(release: Release, trackArtists?: string[]) {
  return trackArtists?.length ? trackArtists.join(', ') : release.artist;
}

type PlayableTrackRow = {
  track: Release['tracks'][number];
  playerTrack: PlayerTrack;
};

function buildPlayableTracks(release: Release) {
  const rows: PlayableTrackRow[] = [];

  for (const track of release.tracks) {
    const audioUrl = track.audioFiles.find((file) => file.storageUrl)?.storageUrl;
    if (!audioUrl) {
      continue;
    }

    rows.push({
      track,
      playerTrack: {
        id: track.id,
        title: track.title,
        artist: getTrackArtist(release, track.artists),
        audioUrl,
        coverUrl: getCoverUrl(release),
        durationRaw: track.durationRaw,
        durationSec: track.durationSec,
        waveformData: track.waveformData,
      },
    });
  }

  return rows;
}

export function LibraryScreen({ activeTrackId, onPlayTrack, onOpenProfile, avatarUrl }: LibraryScreenProps) {
  const [releases, setReleases] = useState<Release[]>([]);
  const [stylesList, setStylesList] = useState<Array<{ name: string; count: number }>>([]);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [isStylePickerOpen, setIsStylePickerOpen] = useState(false);
  const [lang, setLang] = useState<'ru' | 'en'>('en');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistMenuTrackId, setPlaylistMenuTrackId] = useState<string | null>(null);
  const [playlistName, setPlaylistName] = useState('');
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const visibleReleases = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    return releases
      .filter((release) => buildPlayableTracks(release).length > 0)
      .filter((release) => {
        if (!normalizedQuery) {
          return true;
        }

        return (
          release.title.toLocaleLowerCase().includes(normalizedQuery) ||
          release.artist.toLocaleLowerCase().includes(normalizedQuery) ||
          release.tracks.some((track) => track.title.toLocaleLowerCase().includes(normalizedQuery))
        );
      });
  }, [query, releases]);

  const visibleQueue = useMemo(
    () => visibleReleases.flatMap((release) => buildPlayableTracks(release).map((row) => row.playerTrack)),
    [visibleReleases],
  );

  async function load() {
    setIsLoading(true);
    setError('');

    try {
      const [result, nextStyles] = await Promise.all([
        getLibraryFeedFiltered(40, 0, { styles: selectedStyles }),
        getPlayableReleaseStyles(),
      ]);
      setReleases(result.releases);
      setStylesList(nextStyles);
      void loadPersonalActions();
    } catch {
      setError('Не удалось загрузить библиотеку.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [selectedStyles]);

  function toggleStyle(style: string) {
    setSelectedStyles((current) =>
      current.includes(style) ? current.filter((item) => item !== style) : [...current, style],
    );
  }

  async function loadPersonalActions() {
    const [nextFavorites, nextPlaylists] = await Promise.allSettled([getFavorites(), getPlaylists()]);

    if (nextFavorites.status === 'fulfilled') {
      setFavoriteIds(new Set(nextFavorites.value));
    }

    if (nextPlaylists.status === 'fulfilled') {
      setPlaylists(nextPlaylists.value);
    }
  }

  async function handleFavorite(trackId: string) {
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });

    try {
      const result = await toggleFavoriteTrack(trackId);
      setFavoriteIds((current) => {
        const next = new Set(current);
        if (result.active) {
          next.add(trackId);
        } else {
          next.delete(trackId);
        }
        return next;
      });
    } catch {
      void loadPersonalActions();
    }
  }

  async function handlePlaylistToggle(playlist: Playlist, trackId: string) {
    const alreadyAdded = playlist.items.some((item) => item.track.id === trackId);

    try {
      const updatedPlaylist = alreadyAdded
        ? await removeTrackFromPlaylist(playlist.id, trackId)
        : await addTrackToPlaylist(playlist.id, trackId);

      setPlaylists((current) => current.map((item) => (item.id === updatedPlaylist.id ? updatedPlaylist : item)));
    } catch {
      void loadPersonalActions();
    }
  }

  async function handleCreatePlaylist() {
    const trackId = playlistMenuTrackId;
    const trimmedName = playlistName.trim();

    if (!trackId || !trimmedName || isCreatingPlaylist) {
      return;
    }

    setIsCreatingPlaylist(true);

    try {
      const createdPlaylist = await createPlaylist({
        name: trimmedName,
        trackIds: [trackId],
      });
      setPlaylists((current) => [createdPlaylist, ...current]);
      setPlaylistName('');
    } catch {
      void loadPersonalActions();
    } finally {
      setIsCreatingPlaylist(false);
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
        data={visibleReleases}
        keyExtractor={(item) => item.id}
        refreshing={isLoading}
        onRefresh={load}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.filtersBlock}>
            <View style={styles.selectedStyleRow}>
              <Pressable style={styles.filterButton} onPress={() => setIsStylePickerOpen((current) => !current)}>
                <Text style={styles.filterButtonText}>{lang === 'ru' ? 'Все стили' : 'All styles'}</Text>
              </Pressable>
              {selectedStyles.map((style) => (
                <Pressable
                  key={style}
                  style={[styles.filterButton, styles.filterButtonActive]}
                  onPress={() => toggleStyle(style)}
                >
                  <Text style={[styles.filterButtonText, styles.filterButtonTextActive]}>{style}</Text>
                </Pressable>
              ))}
            </View>

            {isStylePickerOpen ? (
              <View style={styles.stylePicker}>
                <Pressable
                  style={[styles.styleChip, selectedStyles.length === 0 && styles.styleChipActive]}
                  onPress={() => {
                    setSelectedStyles([]);
                    setIsStylePickerOpen(false);
                  }}
                >
                  <Text style={[styles.styleChipText, selectedStyles.length === 0 && styles.styleChipTextActive]}>
                    {lang === 'ru' ? 'Все стили' : 'All styles'}
                  </Text>
                </Pressable>
                {stylesList.map((item) => {
                  const active = selectedStyles.includes(item.name);

                  return (
                    <Pressable
                      key={item.name}
                      style={[styles.styleChip, active && styles.styleChipActive]}
                      onPress={() => toggleStyle(item.name)}
                    >
                      <Text style={[styles.styleChipText, active && styles.styleChipTextActive]}>{item.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        }
        renderItem={({ item }) => {
          const trackRows = buildPlayableTracks(item);

          return (
            <View style={styles.releaseCard}>
              <View style={styles.releaseHeader}>
                <Image source={{ uri: getCoverUrl(item) }} style={styles.releaseCover} />
                <View style={styles.releaseMeta}>
                  <Text numberOfLines={1} style={styles.releaseArtist}>
                    {item.artist}
                  </Text>
                  <Text numberOfLines={2} style={styles.releaseTitle}>
                    {item.title}
                    {item.year ? ` • ${item.year}` : ''}
                  </Text>
                </View>
              </View>

              <View style={styles.tracks}>
                {trackRows.map((row) => {
                  const isFavorite = favoriteIds.has(row.track.id);
                  const isActive = activeTrackId === row.track.id;
                  const isInPlaylist = playlists.some((playlist) =>
                    playlist.items.some((item) => item.track.id === row.track.id),
                  );

                  return (
                    <View key={row.track.id} style={styles.trackRow}>
                      <Pressable
                        style={styles.trackPlayArea}
                        onPress={() => onPlayTrack(row.playerTrack, visibleQueue)}
                      >
                        <Text style={styles.position}>{row.track.position || ''}</Text>
                        <Text numberOfLines={1} style={[styles.trackName, isActive && styles.trackNameActive]}>
                          <Text style={[styles.trackArtist, isActive && styles.trackNameActive]}>
                            {row.playerTrack.artist}
                          </Text>
                          <Text> - {row.playerTrack.title}</Text>
                        </Text>
                      </Pressable>

                      <View style={styles.trackActions}>
                        <TrackDownloadButton track={row.playerTrack} />
                        <Pressable style={styles.actionButton} onPress={() => void handleFavorite(row.track.id)}>
                          <Heart
                            size={17}
                            strokeWidth={2.3}
                            color={isFavorite ? colors.accent : colors.muted}
                            fill={isFavorite ? colors.accent : 'none'}
                          />
                        </Pressable>
                        <Pressable style={styles.actionButton} onPress={() => setPlaylistMenuTrackId(row.track.id)}>
                          <ListMusic
                            size={17}
                            strokeWidth={2.3}
                            color={isInPlaylist ? colors.accent : colors.muted}
                          />
                        </Pressable>
                        <Text style={styles.time}>{row.track.durationRaw || '-'}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        }}
      />

      <Modal
        visible={Boolean(playlistMenuTrackId)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPlaylistMenuTrackId(null);
          setPlaylistName('');
        }}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            setPlaylistMenuTrackId(null);
            setPlaylistName('');
          }}
        >
          <Pressable style={styles.playlistMenu}>
            <Text style={styles.playlistMenuTitle}>{lang === 'ru' ? 'Плейлисты' : 'Playlists'}</Text>
            <View style={styles.playlistCreateRow}>
              <TextInput
                value={playlistName}
                onChangeText={setPlaylistName}
                placeholder={lang === 'ru' ? 'РќРѕРІС‹Р№ РїР»РµР№Р»РёСЃС‚' : 'New playlist'}
                placeholderTextColor={colors.muted}
                style={styles.playlistCreateInput}
                autoCapitalize="sentences"
                returnKeyType="done"
                onSubmitEditing={() => void handleCreatePlaylist()}
              />
              <Pressable
                style={[styles.playlistCreateButton, (!playlistName.trim() || isCreatingPlaylist) && styles.disabledButton]}
                disabled={!playlistName.trim() || isCreatingPlaylist}
                onPress={() => void handleCreatePlaylist()}
              >
                <Text style={styles.playlistCreateButtonText}>+</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.playlistMenuScroll}>
              {playlists.length ? (
                playlists.map((playlist) => {
                  const trackId = playlistMenuTrackId || '';
                  const active = playlist.items.some((item) => item.track.id === trackId);

                  return (
                    <Pressable
                      key={playlist.id}
                      style={[styles.playlistMenuItem, active && styles.playlistMenuItemActive]}
                      onPress={() => void handlePlaylistToggle(playlist, trackId)}
                    >
                      <Text style={[styles.playlistMenuText, active && styles.playlistMenuTextActive]}>
                        {playlist.name}
                      </Text>
                      <Text style={styles.playlistMenuCount}>{playlist.items.length}</Text>
                    </Pressable>
                  );
                })
              ) : (
                <Text style={styles.playlistMenuEmpty}>
                  {lang === 'ru' ? 'Плейлистов пока нет' : 'No playlists yet'}
                </Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
  error: {
    color: colors.accentStrong,
    fontWeight: '700',
  },
  list: {
    gap: 22,
    paddingHorizontal: spacing.md,
    paddingTop: (StatusBar.currentHeight || 0) + 132,
    paddingBottom: 160,
  },
  filtersBlock: {
    gap: 12,
    paddingBottom: 4,
  },
  selectedStyleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  filterButton: {
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
  },
  filterButtonActive: {
    backgroundColor: 'rgba(181,120,255,0.14)',
  },
  filterButtonText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: colors.accent,
  },
  stylePicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 10,
    borderRadius: 18,
    backgroundColor: colors.panel,
  },
  styleChip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.panelSoft,
  },
  styleChipActive: {
    backgroundColor: 'rgba(181,120,255,0.16)',
  },
  styleChipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
  },
  styleChipTextActive: {
    color: colors.accent,
  },
  releaseCard: {
    gap: 12,
  },
  releaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  releaseCover: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
    backgroundColor: colors.panelSoft,
  },
  releaseMeta: {
    flex: 1,
    gap: 4,
  },
  releaseArtist: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  releaseTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  tracks: {
    gap: 2,
  },
  trackRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trackPlayArea: {
    flex: 1,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  position: {
    width: 30,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  trackName: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  trackNameActive: {
    color: colors.accent,
  },
  trackArtist: {
    color: colors.muted,
    fontWeight: '700',
  },
  trackActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingLeft: 8,
  },
  actionButton: {
    width: 27,
    height: 27,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  time: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    minWidth: 36,
    textAlign: 'right',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  playlistMenu: {
    maxHeight: 320,
    gap: 10,
    padding: 14,
    borderRadius: 22,
    backgroundColor: colors.panel,
  },
  playlistMenuTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  playlistCreateRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: colors.panelSoft,
  },
  playlistCreateInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    paddingVertical: 8,
  },
  playlistCreateButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  playlistCreateButtonText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 24,
  },
  disabledButton: {
    opacity: 0.45,
  },
  playlistMenuScroll: {
    maxHeight: 250,
  },
  playlistMenuItem: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  playlistMenuItemActive: {
    backgroundColor: 'rgba(181,120,255,0.14)',
  },
  playlistMenuText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  playlistMenuTextActive: {
    color: colors.accent,
  },
  playlistMenuCount: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  playlistMenuEmpty: {
    paddingVertical: 16,
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
});
