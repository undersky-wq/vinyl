import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StatusBar,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
} from 'react-native';
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
  onSeek: (ratio: number, resumeAfterSeek?: boolean) => void;
  queue: PlayerTrack[];
  queuePreview?: PlayerTrack[];
  onSelectQueueTrack: (track: PlayerTrack) => void;
  isShuffleEnabled: boolean;
  isRepeatEnabled: boolean;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  onOpenRelease?: () => void;
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

function buildFallbackWaveform(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const phase = index / Math.max(count - 1, 1);
    return 0.22 + Math.abs(Math.sin(phase * Math.PI * 5.5)) * 0.58 + Math.abs(Math.sin(phase * Math.PI * 17)) * 0.2;
  });
}

function sampleWaveform(source: number[] | null | undefined, count: number) {
  const values = source?.length ? source : buildFallbackWaveform(count);
  const maxValue = Math.max(...values, 1);

  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index / count) * values.length);
    const end = Math.max(start + 1, Math.floor(((index + 1) / count) * values.length));
    const slice = values.slice(start, end);
    const peak = Math.max(...slice, 0) / maxValue;
    return Math.max(0.16, Math.min(1, peak));
  });
}

function MarqueeText({
  text,
  style,
}: {
  text: string;
  style: StyleProp<TextStyle>;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [containerWidth, setContainerWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const gap = 42;
  const distance = textWidth + gap;
  const shouldScroll = textWidth > containerWidth + 4;

  useEffect(() => {
    translateX.stopAnimation();
    translateX.setValue(0);

    if (!shouldScroll) {
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(3000),
        Animated.timing(translateX, {
          toValue: -distance,
          duration: Math.max(5200, distance * 38),
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [distance, shouldScroll, text, translateX]);

  return (
    <View
      style={styles.marqueeViewport}
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[styles.marqueeTrack, { transform: [{ translateX }] }]}
      >
        <Text
          numberOfLines={1}
          onLayout={(event) => setTextWidth(event.nativeEvent.layout.width)}
          style={style}
        >
          {text}
        </Text>
        {shouldScroll ? (
          <Text numberOfLines={1} style={[style, styles.marqueeClone]}>
            {text}
          </Text>
        ) : null}
      </Animated.View>
    </View>
  );
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
  queuePreview,
  onSelectQueueTrack,
  isShuffleEnabled,
  isRepeatEnabled,
  onToggleShuffle,
  onToggleRepeat,
  onOpenRelease,
}: FullPlayerProps) {
  const [progressWidth, setProgressWidth] = useState(1);
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const waveformTouchRef = useRef<View>(null);
  const waveformLeftRef = useRef(0);
  const dragProgressRef = useRef<number | null>(null);
  const dragCommittedRef = useRef(false);

  const progress = durationMs > 0 ? Math.min(positionMs / durationMs, 1) : 0;
  const visibleProgress = dragProgress ?? progress;
  const visiblePositionMs =
    dragProgress !== null && durationMs > 0 ? Math.round(durationMs * dragProgress) : positionMs;

  function measureWaveform() {
    waveformTouchRef.current?.measureInWindow((x, _y, width) => {
      waveformLeftRef.current = x;
      if (width > 0) {
        setProgressWidth(width);
      }
    });
  }

  function getSeekRatio(pageX: number) {
    return Math.max(0, Math.min(1, (pageX - waveformLeftRef.current) / Math.max(progressWidth, 1)));
  }

  function updateDrag(pageX: number) {
    dragCommittedRef.current = false;
    setIsSeeking(true);
    const nextRatio = getSeekRatio(pageX);
    dragProgressRef.current = nextRatio;
    setDragProgress(nextRatio);
  }

  function commitDrag(pageX?: number) {
    if (dragCommittedRef.current) {
      return;
    }

    dragCommittedRef.current = true;
    const nextRatio = typeof pageX === 'number' ? getSeekRatio(pageX) : dragProgressRef.current;
    if (nextRatio === null) {
      setIsSeeking(false);
      return;
    }

    dragProgressRef.current = nextRatio;
    setDragProgress(nextRatio);
    onSeek(nextRatio, isPlaying);
    setTimeout(() => {
      dragProgressRef.current = null;
      dragCommittedRef.current = false;
      setDragProgress(null);
      setIsSeeking(false);
    }, 260);
  }

  function cancelDrag() {
    dragProgressRef.current = null;
    dragCommittedRef.current = false;
    setDragProgress(null);
    setIsSeeking(false);
  }

  const waveformPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (event) => {
          measureWaveform();
          updateDrag(event.nativeEvent.pageX);
        },
        onPanResponderMove: (event) => {
          updateDrag(event.nativeEvent.pageX);
        },
        onPanResponderRelease: (event) => {
          commitDrag(event.nativeEvent.pageX);
        },
        onPanResponderTerminate: () => {
          cancelDrag();
        },
      }),
    [progressWidth, isPlaying, durationMs],
  );

  if (!track) {
    return null;
  }

  const waveformBars = sampleWaveform(track.waveformData, 86);
  const visibleQueue = queuePreview?.length ? queuePreview : queue;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.screen}>
        <Image source={{ uri: track.coverUrl }} style={styles.ambient} blurRadius={26} />
        <View style={styles.overlay} />

        <Pressable style={styles.closeButton} onPress={onClose}>
          <ChevronDown size={22} color="#ffffff" strokeWidth={2.8} />
        </Pressable>

        <View style={styles.content}>
          <Pressable
            style={styles.coverButton}
            onPress={onOpenRelease}
            disabled={!onOpenRelease || !track.releaseId}
          >
            <Image source={{ uri: track.coverUrl }} style={styles.cover} />
          </Pressable>

          <View style={styles.meta}>
            <MarqueeText text={track.title} style={styles.title} />
            <MarqueeText text={track.artist} style={styles.artist} />
          </View>

          <View style={styles.progressWrap}>
            <View
              ref={waveformTouchRef}
              style={styles.progressTouchArea}
              onLayout={(event) => {
                setProgressWidth(event.nativeEvent.layout.width);
                requestAnimationFrame(measureWaveform);
              }}
              {...waveformPanResponder.panHandlers}
            >
              <View style={[styles.waveformTrack, isSeeking && styles.progressTrackSeeking]}>
                {waveformBars.map((bar, index) => {
                  const barProgress = index / Math.max(waveformBars.length - 1, 1);
                  const played = barProgress <= visibleProgress;

                  return (
                    <View
                      key={`${index}-${bar.toFixed(3)}`}
                      style={[
                        styles.waveformBar,
                        {
                          height: 8 + bar * 48,
                          backgroundColor: played ? colors.accent : 'rgba(255,255,255,0.34)',
                        },
                      ]}
                    />
                  );
                })}
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
            <View style={styles.downloadButtonWrap}>
              <TrackDownloadButton track={track} size={22} />
            </View>
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
                {visibleQueue.map((queueTrack, index) => {
                  const active = queueTrack.id === track.id;
                  return (
                    <Pressable
                      key={`${queueTrack.id}-${index}`}
                      style={[styles.queueRow, active && styles.queueRowActive]}
                      onPress={() => onSelectQueueTrack(queueTrack)}
                    >
                      <Text style={styles.queueNumber}>{index + 1}</Text>
                      <Image source={{ uri: queueTrack.coverUrl }} style={styles.queueCover} />
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
    top: Math.max((StatusBar.currentHeight || 0) + 12, 42),
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
    paddingHorizontal: spacing.lg,
    paddingTop: 94,
    paddingBottom: spacing.lg,
  },
  cover: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 28,
    backgroundColor: colors.panelSoft,
  },
  coverButton: {
    width: '100%',
  },
  meta: {
    gap: 6,
  },
  marqueeViewport: {
    overflow: 'hidden',
    width: '100%',
  },
  marqueeTrack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  marqueeClone: {
    marginLeft: 42,
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
  waveformTrack: {
    height: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.pill,
  },
  progressTrackSeeking: {
    opacity: 0.92,
  },
  waveformBar: {
    width: 2.2,
    borderRadius: radius.pill,
  },
  progressThumb: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
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
  downloadButtonWrap: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(24,24,24,0.74)',
  },
  queueLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'flex-end',
    zIndex: 50,
    elevation: 50,
  },
  queueBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.34)',
  },
  queueSheet: {
    width: '100%',
    alignSelf: 'stretch',
    maxHeight: '62%',
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    paddingBottom: 26,
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
    maxHeight: 360,
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
  queueCover: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.panel,
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
