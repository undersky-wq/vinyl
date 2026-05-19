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
  removeTrackFromPlaylist,
  toggleFavoriteTrack,
} from '../lib/api';
import { colors, radius, spacing } from '../theme';
import { PlayerTrack, Playlist, Release } from '../types';

const DEFAULT_PAGE_SIZE = 40;
const PAGE_SIZE_OPTIONS = [20, 40, 60];
const VISIBLE_PAGE_WINDOW_SIZE = 5;

type LibraryScreenProps = {
  activeTrackId: string | null;
  onPlayTrack: (track: PlayerTrack, queue?: PlayerTrack[], queuePreview?: PlayerTrack[]) => void;
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
        releaseId: release.id,
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
  const [artistsList] = useState<string[]>([]);
  const [keysList, setKeysList] = useState<string[]>([]);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [selectedArtist, setSelectedArtist] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [openFilter, setOpenFilter] = useState<'style' | 'artist' | 'key' | null>(null);
  const [isStylesExpanded, setIsStylesExpanded] = useState(false);
  const [isKeysExpanded, setIsKeysExpanded] = useState(false);
  const [isStylePickerOpen, setIsStylePickerOpen] = useState(false);
  const [lang, setLang] = useState<'ru' | 'en'>('en');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistMenuTrackId, setPlaylistMenuTrackId] = useState<string | null>(null);
  const [playlistName, setPlaylistName] = useState('');
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalReleases, setTotalReleases] = useState(0);
  const [selectedPageSize, setSelectedPageSize] = useState(DEFAULT_PAGE_SIZE);

  const visibleReleases = useMemo(() => {
    return releases
      .filter((release) => buildPlayableTracks(release).length > 0);
  }, [releases]);
  const visiblePageQueue = useMemo(
    () => visibleReleases.flatMap((release) => buildPlayableTracks(release).map((row) => row.playerTrack)),
    [visibleReleases],
  );
  const visibleStyles = isStylesExpanded
    ? stylesList
    : selectedStyles.map((name) => ({ name, count: 0 }));
  const visibleKeys = isKeysExpanded ? keysList : selectedKeys;

  async function load(page = currentPage, pageSize = selectedPageSize) {
    setIsLoading(true);
    setError('');

    try {
      const nextPage = Math.max(1, page);
      const result = await getLibraryFeedFiltered(pageSize, (nextPage - 1) * pageSize, {
        styles: selectedStyles,
        key: selectedKeys,
        search: query.trim(),
      });
      setReleases(result.releases);
      setTotalReleases(result.total);
      setCurrentPage(nextPage);
      setSelectedPageSize(pageSize);
      setStylesList((result.options?.styles || []).map((name) => ({ name, count: 0 })));
      setKeysList(result.options?.keys || []);
      void loadPersonalActions();
    } catch {
      setError('Не удалось загрузить библиотеку.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
  }, [query, selectedKeys.join('|'), selectedStyles.join('|')]);

  function toggleStyle(style: string) {
    setSelectedStyles((current) =>
      current.includes(style) ? current.filter((item) => item !== style) : [...current, style],
    );
  }

  function toggleKey(key: string) {
    setSelectedKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
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

  async function loadFullFilteredQueue() {
    const pageSize = 60;
    let offset = 0;
    const nextReleases: Release[] = [];

    while (true) {
      const result = await getLibraryFeedFiltered(pageSize, offset, {
        styles: selectedStyles,
        key: selectedKeys,
        search: query.trim(),
      });
      nextReleases.push(...result.releases);

      if (!result.hasMore || result.releases.length === 0) {
        break;
      }

      offset += pageSize;
    }

    return nextReleases.flatMap((release) => buildPlayableTracks(release).map((row) => row.playerTrack));
  }

  function playFromLibrary(row: PlayableTrackRow, releaseQueue: PlayerTrack[]) {
    const immediateQueue = visiblePageQueue.some((track) => track.id === row.playerTrack.id)
      ? visiblePageQueue
      : releaseQueue;

    onPlayTrack(row.playerTrack, immediateQueue, releaseQueue);

    void loadFullFilteredQueue().catch(() => {
      // Playback already started from the visible page queue; keep it uninterrupted.
    });
  }

  const totalPages = Math.max(1, Math.ceil(totalReleases / selectedPageSize));
  const firstVisiblePage = Math.min(
    Math.max(1, currentPage - Math.floor(VISIBLE_PAGE_WINDOW_SIZE / 2)),
    Math.max(1, totalPages - VISIBLE_PAGE_WINDOW_SIZE + 1),
  );
  const visiblePageNumbers = Array.from(
    { length: Math.min(VISIBLE_PAGE_WINDOW_SIZE, totalPages) },
    (_, index) => firstVisiblePage + index,
  );

  function renderPagination(position: 'top' | 'bottom') {
    if (totalReleases <= selectedPageSize && position === 'top') {
      return null;
    }

    return (
      <View style={[styles.pagination, position === 'bottom' && styles.paginationBottom]}>
        {position === 'bottom' ? (
          <View style={styles.pageSizePicker}>
            <Text style={styles.pageSizeLabel}>Per page</Text>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <Pressable
                key={option}
                style={[styles.pageSizeButton, option === selectedPageSize && styles.pageButtonActive]}
                disabled={isLoading || option === selectedPageSize}
                onPress={() => void load(1, option)}
              >
                <Text style={[styles.pageButtonText, option === selectedPageSize && styles.pageButtonTextActive]}>
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={styles.pageButtons}>
          <Pressable
            style={[styles.pageButton, (isLoading || currentPage <= 1) && styles.pageButtonDisabled]}
            disabled={isLoading || currentPage <= 1}
            onPress={() => void load(Math.max(1, currentPage - 1))}
          >
            <Text style={styles.pageButtonText}>{'<'}</Text>
          </Pressable>
          {visiblePageNumbers.map((page) => {
            const active = page === currentPage;

            return (
              <Pressable
                key={page}
                style={[styles.pageButton, active && styles.pageButtonActive]}
                disabled={isLoading || active}
                onPress={() => void load(page)}
              >
                <Text style={[styles.pageButtonText, active && styles.pageButtonTextActive]}>{page}</Text>
              </Pressable>
            );
          })}
          <Pressable
            style={[styles.pageButton, (isLoading || currentPage >= totalPages) && styles.pageButtonDisabled]}
            disabled={isLoading || currentPage >= totalPages}
            onPress={() => void load(Math.min(totalPages, currentPage + 1))}
          >
            <Text style={styles.pageButtonText}>{'>'}</Text>
          </Pressable>
        </View>
      </View>
    );
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
        initialNumToRender={6}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={70}
        windowSize={5}
        removeClippedSubviews
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.filtersBlock}>
            <View style={[styles.chips, isStylesExpanded && styles.chipsExpanded]}>
              <Pressable
                style={[styles.chip, selectedStyles.length === 0 && styles.chipActive]}
                onPress={() => setSelectedStyles([])}
              >
                <Text style={[styles.chipText, selectedStyles.length === 0 && styles.chipTextActive]}>
                  {lang === 'ru' ? 'Все стили' : 'All styles'}
                </Text>
              </Pressable>

              {visibleStyles.map((item) => {
                const active = selectedStyles.includes(item.name);

                return (
                  <Pressable
                    key={item.name}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => toggleStyle(item.name)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.name}</Text>
                  </Pressable>
                );
              })}

              {stylesList.length ? (
                <Pressable style={styles.chip} onPress={() => setIsStylesExpanded((current) => !current)}>
                  <Text style={styles.chipText}>...</Text>
                </Pressable>
              ) : null}
            </View>

            {keysList.length ? (
              <View style={[styles.chips, isKeysExpanded && styles.chipsExpanded]}>
                <Pressable
                  style={[styles.chip, selectedKeys.length === 0 && styles.chipActive]}
                  onPress={() => setSelectedKeys([])}
                >
                  <Text style={[styles.chipText, selectedKeys.length === 0 && styles.chipTextActive]}>
                    {lang === 'ru' ? 'Все ключи' : 'All keys'}
                  </Text>
                </Pressable>

                {visibleKeys.map((trackKey) => {
                  const active = selectedKeys.includes(trackKey);

                  return (
                    <Pressable
                      key={trackKey}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => toggleKey(trackKey)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{trackKey}</Text>
                    </Pressable>
                  );
                })}

                <Pressable style={styles.chip} onPress={() => setIsKeysExpanded((current) => !current)}>
                  <Text style={styles.chipText}>...</Text>
                </Pressable>
              </View>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {renderPagination('top')}
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
                    {item.year ? ` \u2022 ${item.year}` : ''}
                  </Text>
                </View>
              </View>

              <View style={styles.tracks}>
                {trackRows.map((row) => {
                  const releaseQueue = trackRows.map((item) => item.playerTrack);
                  const isFavorite = favoriteIds.has(row.track.id);
                  const isActive = activeTrackId === row.track.id;
                  const isInPlaylist = playlists.some((playlist) =>
                    playlist.items.some((item) => item.track.id === row.track.id),
                  );

                  return (
                    <View key={row.track.id} style={styles.trackRow}>
                      <Pressable
                        style={styles.trackPlayArea}
                        onPress={() => void playFromLibrary(row, releaseQueue)}
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
        ListFooterComponent={() => renderPagination('bottom')}
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
                placeholder={lang === 'ru' ? 'Новый плейлист' : 'New playlist'}
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
    display: 'none',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    overflow: 'hidden',
    maxHeight: 91,
  },
  chipsExpanded: {
    maxHeight: 1000,
  },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
  },
  chipActive: {
    backgroundColor: 'rgba(181,120,255,0.14)',
  },
  chipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.accent,
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
  hiddenFilter: {
    display: 'none',
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
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingVertical: 8,
  },
  paginationBottom: {
    justifyContent: 'space-between',
  },
  pageButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
  },
  pageSizePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pageSizeLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  pageSizeButton: {
    minWidth: 30,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
  },
  pageButton: {
    minWidth: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
  },
  pageButtonActive: {
    backgroundColor: 'rgba(181,120,255,0.18)',
  },
  pageButtonDisabled: {
    opacity: 0.35,
  },
  pageButtonText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  pageButtonTextActive: {
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
