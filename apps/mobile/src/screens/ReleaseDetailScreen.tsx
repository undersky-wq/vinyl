import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { FeedbackPressable as Pressable } from '../components/FeedbackPressable';
import { ChevronLeft, Pause, Play } from 'lucide-react-native';
import { TrackDownloadButton } from '../components/TrackDownloadButton';
import { ReleaseCover } from '../components/ReleaseCover';
import { getCoverUrl, getRelease } from '../lib/api';
import { normalizeDurationLabel } from '../lib/time';
import { adaptiveStyles, colors, spacing } from '../theme';
import { PlayerTrack, Release } from '../types';

type ReleaseDetailScreenProps = {
  isAdmin?: boolean;
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
        releaseId: release.id,
        durationRaw: track.durationRaw,
        durationSec: track.durationSec,
        waveformData: track.waveformData,
      },
    ];
  });
}

export function ReleaseDetailScreen({
  isAdmin = false,
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
        <Pressable style={styles.backButton} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to collection">
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
        <ReleaseCover release={release} isAdmin={isAdmin} style={styles.cover} />

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
                style={[styles.trackRow, !audioUrl && styles.trackRowDisabled]}
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
                    <Pause size={16} color={colors.accent} />
                  ) : (
                    <Play size={16} color={isActive ? colors.accent : colors.muted} fill={audioUrl ? (isActive ? colors.accent : colors.muted) : 'none'} />
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
                <Text style={styles.duration}>{normalizeDurationLabel(track.durationRaw, track.durationSec, '—')}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = adaptiveStyles(StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 8,
    zIndex: 10,
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  headerSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '400',
  },
  content: {
    gap: 17,
    paddingHorizontal: spacing.md,
    paddingTop: 76,
    paddingBottom: 84,
  },
  cover: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 0,
    backgroundColor: colors.panelSoft,
  },
  releaseMeta: {
    gap: 4,
  },
  artist: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '400',
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '400',
  },
  stylesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  styleChip: {
    minHeight: 24,
    justifyContent: 'center',
    paddingRight: 8,
    backgroundColor: 'transparent',
  },
  styleText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '400',
  },
  trackList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  trackRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  trackRowDisabled: {
    opacity: 0.48,
  },
  playButton: {
    width: 32,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  playButtonActive: {
    backgroundColor: 'transparent',
  },
  position: {
    minWidth: 22,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
  },
  trackText: {
    flex: 1,
    gap: 2,
  },
  trackArtist: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '400',
  },
  trackTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '400',
  },
  trackActiveText: {
    color: colors.accent,
  },
  duration: {
    minWidth: 42,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '400',
    textAlign: 'right',
  },
}));
