import { useEffect, useRef, useState } from 'react';
import { Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Heart, House, Library, ListMusic } from 'lucide-react-native';
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  State,
  type Track as TrackPlayerTrack,
} from 'react-native-track-player';
import { MiniPlayer } from './src/components/MiniPlayer';
import { FullPlayer } from './src/components/FullPlayer';
import { HomeScreen } from './src/screens/HomeScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { PlaylistsScreen } from './src/screens/PlaylistsScreen';
import { FavoritesScreen } from './src/screens/FavoritesScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ReleaseDetailScreen } from './src/screens/ReleaseDetailScreen';
import { getCurrentUser, getFavorites, toggleFavoriteTrack } from './src/lib/api';
import { getLockScreenArtworkUrl } from './src/lib/artwork-cache';
import { resolveOfflineTrack } from './src/lib/offline-audio';
import { colors, radius, spacing } from './src/theme';
import { AuthUser, PlayerTrack, Release, TabKey } from './src/types';

const tabs: Array<{ key: TabKey; label: string; Icon: typeof House }> = [
  { key: 'home', label: 'Home', Icon: House },
  { key: 'library', label: 'Library', Icon: Library },
  { key: 'playlists', label: 'Playlists', Icon: ListMusic },
  { key: 'favorites', label: 'Likes', Icon: Heart },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [currentTrack, setCurrentTrack] = useState<PlayerTrack | null>(null);
  const [queue, setQueue] = useState<PlayerTrack[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  const [isShuffleEnabled, setIsShuffleEnabled] = useState(false);
  const [isRepeatEnabled, setIsRepeatEnabled] = useState(false);
  const [activeRelease, setActiveRelease] = useState<Release | null>(null);
  const currentTrackRef = useRef<PlayerTrack | null>(null);
  const queueRef = useRef<PlayerTrack[]>([]);
  const queueSignatureRef = useRef('');
  const lastTrackIdRef = useRef<string | null>(null);
  const desiredPlayingRef = useRef(false);
  const isSeekingRef = useRef(false);
  const pendingSeekMsRef = useRef<number | null>(null);
  const pendingSeekStartedAtRef = useRef(0);
  const seekRequestIdRef = useRef(0);
  const seekResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTrackPlayerReadyRef = useRef(false);

  async function ensureTrackPlayerReady() {
    if (isTrackPlayerReadyRef.current) {
      return;
    }

    try {
      await TrackPlayer.setupPlayer({
        autoHandleInterruptions: true,
        minBuffer: 8,
        maxBuffer: 30,
        playBuffer: 0.8,
        maxCacheSize: 1024 * 64,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('already been initialized')) {
        throw error;
      }
    }

    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.PausePlayback,
      },
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.Skip,
        Capability.SkipToPrevious,
        Capability.SkipToNext,
        Capability.SeekTo,
      ],
      compactCapabilities: [
        Capability.SkipToPrevious,
        Capability.Play,
        Capability.SkipToNext,
      ],
      notificationCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.Skip,
        Capability.SkipToPrevious,
        Capability.SkipToNext,
        Capability.SeekTo,
      ],
      progressUpdateEventInterval: 0.25,
      color: 0xb578ff,
    });

    isTrackPlayerReadyRef.current = true;
  }

  function toTrackPlayerTrack(track: PlayerTrack): TrackPlayerTrack {
    return {
      id: track.id,
      url: track.localAudioUrl || track.audioUrl,
      title: track.title,
      artist: track.artist,
      album: 'Vinyl Collection',
      artwork: track.coverUrl || undefined,
      duration: track.durationSec || undefined,
      contentType: 'audio/mpeg',
    };
  }

  async function prepareQueue(nextQueue: PlayerTrack[], startTrackId: string) {
    await ensureTrackPlayerReady();

    const preparedQueue = await Promise.all(nextQueue.map(resolveOfflineTrack));
    const startIndex = Math.max(0, preparedQueue.findIndex((item) => item.id === startTrackId));
    const queueSignature = preparedQueue
      .map((item) => `${item.id}:${item.localAudioUrl || item.audioUrl}`)
      .join('|');

    queueRef.current = preparedQueue;
    setQueue(preparedQueue);
    setCurrentTrack(preparedQueue[startIndex] || null);
    currentTrackRef.current = preparedQueue[startIndex] || null;
    lastTrackIdRef.current = preparedQueue[startIndex]?.id || null;
    setPositionMs(0);
    setDurationMs(preparedQueue[startIndex]?.durationSec ? preparedQueue[startIndex].durationSec * 1000 : 0);

    const currentNativeQueue = await TrackPlayer.getQueue();
    if (queueSignatureRef.current === queueSignature && currentNativeQueue.length === preparedQueue.length) {
      await TrackPlayer.skip(startIndex);
      return;
    }

    const trackPlayerQueue = preparedQueue.map(toTrackPlayerTrack);
    queueSignatureRef.current = queueSignature;
    await TrackPlayer.reset();
    await TrackPlayer.add(trackPlayerQueue);
    await TrackPlayer.skip(startIndex);
  }

  async function playTrack(track: PlayerTrack, nextQueue?: PlayerTrack[]) {
    try {
      desiredPlayingRef.current = true;
      await prepareQueue(nextQueue?.length ? nextQueue : [track], track.id);
      await TrackPlayer.play();
      setIsPlaying(true);
    } catch (error) {
      desiredPlayingRef.current = false;
      setIsPlaying(false);
      console.warn('Failed to start playback', error);
    }
  }

  async function setTrackForPlayback(track: PlayerTrack) {
    desiredPlayingRef.current = true;
    const existingIndex = queueRef.current.findIndex((item) => item.id === track.id);

    if (existingIndex >= 0) {
      await TrackPlayer.skip(existingIndex);
      const nextTrack = queueRef.current[existingIndex];
      setCurrentTrack(nextTrack);
      currentTrackRef.current = nextTrack;
      lastTrackIdRef.current = nextTrack.id;
      setPositionMs(0);
      setDurationMs(nextTrack.durationSec ? nextTrack.durationSec * 1000 : 0);
    } else {
      await prepareQueue([track], track.id);
    }

    await TrackPlayer.play();
    setIsPlaying(true);
  }

  async function togglePlayback() {
    const next = !desiredPlayingRef.current;

    desiredPlayingRef.current = next;
    setIsPlaying(next);

    if (!currentTrackRef.current) {
      return;
    }

    await ensureTrackPlayerReady();

    try {
      if (next) {
        await TrackPlayer.play();
      } else {
        await TrackPlayer.pause();
      }
    } catch (error) {
      desiredPlayingRef.current = !next;
      setIsPlaying(!next);
      console.warn('Failed to toggle playback', error);
    }
  }

  function playByOffset(offset: 1 | -1) {
    if (!currentTrack || queue.length === 0) {
      return;
    }

    if (isShuffleEnabled && offset === 1) {
      const candidates = queue.filter((track) => track.id !== currentTrack.id);
      const nextTrack = candidates[Math.floor(Math.random() * candidates.length)] || currentTrack;
      void setTrackForPlayback(nextTrack);
      return;
    }

    const index = Math.max(0, queue.findIndex((track) => track.id === currentTrack.id));
    const nextIndex = index + offset;

    if (nextIndex < 0 || nextIndex >= queue.length) {
      if (isRepeatEnabled) {
        void setTrackForPlayback(queue[offset === 1 ? 0 : queue.length - 1]);
      }
      return;
    }

    void setTrackForPlayback(queue[nextIndex]);
  }

  async function seekToRatio(ratio: number, resumeAfterSeek = isPlaying) {
    if (durationMs <= 0) {
      return;
    }

    const safeRatio = Math.max(0, Math.min(1, ratio));
    isSeekingRef.current = true;
    desiredPlayingRef.current = resumeAfterSeek;
    const nextPositionMs = Math.round(durationMs * safeRatio);
    const seekRequestId = seekRequestIdRef.current + 1;
    seekRequestIdRef.current = seekRequestId;
    pendingSeekMsRef.current = nextPositionMs;
    pendingSeekStartedAtRef.current = Date.now();
    setPositionMs(nextPositionMs);
    await ensureTrackPlayerReady();
    await TrackPlayer.seekTo(nextPositionMs / 1000);

    if (seekResumeTimerRef.current) {
      clearTimeout(seekResumeTimerRef.current);
    }

    seekResumeTimerRef.current = setTimeout(() => {
      if (seekRequestIdRef.current !== seekRequestId) {
        return;
      }

      if (resumeAfterSeek) {
        TrackPlayer.getPlaybackState()
          .then((state) => {
            if (seekRequestIdRef.current === seekRequestId && state.state !== State.Playing) {
              return TrackPlayer.play();
            }
            return undefined;
          })
          .catch(() => {});
        setIsPlaying(true);
      }

      pendingSeekMsRef.current = null;
      isSeekingRef.current = false;
    }, 900);
  }

  useEffect(() => {
    void ensureTrackPlayerReady();

    const progressSubscription = TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (event) => {
      const fallbackTrack = currentTrackRef.current;
      const nextPositionMs = Math.round(event.position * 1000);
      const pendingSeekMs = pendingSeekMsRef.current;

      if (pendingSeekMs !== null) {
        const seekAgeMs = Date.now() - pendingSeekStartedAtRef.current;
        const seekConfirmed = Math.abs(nextPositionMs - pendingSeekMs) < 1200 || seekAgeMs > 1600;

        if (seekConfirmed) {
          pendingSeekMsRef.current = null;
          isSeekingRef.current = false;
          setPositionMs(nextPositionMs);
        }
      } else if (!isSeekingRef.current) {
        setPositionMs(nextPositionMs);
      }

      setDurationMs(
        Math.round(event.duration * 1000) ||
          (fallbackTrack?.durationSec ? fallbackTrack.durationSec * 1000 : 0),
      );
    });

    const stateSubscription = TrackPlayer.addEventListener(Event.PlaybackState, (event) => {
      if (event.state === State.Playing) {
        desiredPlayingRef.current = true;
        setIsPlaying(true);
        return;
      }

      if (event.state === State.Paused || event.state === State.Stopped || event.state === State.Ended) {
        setIsPlaying(false);
      }
    });

    const activeTrackSubscription = TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async (event) => {
      const nextTrack = typeof event.index === 'number' ? queueRef.current[event.index] : null;

      if (nextTrack) {
        currentTrackRef.current = nextTrack;
        lastTrackIdRef.current = nextTrack.id;
        setCurrentTrack(nextTrack);
        setDurationMs(nextTrack.durationSec ? nextTrack.durationSec * 1000 : 0);
        setPositionMs(0);
        pendingSeekMsRef.current = null;
        isSeekingRef.current = false;
        if (typeof event.index === 'number') {
          void getLockScreenArtworkUrl(nextTrack.id, nextTrack.coverUrl).then((artwork) => {
            void TrackPlayer.updateMetadataForTrack(event.index as number, { artwork });
          });
        }
      }
    });

    return () => {
      if (seekResumeTimerRef.current) {
        clearTimeout(seekResumeTimerRef.current);
      }
      progressSubscription.remove();
      stateSubscription.remove();
      activeTrackSubscription.remove();
    };
  }, []);

  useEffect(() => {
    async function loadSession() {
      try {
        const [nextFavorites, nextUser] = await Promise.all([getFavorites(), getCurrentUser()]);
        setFavoriteIds(new Set(nextFavorites));
        setCurrentUser(nextUser);
      } catch {
        setFavoriteIds(new Set());
        setCurrentUser(null);
      }
    }

    void loadSession();
  }, []);

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
      try {
        setFavoriteIds(new Set(await getFavorites()));
      } catch {
        // Keep the optimistic UI if the refresh also fails.
      }
    }
  }

  useEffect(() => {
    if (desiredPlayingRef.current && isRepeatEnabled && positionMs > 0 && durationMs > 0 && positionMs >= durationMs - 450) {
      if (isRepeatEnabled) {
        void seekToRatio(0);
        setIsPlaying(true);
      }
    }
  }, [positionMs, durationMs, isRepeatEnabled]);

  function renderScreen() {
    if (activeRelease) {
      return (
        <ReleaseDetailScreen
          initialRelease={activeRelease}
          activeTrackId={currentTrack?.id || null}
          isPlaying={isPlaying}
          onBack={() => setActiveRelease(null)}
          onPlayTrack={playTrack}
          onTogglePlayback={togglePlayback}
        />
      );
    }

    if (activeTab === 'home') {
      return (
        <HomeScreen
          avatarUrl={currentUser?.avatarStorageUrl}
          onOpenProfile={() => setActiveTab('profile')}
          onOpenRelease={setActiveRelease}
        />
      );
    }

    if (activeTab === 'library') {
      return (
        <LibraryScreen
          activeTrackId={currentTrack?.id || null}
          avatarUrl={currentUser?.avatarStorageUrl}
          onPlayTrack={playTrack}
          onOpenProfile={() => setActiveTab('profile')}
        />
      );
    }

    if (activeTab === 'playlists') {
      return (
        <PlaylistsScreen
          avatarUrl={currentUser?.avatarStorageUrl}
          onPlayTrack={playTrack}
          onOpenProfile={() => setActiveTab('profile')}
        />
      );
    }

    if (activeTab === 'favorites') {
      return (
        <FavoritesScreen
          avatarUrl={currentUser?.avatarStorageUrl}
          onPlayTrack={playTrack}
          onOpenProfile={() => setActiveTab('profile')}
        />
      );
    }

    return <ProfileScreen onAuthChange={setCurrentUser} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.root}>
        {renderScreen()}

        <MiniPlayer
          track={currentTrack}
          isPlaying={isPlaying}
          positionMs={positionMs}
          durationMs={durationMs}
          isFavorite={currentTrack ? favoriteIds.has(currentTrack.id) : false}
          onFavorite={() => {
            if (currentTrack) {
              void handleFavorite(currentTrack.id);
            }
          }}
          onToggle={togglePlayback}
          onOpen={() => setIsFullPlayerOpen(true)}
          onSeek={seekToRatio}
        />

        <FullPlayer
          track={currentTrack}
          visible={isFullPlayerOpen}
          isPlaying={isPlaying}
          positionMs={positionMs}
          durationMs={durationMs}
          isFavorite={currentTrack ? favoriteIds.has(currentTrack.id) : false}
          onClose={() => setIsFullPlayerOpen(false)}
          onToggle={togglePlayback}
          onFavorite={() => {
            if (currentTrack) {
              void handleFavorite(currentTrack.id);
            }
          }}
          queue={queue}
          isShuffleEnabled={isShuffleEnabled}
          isRepeatEnabled={isRepeatEnabled}
          onPrevious={() => playByOffset(-1)}
          onNext={() => playByOffset(1)}
          onSeek={seekToRatio}
          onSelectQueueTrack={(track) => playTrack(track, queue)}
          onToggleShuffle={() => setIsShuffleEnabled((current) => !current)}
          onToggleRepeat={() => setIsRepeatEnabled((current) => !current)}
        />

        <View style={styles.tabbar}>
          {tabs.map((tab) => {
            const active = tab.key === activeTab;
            const Icon = tab.Icon;

            return (
              <Pressable
                key={tab.key}
                style={[styles.tab, active && styles.tabActiveBackground]}
                onPress={() => {
                  setActiveRelease(null);
                  setActiveTab(tab.key);
                }}
                accessibilityRole="button"
              >
                <Icon
                  size={23}
                  strokeWidth={2.2}
                  color={active ? colors.accent : colors.muted}
                />
                <Text style={[styles.tabLabel, active && styles.tabActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabbar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.sm,
    zIndex: 30,
    height: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 9,
    borderRadius: 20,
    backgroundColor: colors.panel,
  },
  tab: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: 16,
  },
  tabLabel: {
    display: 'none',
  },
  tabActiveBackground: {
    backgroundColor: 'rgba(181, 120, 255, 0.13)',
  },
  tabActive: {
    color: colors.accent,
  },
});
