import { useEffect, useState } from 'react';
import { FlatList, Image, Pressable, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { AnimatedLogo } from '../components/AnimatedLogo';
import { LoadingState } from '../components/LoadingState';
import { TrackDownloadButton } from '../components/TrackDownloadButton';
import { getCoverUrl, getFavoriteTracks } from '../lib/api';
import { colors, radius, spacing } from '../theme';
import { PlayerTrack, Release, Track } from '../types';

type FavoriteTrack = Track & { release: Release };

type FavoritesScreenProps = {
  onPlayTrack: (track: PlayerTrack, queue?: PlayerTrack[]) => void;
  onOpenProfile: () => void;
  avatarUrl?: string | null;
};

function getTrackArtist(track: FavoriteTrack) {
  return track.artists?.length ? track.artists.join(', ') : track.release.artist;
}

function toPlayerTrack(track: FavoriteTrack): PlayerTrack | null {
  const audioUrl = track.audioFiles.find((file) => file.storageUrl)?.storageUrl;
  if (!audioUrl) {
    return null;
  }

  return {
    id: track.id,
    title: track.title,
    artist: getTrackArtist(track),
    audioUrl,
    coverUrl: getCoverUrl(track.release),
    releaseId: track.release.id,
    durationRaw: track.durationRaw,
    durationSec: track.durationSec,
    waveformData: track.waveformData,
  };
}

export function FavoritesScreen({ onPlayTrack, onOpenProfile, avatarUrl }: FavoritesScreenProps) {
  const [tracks, setTracks] = useState<FavoriteTrack[]>([]);
  const [query, setQuery] = useState('');
  const [lang, setLang] = useState<'ru' | 'en'>('en');
  const [isLoading, setIsLoading] = useState(false);

  async function load() {
    setIsLoading(true);
    try {
      setTracks(await getFavoriteTracks());
    } catch {
      setTracks([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleTracks = tracks.filter((track) => {
    if (!normalizedQuery) {
      return true;
    }

    return (
      getTrackArtist(track).toLocaleLowerCase().includes(normalizedQuery) ||
      track.title.toLocaleLowerCase().includes(normalizedQuery)
    );
  });
  const queue = visibleTracks.flatMap((track) => {
    const playerTrack = toPlayerTrack(track);
    return playerTrack ? [playerTrack] : [];
  });

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
        data={visibleTracks}
        keyExtractor={(item) => item.id}
        refreshing={isLoading}
        onRefresh={load}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          isLoading && tracks.length === 0 ? (
            <LoadingState label={lang === 'ru' ? 'Загружаю избранное' : 'Loading favourites'} />
          ) : null
        }
        renderItem={({ item, index }) => {
          const playerTrack = toPlayerTrack(item);

          if (!playerTrack) {
            return null;
          }

          return (
            <Pressable style={styles.trackRow} onPress={() => onPlayTrack(playerTrack, queue)}>
              <Image source={{ uri: getCoverUrl(item.release) }} style={styles.cover} />
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
        ListEmptyComponent={
          isLoading ? null : (
            <Text style={styles.empty}>{lang === 'ru' ? 'Избранных треков пока нет.' : 'No liked tracks yet.'}</Text>
          )
        }
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
  trackRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
    fontSize: 14,
    fontWeight: '700',
  },
});
