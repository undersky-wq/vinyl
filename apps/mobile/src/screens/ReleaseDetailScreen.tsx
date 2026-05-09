import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, Pause, Play } from 'lucide-react-native';
import { TrackDownloadButton } from '../components/TrackDownloadButton';
import { getCoverUrl, getRelease } from '../lib/api';
import { colors, radius, spacing } from '../theme';
import { PlayerTrack, Release } from '../types';

type ReleaseDetailScreenProps = {
  initialRelease: Release;
  activeTrackId: string | null;
  isPlaying: boolean;
  onBack: () => void;
  onPlayTrack: (track: PlayerTrack, queue?: PlayerTrack[]) => void;
  onTogglePlayback: () => void;
};

function getTrackArtist(release: Release, trackArtists?: string[]) {
  return trackArtists?.length ? trackArtists.join(', ') : release.artist;
}

function buildPlayableTracks(release: Release) {
  return release.tracks.flatMap((track) => {
    const audioUrl = track.audioFiles.find((file) => file.storageUrl)?.storageUrl;

    if (!audioUrl) {
      return [];
    }

    return [
      {
        id: track.id,
        title: track.title,
        artist: getTrackArtist(release, track.artists),
        audioUrl,
        coverUrl: getCoverUrl(release),
        durationRaw: track.durationRaw,
        durationSec: track.durationSec,
      },
    ];
  });
}

export function ReleaseDetailScreen({
  initialRelease,
  activeTrackId,
  isPlaying,
  onBack,
  onPlayTrack,
  onTogglePlayback,
}: ReleaseDetailScreenProps) {
  const [release, setRelease] = useState(initialRelease);
  const queue = useMemo(() => buildPlayableTracks(release), [release]);

  useEffect(() => {
    let cancelled = false;

    async function loadRelease() {
      try {
        const nextRelease = await getRelease(initialRelease.id);
        if (!cancelled) {
          setRelease(nextRelease);
        }
      } catch {
        // The summary release still lets the screen open if the detail request fails.
      }
    }

    void loadRelease();

    return () => {
      cancelled = true;
    };
  }, [initialRelease.id]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <ChevronLeft size={23} color={colors.text} strokeWidth={2.6} />
        </Pressable>
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {release.title}
          </Text>
          <Text numberOfLines={1} style={styles.headerSubtitle}>
            {release.artist}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Image source={{ uri: getCoverUrl(release) }} style={styles.cover} />

        <View style={styles.releaseMeta}>
          <Text style={styles.artist}>{release.artist}</Text>
          <Text style={styles.title}>{release.title}</Text>
          <Text style={styles.subtitle}>
            {[release.year, release.country].filter(Boolean).join(' · ')}
          </Text>
        </View>

        {release.styles.length ? (
          <View style={styles.stylesRow}>
            {release.styles.map((style) => (
              <View key={style} style={styles.styleChip}>
                <Text style={styles.styleText}>{style}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.trackList}>
          {release.tracks.map((track) => {
            const audioUrl = track.audioFiles.find((file) => file.storageUrl)?.storageUrl;
            const playerTrack = queue.find((item) => item.id === track.id);
            const isActive = activeTrackId === track.id;

            return (
              <Pressable
                key={track.id}
                style={[styles.trackRow, isActive && styles.trackRowActive, !audioUrl && styles.trackRowDisabled]}
                disabled={!audioUrl || !playerTrack}
                onPress={() => {
                  if (!playerTrack) {
                    return;
                  }

                  if (isActive) {
                    onTogglePlayback();
                    return;
                  }

                  const startIndex = Math.max(0, queue.findIndex((item) => item.id === playerTrack.id));
                  onPlayTrack(playerTrack, queue.slice(startIndex).concat(queue.slice(0, startIndex)));
                }}
              >
                <View style={[styles.playButton, isActive && styles.playButtonActive]}>
                  {isActive && isPlaying ? (
                    <Pause size={16} color="#111111" />
                  ) : (
                    <Play size={16} color={audioUrl ? '#111111' : colors.muted} fill={audioUrl ? '#111111' : 'none'} />
                  )}
                </View>
                <Text style={styles.position}>{track.position || ''}</Text>
                <View style={styles.trackText}>
                  <Text numberOfLines={1} style={[styles.trackArtist, isActive && styles.trackActiveText]}>
                    {getTrackArtist(release, track.artists)}
                  </Text>
                  <Text numberOfLines={1} style={[styles.trackTitle, isActive && styles.trackActiveText]}>
                    {track.title}
                  </Text>
                </View>
                {playerTrack ? <TrackDownloadButton track={playerTrack} /> : null}
                <Text style={styles.duration}>{track.durationRaw || '—'}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    top: Math.max((StatusBar.currentHeight || 0) - 3, 0),
    zIndex: 10,
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(24,24,24,0.96)',
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.panelSoft,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  headerSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  content: {
    gap: 17,
    paddingHorizontal: spacing.md,
    paddingTop: (StatusBar.currentHeight || 0) + 86,
    paddingBottom: 172,
  },
  cover: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 26,
    backgroundColor: colors.panelSoft,
  },
  releaseMeta: {
    gap: 4,
  },
  artist: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '700',
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  stylesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  styleChip: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
  },
  styleText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  trackList: {
    gap: 6,
  },
  trackRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 8,
    borderRadius: 16,
  },
  trackRowActive: {
    backgroundColor: 'rgba(181,120,255,0.12)',
  },
  trackRowDisabled: {
    opacity: 0.48,
  },
  playButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: '#ffffff',
  },
  playButtonActive: {
    backgroundColor: colors.accent,
  },
  position: {
    minWidth: 28,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  trackText: {
    flex: 1,
    gap: 2,
  },
  trackArtist: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  trackTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  trackActiveText: {
    color: colors.accent,
  },
  duration: {
    minWidth: 42,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
});
