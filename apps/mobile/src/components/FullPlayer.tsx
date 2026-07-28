import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
} from 'react-native';
import { ChevronDown, Heart, ListMusic, ListPlus, MessageCircle, Pause, Pencil, Play, Repeat, Shuffle, SkipBack, SkipForward, Trash2 } from 'lucide-react-native';
import { TrackDownloadButton } from './TrackDownloadButton';
import { colors, radius, spacing } from '../theme';
import { AuthUser, PlayerTrack, Playlist, TimelineComment } from '../types';
import {
  createReleaseTimelineComment,
  deleteReleaseTimelineComment,
  getReleaseTimelineComments,
  updateReleaseTimelineComment,
} from '../lib/api';

type FullPlayerProps = {
  track: PlayerTrack | null;
  visible: boolean;
  isPlaying: boolean;
  isFavorite: boolean;
  positionMs: number;
  durationMs: number;
  currentUser: AuthUser | null;
  onClose: () => void;
  onToggle: () => void;
  onFavorite: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (ratio: number, resumeAfterSeek?: boolean) => void;
  queue: PlayerTrack[];
  queuePreview?: PlayerTrack[];
  playlists: Playlist[];
  onSelectQueueTrack: (track: PlayerTrack) => void;
  onPlaylistToggle: (playlist: Playlist, trackId: string) => Promise<void>;
  onCreatePlaylist: (name: string, trackId: string) => Promise<Playlist>;
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

function getAvatarInitial(name?: string | null) {
  return (name || 'U').trim().charAt(0).toUpperCase() || 'U';
}

function getNearestTimelineComment(comments: TimelineComment[], ratio: number, durationMs: number) {
  if (!comments.length || durationMs <= 0) {
    return null;
  }

  const durationSec = durationMs / 1000;
  const percent = ratio * 100;
  const thresholdPercent = Math.max(2.5, Math.min(7, (6 / durationSec) * 100));
  let closestComment: TimelineComment | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  comments.forEach((comment) => {
    const markerPercent = Math.max(0, Math.min((comment.second / durationSec) * 100, 100));
    const distance = Math.abs(markerPercent - percent);
    if (distance <= thresholdPercent && distance < closestDistance) {
      closestComment = comment;
      closestDistance = distance;
    }
  });

  return closestComment;
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

function WaveformCommentTip({ comment }: { comment: TimelineComment }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View style={[styles.commentTip, { opacity, transform: [{ translateY }] }]}>
      <Text numberOfLines={3} style={styles.commentTipText}>
        {comment.text}
      </Text>
    </Animated.View>
  );
}

export function FullPlayer({
  track,
  visible,
  isPlaying,
  isFavorite,
  positionMs,
  durationMs,
  currentUser,
  onClose,
  onToggle,
  onFavorite,
  onPrevious,
  onNext,
  onSeek,
  queue,
  queuePreview,
  playlists,
  onSelectQueueTrack,
  onPlaylistToggle,
  onCreatePlaylist,
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
  const [isPlaylistSheetOpen, setIsPlaylistSheetOpen] = useState(false);
  const [isCommentsSheetOpen, setIsCommentsSheetOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [comments, setComments] = useState<TimelineComment[]>([]);
  const [activeComment, setActiveComment] = useState<TimelineComment | null>(null);
  const [commentText, setCommentText] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [isSavingComment, setIsSavingComment] = useState(false);
  const coverScale = useRef(new Animated.Value(isPlaying ? 1 : 0.85)).current;
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const sheetScrollYRef = useRef(0);
  const waveformTouchRef = useRef<View>(null);
  const waveformLeftRef = useRef(0);
  const dragProgressRef = useRef<number | null>(null);
  const dragCommittedRef = useRef(false);

  const progress = durationMs > 0 ? Math.min(positionMs / durationMs, 1) : 0;
  const visibleProgress = dragProgress ?? progress;
  const visiblePositionMs =
    dragProgress !== null && durationMs > 0 ? Math.round(durationMs * dragProgress) : positionMs;
  useEffect(() => {
    Animated.timing(coverScale, {
      toValue: isPlaying ? 1 : 0.85,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [coverScale, isPlaying]);

  useEffect(() => {
    if (isQueueOpen || isPlaylistSheetOpen || isCommentsSheetOpen) {
      sheetTranslateY.setValue(0);
      sheetScrollYRef.current = 0;
    }
  }, [isCommentsSheetOpen, isPlaylistSheetOpen, isQueueOpen, sheetTranslateY]);

  function closeOpenSheet() {
    setIsQueueOpen(false);
    setIsPlaylistSheetOpen(false);
    setIsCommentsSheetOpen(false);
    setPlaylistName('');
  }

  const sheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: () => {
          sheetTranslateY.setValue(0);
        },
        onPanResponderMove: (_event, gesture) => {
          sheetTranslateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > 72 || gesture.vy > 0.9) {
            Animated.timing(sheetTranslateY, {
              toValue: 520,
              duration: 180,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }).start(closeOpenSheet);
            return;
          }

          Animated.spring(sheetTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 18,
            stiffness: 180,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(sheetTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 18,
            stiffness: 180,
          }).start();
        },
      }),
    [sheetTranslateY],
  );

  const sheetContentPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          sheetScrollYRef.current <= 1 &&
          gesture.dy > 12 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2,
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          sheetScrollYRef.current <= 1 &&
          gesture.dy > 12 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2,
        onPanResponderGrant: () => {
          sheetTranslateY.setValue(0);
        },
        onPanResponderMove: (_event, gesture) => {
          sheetTranslateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > 72 || gesture.vy > 0.9) {
            Animated.timing(sheetTranslateY, {
              toValue: 520,
              duration: 180,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }).start(closeOpenSheet);
            return;
          }

          Animated.spring(sheetTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 18,
            stiffness: 180,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(sheetTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 18,
            stiffness: 180,
          }).start();
        },
      }),
    [sheetTranslateY],
  );

  function handleSheetScroll(event: any) {
    sheetScrollYRef.current = event.nativeEvent.contentOffset.y;
  }

  useEffect(() => {
    if (!track?.releaseId) {
      setComments([]);
      setActiveComment(null);
      setCommentText('');
      setEditingCommentId(null);
      return;
    }

    let cancelled = false;
    getReleaseTimelineComments(track.releaseId)
      .then((nextComments) => {
        if (!cancelled) {
          setComments(nextComments);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setComments([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [track?.releaseId]);

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
    setActiveComment(getNearestTimelineComment(comments, nextRatio, durationMs));
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
      setActiveComment(null);
      setIsSeeking(false);
    }, 260);
  }

  function cancelDrag() {
    dragProgressRef.current = null;
    dragCommittedRef.current = false;
    setDragProgress(null);
    setActiveComment(null);
    setIsSeeking(false);
  }

  async function handlePlaylistToggle(playlist: Playlist) {
    if (!track) {
      return;
    }

    await onPlaylistToggle(playlist, track.id);
  }

  async function handleCreatePlaylist() {
    if (!track || !playlistName.trim() || isCreatingPlaylist) {
      return;
    }

    setIsCreatingPlaylist(true);
    try {
      await onCreatePlaylist(playlistName.trim(), track.id);
      setPlaylistName('');
    } finally {
      setIsCreatingPlaylist(false);
    }
  }

  function startEditComment(comment: TimelineComment) {
    setEditingCommentId(comment.id);
    setCommentText(comment.text);
    setActiveComment(comment);
    setIsCommentsSheetOpen(false);
  }

  function resetCommentEditor() {
    setEditingCommentId(null);
    setCommentText('');
  }

  async function saveTimelineComment() {
    if (!track?.releaseId || !track.isMix || !commentText.trim() || isSavingComment) {
      return;
    }

    setIsSavingComment(true);
    try {
      if (editingCommentId) {
        const updatedComment = await updateReleaseTimelineComment(track.releaseId, editingCommentId, {
          text: commentText.trim(),
        });
        setComments((current) =>
          current.map((comment) => (comment.id === updatedComment.id ? updatedComment : comment)),
        );
        setActiveComment(updatedComment);
      } else {
        const createdComment = await createReleaseTimelineComment(track.releaseId, {
          second: Math.max(0, Math.round(visiblePositionMs / 1000)),
          text: commentText.trim(),
        });
        setComments((current) => [...current, createdComment].sort((a, b) => a.second - b.second));
        setActiveComment(createdComment);
      }
      resetCommentEditor();
    } finally {
      setIsSavingComment(false);
    }
  }

  async function deleteTimelineComment(comment: TimelineComment) {
    if (!track?.releaseId || isSavingComment) {
      return;
    }

    setIsSavingComment(true);
    try {
      await deleteReleaseTimelineComment(track.releaseId, comment.id);
      setComments((current) => current.filter((item) => item.id !== comment.id));
      if (activeComment?.id === comment.id) {
        setActiveComment(null);
      }
      if (editingCommentId === comment.id) {
        resetCommentEditor();
      }
    } finally {
      setIsSavingComment(false);
    }
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
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.screen}>
        <Image source={{ uri: track.coverUrl }} style={styles.ambient} blurRadius={26} />
        <View style={styles.overlay} />

        <Pressable style={styles.closeButton} onPress={onClose}>
          <ChevronDown size={22} color="#ffffff" strokeWidth={2.8} />
        </Pressable>

        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <Pressable
            style={styles.coverButton}
            onPress={onOpenRelease}
            disabled={!onOpenRelease || !track.releaseId}
          >
            <Animated.Image
              source={{ uri: track.coverUrl }}
              style={[styles.cover, { transform: [{ scale: coverScale }] }]}
            />
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
                {durationMs > 0
                  ? comments.map((comment) => {
                      const markerRatio = Math.max(0, Math.min(comment.second / (durationMs / 1000), 1));
                      const active = activeComment?.id === comment.id;

                      return (
                        <View
                          key={comment.id}
                          pointerEvents="none"
                          style={[
                            styles.commentMarker,
                            { left: `${markerRatio * 100}%` },
                            active && styles.commentMarkerActive,
                          ]}
                        >
                          {comment.user.avatarStorageUrl ? (
                            <Image source={{ uri: comment.user.avatarStorageUrl }} style={styles.commentAvatar} />
                          ) : (
                            <Text style={styles.commentInitial}>{getAvatarInitial(comment.user.displayName)}</Text>
                          )}
                          {active ? <WaveformCommentTip comment={comment} /> : null}
                        </View>
                      );
                    })
                  : null}
                <View style={[styles.progressThumb, { left: `${visibleProgress * 100}%` }]} />
              </View>
            </View>
            <View style={styles.times}>
              <Text style={styles.time}>{formatMs(visiblePositionMs)}</Text>
              <Text style={styles.time}>{track.durationRaw || formatMs(durationMs)}</Text>
            </View>
          </View>

          {track.isMix ? (
            <View style={styles.commentComposer}>
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder={editingCommentId ? 'Edit comment' : `Comment at ${formatMs(visiblePositionMs)}`}
                placeholderTextColor={colors.muted}
                style={styles.commentInput}
                returnKeyType="done"
                onSubmitEditing={() => void saveTimelineComment()}
              />
              {editingCommentId ? (
                <Pressable style={styles.commentIconButton} onPress={resetCommentEditor}>
                  <Text style={styles.commentCancelText}>×</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[
                  styles.commentSaveButton,
                  (!commentText.trim() || isSavingComment) && styles.disabledButton,
                ]}
                disabled={!commentText.trim() || isSavingComment}
                onPress={() => void saveTimelineComment()}
              >
                <Text style={styles.commentSaveText}>{editingCommentId ? 'Save' : '+'}</Text>
              </Pressable>
            </View>
          ) : null}

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
            {track.isMix ? (
              <Pressable
                style={styles.iconButton}
                onPress={() => {
                  setIsQueueOpen(false);
                  setIsPlaylistSheetOpen(false);
                  setIsCommentsSheetOpen((current) => !current);
                }}
              >
                <MessageCircle
                  size={22}
                  color={isCommentsSheetOpen || comments.length ? colors.accent : colors.muted}
                  strokeWidth={2.4}
                />
              </Pressable>
            ) : null}
            <Pressable
              style={styles.iconButton}
              onPress={() => {
                setIsQueueOpen(false);
                setIsCommentsSheetOpen(false);
                setIsPlaylistSheetOpen((current) => !current);
              }}
            >
              <ListPlus size={22} color={isPlaylistSheetOpen ? colors.accent : colors.muted} strokeWidth={2.4} />
            </Pressable>
            <Pressable
              style={styles.iconButton}
              onPress={() => {
                setIsPlaylistSheetOpen(false);
                setIsCommentsSheetOpen(false);
                setIsQueueOpen((current) => !current);
              }}
            >
              <ListMusic size={22} color={isQueueOpen ? colors.accent : colors.muted} strokeWidth={2.4} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>

        {isQueueOpen ? (
          <View style={styles.queueLayer}>
            <Pressable style={styles.queueBackdrop} onPress={() => setIsQueueOpen(false)} />
            <Animated.View
              style={[styles.queueSheet, { transform: [{ translateY: sheetTranslateY }] }]}
            >
              <View style={styles.sheetDragZone} {...sheetPanResponder.panHandlers}>
                <View style={styles.queueHandle} />
                <Text style={styles.queueHeading}>Up next</Text>
              </View>
              <ScrollView
                style={styles.queue}
                scrollEventThrottle={16}
                onScroll={handleSheetScroll}
                {...sheetContentPanResponder.panHandlers}
              >
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
            </Animated.View>
          </View>
        ) : null}

        {isPlaylistSheetOpen ? (
          <View style={styles.queueLayer}>
            <Pressable
              style={styles.queueBackdrop}
              onPress={() => {
                setIsPlaylistSheetOpen(false);
                setPlaylistName('');
              }}
            />
            <Animated.View
              style={[styles.queueSheet, { transform: [{ translateY: sheetTranslateY }] }]}
            >
              <View style={styles.sheetDragZone} {...sheetPanResponder.panHandlers}>
                <View style={styles.queueHandle} />
                <Text style={styles.queueHeading}>Playlists</Text>
              </View>
              <View style={styles.playlistCreateRow}>
                <TextInput
                  value={playlistName}
                  onChangeText={setPlaylistName}
                  placeholder="New playlist"
                  placeholderTextColor={colors.muted}
                  style={styles.playlistCreateInput}
                  autoCapitalize="sentences"
                  returnKeyType="done"
                  onSubmitEditing={() => void handleCreatePlaylist()}
                />
                <Pressable
                  style={[
                    styles.playlistCreateButton,
                    (!playlistName.trim() || isCreatingPlaylist) && styles.disabledButton,
                  ]}
                  disabled={!playlistName.trim() || isCreatingPlaylist}
                  onPress={() => void handleCreatePlaylist()}
                >
                  <Text style={styles.playlistCreateButtonText}>+</Text>
                </Pressable>
              </View>
              <ScrollView
                style={styles.queue}
                scrollEventThrottle={16}
                onScroll={handleSheetScroll}
                {...sheetContentPanResponder.panHandlers}
              >
                {playlists.length ? (
                  playlists.map((playlist) => {
                    const active = playlist.items.some((item) => item.track.id === track.id);

                    return (
                      <Pressable
                        key={playlist.id}
                        style={[styles.playlistMenuItem, active && styles.playlistMenuItemActive]}
                        onPress={() => void handlePlaylistToggle(playlist)}
                      >
                        <Text style={[styles.playlistMenuText, active && styles.playlistMenuTextActive]}>
                          {playlist.name}
                        </Text>
                        <Text style={styles.playlistMenuCount}>{playlist.items.length}</Text>
                      </Pressable>
                    );
                  })
                ) : (
                  <Text style={styles.playlistMenuEmpty}>No playlists yet</Text>
                )}
              </ScrollView>
            </Animated.View>
          </View>
        ) : null}

        {isCommentsSheetOpen ? (
          <View style={styles.queueLayer}>
            <Pressable style={styles.queueBackdrop} onPress={() => setIsCommentsSheetOpen(false)} />
            <Animated.View
              style={[styles.queueSheet, { transform: [{ translateY: sheetTranslateY }] }]}
            >
              <View style={styles.sheetDragZone} {...sheetPanResponder.panHandlers}>
                <View style={styles.queueHandle} />
                <Text style={styles.queueHeading}>Comments</Text>
              </View>
              <ScrollView
                style={styles.queue}
                scrollEventThrottle={16}
                onScroll={handleSheetScroll}
                {...sheetContentPanResponder.panHandlers}
              >
                {comments.length ? (
                  comments.map((comment) => {
                    const canEdit =
                      Boolean(currentUser) &&
                      (currentUser?.role === 'ADMIN' || comment.userId === currentUser?.id);

                    return (
                      <View key={comment.id} style={styles.commentSheetRow}>
                        {comment.user.avatarStorageUrl ? (
                          <Image source={{ uri: comment.user.avatarStorageUrl }} style={styles.commentSheetAvatar} />
                        ) : (
                          <View style={styles.commentSheetAvatarFallback}>
                            <Text style={styles.commentSheetInitial}>{getAvatarInitial(comment.user.displayName)}</Text>
                          </View>
                        )}
                        <View style={styles.commentSheetBody}>
                          <View style={styles.commentSheetMeta}>
                            <Text numberOfLines={1} style={styles.commentSheetName}>
                              {comment.user.displayName}
                            </Text>
                            <Text style={styles.commentSheetTime}>{formatMs(comment.second * 1000)}</Text>
                          </View>
                          <Text style={styles.commentSheetText}>{comment.text}</Text>
                        </View>
                        {canEdit ? (
                          <View style={styles.commentSheetActions}>
                            <Pressable style={styles.commentIconButton} onPress={() => startEditComment(comment)}>
                              <Pencil size={15} color={colors.muted} strokeWidth={2.4} />
                            </Pressable>
                            <Pressable style={styles.commentIconButton} onPress={() => void deleteTimelineComment(comment)}>
                              <Trash2 size={15} color={colors.muted} strokeWidth={2.4} />
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.playlistMenuEmpty}>No comments yet</Text>
                )}
              </ScrollView>
            </Animated.View>
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
    paddingTop: 118,
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
    position: 'relative',
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
  commentMarker: {
    position: 'absolute',
    top: 31,
    width: 24,
    height: 24,
    marginLeft: -12,
    marginTop: -12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.88)',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    zIndex: 5,
    elevation: 5,
  },
  commentMarkerActive: {
    transform: [{ scale: 1.08 }],
  },
  commentAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: radius.pill,
  },
  commentInitial: {
    color: '#111111',
    fontSize: 10,
    fontWeight: '900',
  },
  commentTip: {
    position: 'absolute',
    bottom: 32,
    minWidth: 128,
    maxWidth: 270,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(24,24,24,0.96)',
  },
  commentTipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  commentTipName: {
    color: colors.muted,
    fontWeight: '800',
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
  commentComposer: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: -10,
  },
  commentInput: {
    flex: 1,
    height: 42,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(24,24,24,0.74)',
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  commentSaveButton: {
    minWidth: 44,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  commentSaveText: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '900',
  },
  activeCommentRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: -14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(24,24,24,0.64)',
  },
  activeCommentText: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  commentIconButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(24,24,24,0.74)',
  },
  commentCancelText: {
    color: colors.muted,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 25,
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
  sheetDragZone: {
    minHeight: 52,
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: -spacing.md,
    marginTop: -10,
    paddingTop: 10,
    paddingHorizontal: spacing.md,
  },
  queueHeading: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  playlistCreateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playlistCreateInput: {
    flex: 1,
    height: 42,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.panelSoft,
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  playlistCreateButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  disabledButton: {
    opacity: 0.45,
  },
  playlistCreateButtonText: {
    color: '#111111',
    fontSize: 23,
    fontWeight: '900',
    lineHeight: 25,
  },
  queue: {
    maxHeight: 360,
  },
  playlistMenuItem: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  playlistMenuItemActive: {
    backgroundColor: 'rgba(181,120,255,0.12)',
  },
  playlistMenuText: {
    flex: 1,
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
    paddingVertical: 14,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  commentSheetRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  commentSheetAvatar: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
  },
  commentSheetAvatarFallback: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  commentSheetInitial: {
    color: '#111111',
    fontSize: 12,
    fontWeight: '900',
  },
  commentSheetBody: {
    flex: 1,
    gap: 3,
  },
  commentSheetMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentSheetName: {
    flexShrink: 1,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
  },
  commentSheetTime: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '900',
  },
  commentSheetText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 17,
  },
  commentSheetActions: {
    flexDirection: 'row',
    gap: 6,
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
