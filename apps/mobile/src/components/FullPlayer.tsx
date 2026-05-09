import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, Heart, ListMusic, Pause, Play, Repeat, Shuffle, SkipBack, SkipForward } from 'lucide-react-native';
import { TrackDownloadButton } from './TrackDownloadButton';
import { colors, radius, spacing } from '../theme';
import { PlayerTrack } from '../types';

type FullPlayerProps = {
  track: PlayerTrack | null;
  visible: boolean;
  isPlaying: boolean;
  isFavorite: boolean;
  positionMs: number;
  durationMs: number;
  onClose: () => void;
  onToggle: () => void;
  onFavorite: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (ratio: number) => void;
  queue: PlayerTrack[];
  onSelectQueueTrack: (track: PlayerTrack) => void;
  isShuffleEnabled: boolean;
  isRepeatEnabled: boolean;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
};

function formatMs(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0:00';
  }

  const totalSeconds = Math.floor(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function FullPlayer({
  track,
  visible,
  isPlaying,
  isFavorite,
  positionMs,
  durationMs,
  onClose,
  onToggle,
  onFavorite,
  onPrevious,
  onNext,
  onSeek,
  queue,
  onSelectQueueTrack,
  isShuffleEnabled,
  isRepeatEnabled,
  onToggleShuffle,
  onToggleRepeat,
}: FullPlayerProps) {
  const [progressWidth, setProgressWidth] = useState(1);
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const [isQueueOpen, setIsQueueOpen] = useState(false);

  if (!track) {
    return null;
  }

  const progress = durationMs > 0 ? Math.min(positionMs / durationMs, 1) : 0;
  const visibleProgress = dragProgress ?? progress;
  const visiblePositionMs =
    dragProgress !== null && durationMs > 0 ? Math.round(durationMs * dragProgress) : positionMs;

  function getSeekRatio(locationX: number) {
    return Math.max(0, Math.min(1, locationX / Math.max(progressWidth, 1)));
  }

  function updateDrag(locationX: number) {
    setDragProgress(getSeekRatio(locationX));
  }

  function commitDrag(locationX: number) {
    const nextRatio = getSeekRatio(locationX);
    setDragProgress(null);
    onSeek(nextRatio);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.screen}>
        <Image source={{ uri: track.coverUrl }} style={styles.ambient} blurRadius={26} />
        <View style={styles.overlay} />

        <Pressable style={styles.closeButton} onPress={onClose}>
          <ChevronDown size={22} color="#ffffff" strokeWidth={2.8} />
        </Pressable>

        <View style={styles.content}>
          <Image source={{ uri: track.coverUrl }} style={styles.cover} />

          <View style={styles.meta}>
            <Text numberOfLines={2} style={styles.title}>
              {track.title}
            </Text>
            <Text numberOfLines={1} style={styles.artist}>
              {track.artist}
            </Text>
          </View>

          <View style={styles.progressWrap}>
            <View
              style={styles.progressTouchArea}
              onLayout={(event) => setProgressWidth(event.nativeEvent.layout.width)}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={(event) => updateDrag(event.nativeEvent.locationX)}
              onResponderMove={(event) => updateDrag(event.nativeEvent.locationX)}
              onResponderRelease={(event) => commitDrag(event.nativeEvent.locationX)}
              onResponderTerminate={(event) => commitDrag(event.nativeEvent.locationX)}
            >
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${visibleProgress * 100}%` }]} />
                <View style={[styles.progressThumb, { left: `${visibleProgress * 100}%` }]} />
              </View>
            </View>
            <View style={styles.times}>
              <Text style={styles.time}>{formatMs(visiblePositionMs)}</Text>
              <Text style={styles.time}>{track.durationRaw || formatMs(durationMs)}</Text>
            </View>
          </View>

          <View style={styles.controls}>
            <Pressable style={styles.iconButton} onPress={onToggleShuffle}>
              <Shuffle size={22} color={isShuffleEnabled ? colors.accent : colors.muted} strokeWidth={2.4} />
            </Pressable>
            <Pressable style={styles.iconButton} onPress={onPrevious}>
              <SkipBack size={25} color={colors.text} fill={colors.text} />
            </Pressable>
            <Pressable style={styles.playButton} onPress={onToggle}>
              {isPlaying ? (
                <Pause size={34} color="#111111" fill="#111111" />
              ) : (
                <Play size={34} color="#111111" fill="#111111" />
              )}
            </Pressable>
            <Pressable style={styles.iconButton} onPress={onNext}>
              <SkipForward size={25} color={colors.text} fill={colors.text} />
            </Pressable>
            <Pressable style={styles.iconButton} onPress={onToggleRepeat}>
              <Repeat size={22} color={isRepeatEnabled ? colors.accent : colors.muted} strokeWidth={2.4} />
            </Pressable>
          </View>

          <View style={styles.secondaryControls}>
            <Pressable style={styles.iconButton} onPress={onFavorite}>
              <Heart
                size={22}
                strokeWidth={2.4}
                color={isFavorite ? colors.accent : colors.muted}
                fill={isFavorite ? colors.accent : 'none'}
              />
            </Pressable>
            <Pressable style={styles.iconButton} onPress={() => setIsQueueOpen((current) => !current)}>
              <ListMusic size={22} color={isQueueOpen ? colors.accent : colors.muted} strokeWidth={2.4} />
            </Pressable>
          </View>
        </View>

        {isQueueOpen ? (
          <View style={styles.queueLayer}>
            <Pressable style={styles.queueBackdrop} onPress={() => setIsQueueOpen(false)} />
            <View style={styles.queueSheet}>
              <View style={styles.queueHandle} />
              <Text style={styles.queueHeading}>Up next</Text>
              <ScrollView style={styles.queue}>
                {queue.map((queueTrack, index) => {
                  const active = queueTrack.id === track.id;
                  return (
                    <Pressable
                      key={`${queueTrack.id}-${index}`}
                      style={[styles.queueRow, active && styles.queueRowActive]}
                      onPress={() => onSelectQueueTrack(queueTrack)}
                    >
                      <Text style={styles.queueNumber}>{index + 1}</Text>
                      <View style={styles.queueText}>
                        <Text numberOfLines={1} style={[styles.queueTitle, active && styles.queueActiveText]}>
                          {queueTrack.title}
                        </Text>
                        <Text numberOfLines={1} style={[styles.queueArtist, active && styles.queueActiveText]}>
                          {queueTrack.artist}
                        </Text>
                      </View>
                      <TrackDownloadButton track={queueTrack} size={15} />
                      <Text style={styles.queueTime}>{queueTrack.durationRaw || ''}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  ambient: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    opacity: 0.32,
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(10,10,10,0.82)',
  },
  closeButton: {
    position: 'absolute',
    top: 24,
    right: spacing.md,
    zIndex: 4,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 24,
    padding: spacing.lg,
  },
  cover: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 28,
    backgroundColor: colors.panelSoft,
  },
  meta: {
    gap: 6,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  artist: {
    color: colors.muted,
    fontSize: 18,
    fontWeight: '700',
  },
  progressWrap: {
    gap: 8,
  },
  progressTouchArea: {
    minHeight: 34,
    justifyContent: 'center',
  },
  progressTrack: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  progressThumb: {
    position: 'absolute',
    top: -6,
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  time: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playButton: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  iconButton: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(24,24,24,0.74)',
  },
  secondaryControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
  },
  queueLayer: {
    position: 'absolute',
    inset: 0,
    justifyContent: 'flex-end',
  },
  queueBackdrop: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.34)',
  },
  queueSheet: {
    maxHeight: '48%',
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    paddingBottom: 22,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: 'rgba(24,24,24,0.98)',
  },
  queueHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  queueHeading: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  queue: {
    maxHeight: 260,
  },
  queueRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
  },
  queueRowActive: {
    backgroundColor: 'rgba(181,120,255,0.12)',
  },
  queueNumber: {
    width: 22,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  queueText: {
    flex: 1,
  },
  queueTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  queueArtist: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  queueActiveText: {
    color: colors.accent,
  },
  queueTime: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
});
