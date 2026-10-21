import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react-native';
import { adaptiveStyles, colors } from '../theme';
import { PlayerTrack } from '../types';
import { MINI_PLAYER_MASK_HEIGHT } from '../lib/mini-player-layout';

type MiniPlayerProps = {
  track: PlayerTrack | null;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  isFavorite: boolean;
  onToggle: () => void;
  onFavorite: () => void;
  onOpen: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onSeek?: (ratio: number, resumeAfterSeek?: boolean) => void;
};

function formatMs(value: number) {
  const total = Math.floor(Math.max(0, Number.isFinite(value) ? value : 0) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = (total % 60).toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

export function MiniPlayer({
  track, isPlaying, positionMs, durationMs, isFavorite,
  onToggle, onFavorite, onOpen, onNext, onPrevious, onSeek,
}: MiniPlayerProps) {
  const [timelineWidth, setTimelineWidth] = useState(0);
  if (!track) return null;

  const canSeek = Boolean(onSeek) && Number.isFinite(durationMs) && durationMs > 0;
  const progress = Number.isFinite(durationMs) && durationMs > 0 && Number.isFinite(positionMs)
    ? Math.max(0, Math.min(positionMs / durationMs, 1)) : 0;

  return (
    <View style={styles.mask} pointerEvents="box-none"><View style={styles.shell}>
      {onPrevious && (
        <Pressable style={styles.button} onPress={onPrevious} accessibilityRole="button" accessibilityLabel="Previous track">
          <SkipBack size={17} color={colors.text} fill={colors.text} />
        </Pressable>
      )}
      <Pressable style={styles.button} onPress={onToggle} accessibilityRole="button" accessibilityLabel={isPlaying ? 'Pause' : 'Play'}>
        {isPlaying ? <Pause size={20} color={colors.text} fill={colors.text} /> : <Play size={20} color={colors.text} fill={colors.text} />}
      </Pressable>
      {onNext && (
        <Pressable style={styles.button} onPress={onNext} accessibilityRole="button" accessibilityLabel="Next track">
          <SkipForward size={17} color={colors.text} fill={colors.text} />
        </Pressable>
      )}
      <Pressable style={styles.track} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Open player: ${track.artist}, ${track.title}`}>
        {track.coverUrl ? <Image source={{ uri: track.coverUrl }} style={styles.artwork} cachePolicy="memory-disk" contentFit="cover" /> : <View style={styles.artwork} />}
        <View style={styles.textBlock}>
          <Text numberOfLines={1} style={styles.artist}>{track.artist}</Text>
          <Text numberOfLines={1} style={styles.title}>{track.title}</Text>
        </View>
      </Pressable>
      <Pressable
        style={styles.timeline}
        disabled={!canSeek}
        onPress={(event) => {
          const x = event.nativeEvent.locationX - 6;
          if (timelineWidth > 0 && Number.isFinite(x) && x >= 0 && x <= timelineWidth) onSeek?.(Math.max(0, Math.min(x / timelineWidth, 1)), isPlaying);
        }}
        accessibilityRole={canSeek ? 'adjustable' : 'progressbar'}
        accessibilityLabel="Playback progress"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
        accessibilityActions={canSeek ? [{ name: 'increment' }, { name: 'decrement' }] : []}
        onAccessibilityAction={(event) => {
          if (!canSeek) return;
          const action = event.nativeEvent.actionName;
          if (action === 'increment' || action === 'decrement') {
            onSeek?.(Math.max(0, Math.min(progress + (action === 'increment' ? 0.05 : -0.05), 1)), isPlaying);
          }
        }}
      >
        <View pointerEvents="none" style={styles.timelineRow}>
          <View style={styles.progressTrack} onLayout={event => setTimelineWidth(event.nativeEvent.layout.width)}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text numberOfLines={1} style={styles.time}>{formatMs(positionMs)}</Text>
        </View>
      </Pressable>
    </View></View>
  );
}

const styles = adaptiveStyles(StyleSheet.create({
  mask: { position: 'absolute', left: 0, right: 0, bottom: 0, height: MINI_PLAYER_MASK_HEIGHT, zIndex: 40, backgroundColor: colors.background },
  shell: {
    position: 'absolute', left: '3%', right: '3%', bottom: 10, zIndex: 20,
    height: 44, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingTop: 5, borderTopWidth: 1, borderTopColor: colors.text, backgroundColor: colors.background,
  },
  button: { width: 30, height: 43, alignItems: 'center', justifyContent: 'center' },
  track: { width: 150, flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, height: 40 },
  artwork: { width: 40, height: 40, backgroundColor: colors.panelSoft },
  textBlock: { flex: 1, minWidth: 0, gap: 2 },
  artist: { color: colors.text, fontSize: 10, lineHeight: 12, fontWeight: '600', letterSpacing: -0.3 },
  title: { color: colors.text, fontSize: 10, lineHeight: 12, fontWeight: '400' },
  timeline: { flex: 1, minWidth: 70, height: 40, paddingLeft: 6, borderLeftWidth: 1, borderLeftColor: colors.border, justifyContent: 'center' },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  time: { color: colors.text, fontSize: 11, fontVariant: ['tabular-nums'], textAlign: 'right' },
  progressTrack: { flex: 1, height: 1, backgroundColor: colors.border },
  progressFill: { height: 1, backgroundColor: colors.text },
  favorite: { width: 24, height: 43, alignItems: 'center', justifyContent: 'center' },
}));
