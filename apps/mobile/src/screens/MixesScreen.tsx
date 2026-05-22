import { useEffect, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, StatusBar, StyleSheet, Text, View } from 'react-native';
import { AnimatedLogo } from '../components/AnimatedLogo';
import { getCoverUrl, getLibraryFeedFiltered } from '../lib/api';
import { colors, radius, spacing } from '../theme';
import { PlayerTrack, Release, Track } from '../types';

type MixesScreenProps = {
  activeTrackId: string | null;
  onPlayTrack: (track: PlayerTrack, queue?: PlayerTrack[]) => void;
  onOpenProfile: () => void;
  avatarUrl?: string | null;
};

const PAGE_SIZE = 80;

function getTrackArtist(track: Track, release: Release) {
  return track.artists?.length ? track.artists.join(', ') : release.artist;
}

function toPlayerTrack(release: Release, track: Track): PlayerTrack | null {
  const audioUrl = track.audioFiles.find((file) => file.storageUrl)?.storageUrl;
  if (!audioUrl) {
    return null;
  }

  return {
    id: track.id,
    title: track.title || release.title,
    artist: getTrackArtist(track, release),
    audioUrl,
    coverUrl: getCoverUrl(release),
    releaseId: release.id,
    isPublic: true,
    durationRaw: track.durationRaw,
    durationSec: track.durationSec,
    waveformData: track.waveformData,
  };
}

export function MixesScreen({ activeTrackId, onPlayTrack, onOpenProfile, avatarUrl }: MixesScreenProps) {
  const [releases, setReleases] = useState<Release[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lang, setLang] = useState<'ru' | 'en'>('en');

  async function load() {
    setIsLoading(true);
    try {
      const feed = await getLibraryFeedFiltered(PAGE_SIZE, 0, { isMix: true });
      setReleases(feed.releases.filter((release) => release.tracks.some((track) => track.audioFiles.some((file) => file.storageUrl))));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const queue = releases.flatMap((release) =>
    release.tracks.map((track) => toPlayerTrack(release, track)).filter((track): track is PlayerTrack => Boolean(track)),
  );

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
      </View>

      <FlatList
        data={releases}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} tintColor={colors.accent} />}
        renderItem={({ item }) => {
          const tracks = item.tracks
            .map((track) => toPlayerTrack(item, track))
            .filter((track): track is PlayerTrack => Boolean(track));
          const firstTrack = tracks[0];
          const isActive = tracks.some((track) => track.id === activeTrackId);

          return (
            <Pressable
              style={({ pressed }) => [styles.mixCard, pressed && styles.mixCardPressed]}
              onPress={() => {
                if (firstTrack) {
                  const startIndex = queue.findIndex((track) => track.id === firstTrack.id);
                  onPlayTrack(firstTrack, startIndex >= 0 ? queue : tracks);
                }
              }}
            >
              <Image source={{ uri: getCoverUrl(item) }} style={[styles.cover, isActive && styles.coverActive]} />
              <Text numberOfLines={1} style={[styles.artist, isActive && styles.activeText]}>
                {item.artist}
              </Text>
              <Text numberOfLines={1} style={[styles.title, isActive && styles.activeText]}>
                {item.title}
                {item.year ? ` • ${item.year}` : ''}
              </Text>
            </Pressable>
          );
        }}
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
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  language: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  languageText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  languageActive: {
    color: colors.text,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelSoft,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 21,
  },
  avatarText: {
    color: colors.text,
    fontWeight: '900',
  },
  list: {
    paddingTop: Math.max((StatusBar.currentHeight || 0) + 92, 118),
    paddingHorizontal: spacing.md,
    paddingBottom: 160,
  },
  row: {
    gap: 12,
  },
  mixCard: {
    flex: 1,
    marginBottom: 18,
  },
  mixCardPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.97 }],
  },
  cover: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.panelSoft,
  },
  coverActive: {
    borderWidth: 2,
    borderColor: colors.accent,
  },
  artist: {
    marginTop: 8,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  title: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  activeText: {
    color: colors.accent,
  },
});
