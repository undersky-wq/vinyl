import { useEffect, useRef, useState } from 'react';
import { Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { AudioLines, Heart, House, Library, ListMusic } from 'lucide-react-native';
import type { Track as TrackPlayerTrack } from 'react-native-track-player';
import { MiniPlayer } from './src/components/MiniPlayer';
import { FullPlayer } from './src/components/FullPlayer';
import { HomeScreen } from './src/screens/HomeScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { PlaylistsScreen } from './src/screens/PlaylistsScreen';
import { MixesScreen } from './src/screens/MixesScreen';
import { FavoritesScreen } from './src/screens/FavoritesScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ReleaseDetailScreen } from './src/screens/ReleaseDetailScreen';
import {
  addTrackToPlaylist,
  createPlaylist,
  getCurrentUser,
  getFavoriteTracks,
  getFavorites,
  getPlaylists,
  getRelease,
  refreshPlayerTrack,
  removeTrackFromPlaylist,
  toggleFavoriteTrack,
} from './src/lib/api';
import { getLockScreenArtworkUrl } from './src/lib/artwork-cache';
import { resolveOfflineTrack } from './src/lib/offline-audio';
import { colors, radius, spacing } from './src/theme';
import { AuthUser, PlayerTrack, Playlist, Release, TabKey, Track } from './src/types';

type FavoriteTrack = Track & { release: Release };

declare const require: (path: string) => any;

const tabs: Array<{ key: TabKey; label: string; Icon: typeof House }> = [
  { key: 'home', label: 'Home', Icon: House },
  { key: 'library', label: 'Library', Icon: Library },
  { key: 'playlists', label: 'Playlists', Icon: ListMusic },
  { key: 'mixes', label: 'Mixes', Icon: AudioLines },
  { key: 'favorites', label: 'Likes', Icon: Heart },
];

function loadTrackPlayerModule() {
  try {
    const trackPlayerModule = require('react-native-track-player');
    return {
      TrackPlayer: trackPlayerModule.default || trackPlayerModule,
      AppKilledPlaybackBehavior: trackPlayerModule.AppKilledPlaybackBehavior || {},
      Capability: trackPlayerModule.Capability || {},
      Event: trackPlayerModule.Event || {},
      State: trackPlayerModule.State || {},
    };
  } catch {
    return {
      TrackPlayer: {},
      AppKilledPlaybackBehavior: {},
      Capability: {},
      Event: {},
      State: {},
    };
  }
}

const nativeTrackPlayer = loadTrackPlayerModule();
const TrackPlayer = nativeTrackPlayer.TrackPlayer;
const AppKilledPlaybackBehavior = nativeTrackPlayer.AppKilledPlaybackBehavior;
const Capability = nativeTrackPlayer.Capability;
const Event = nativeTrackPlayer.Event;
const State = nativeTrackPlayer.State;

function isNativeTrackPlayerAvailable() {
  const player = TrackPlayer as any;
  const capability = Capability as any;
  const event = Event as any;
  const state = State as any;
  const appKilledPlaybackBehavior = AppKilledPlaybackBehavior as any;

  return Boolean(
    player?.setupPlayer &&
      player?.addEventListener &&
      capability &&
      'Play' in capability &&
      event &&
      'PlaybackProgressUpdated' in event &&
      state &&
      'Playing' in state &&
      appKilledPlaybackBehavior &&
      'PausePlayback' in appKilledPlaybackBehavior,
  );
}

function mergeTrackById(tracks: PlayerTrack[], nextTrack: PlayerTrack) {
  return tracks.map((track) => (track.id === nextTrack.id ? { ...track, ...nextTrack } : track));
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [currentTrack, setCurrentTrack] = useState<PlayerTrack | null>(null);
  const [queue, setQueue] = useState<PlayerTrack[]>([]);
  const [queuePreview, setQueuePreview] = useState<PlayerTrack[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [favoriteTracks, setFavoriteTracks] = useState<FavoriteTrack[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [showTrackMeta, setShowTrackMeta] = useState(true);
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  const [isShuffleEnabled, setIsShuffleEnabled] = useState(false);
  const [isRepeatEnabled, setIsRepeatEnabled] = useState(false);
  const [activeRelease, setActiveRelease] = useState<Release | null>(null);
  const currentTrackRef = useRef<PlayerTrack | null>(null);
  const queueRef = useRef<PlayerTrack[]>([]);
  const queueSignatureRef = useRef('');
  const lastTrackIdRef = useRef<string | null>(null);
  const desiredPlayingRef = useRef(false);
  const positionMsRef = useRef(0);
  const lastNativeProgressAtRef = useRef(Date.now());
  const lastNativePositionMsRef = useRef(0);
  const recoveryInProgressRef = useRef(false);
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

    if (!isNativeTrackPlayerAvailable()) {
      isTrackPlayerReadyRef.current = true;
      return;
    }

    const nativeCapability = Capability as any;
    const nativeAppKilledPlaybackBehavior = AppKilledPlaybackBehavior as any;

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
        appKilledPlaybackBehavior: nativeAppKilledPlaybackBehavior.PausePlayback,
      },
      capabilities: [
        nativeCapability.Play,
        nativeCapability.Pause,
        nativeCapability.Skip,
        nativeCapability.SkipToPrevious,
        nativeCapability.SkipToNext,
        nativeCapability.SeekTo,
      ],
      compactCapabilities: [
        nativeCapability.SkipToPrevious,
        nativeCapability.Play,
        nativeCapability.SkipToNext,
      ],
      notificationCapabilities: [
        nativeCapability.Play,
        nativeCapability.Pause,
        nativeCapability.Skip,
        nativeCapability.SkipToPrevious,
        nativeCapability.SkipToNext,
        nativeCapability.SeekTo,
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

  async function refreshPlaybackTrack(track: PlayerTrack) {
    try {
      const refreshedTrack = await refreshPlayerTrack(track.id);
      if (!refreshedTrack.audioUrl) {
        return track;
      }

      return { ...track, ...refreshedTrack };
    } catch (error) {
      console.warn('Failed to refresh playback URL', error);
      return track;
    }
  }

  function syncRefreshedTrack(nextTrack: PlayerTrack) {
    const nextQueue = mergeTrackById(queueRef.current, nextTrack);
    const nextQueuePreview = mergeTrackById(queuePreview, nextTrack);

    queueRef.current = nextQueue;
    setQueue(nextQueue);
    setQueuePreview(nextQueuePreview);

    if (currentTrackRef.current?.id === nextTrack.id) {
      currentTrackRef.current = nextTrack;
      setCurrentTrack(nextTrack);
      setDurationMs(nextTrack.durationSec ? nextTrack.durationSec * 1000 : durationMs);
    }

    return nextQueue;
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
    positionMsRef.current = 0;
    setPositionMs(0);
    setDurationMs(preparedQueue[startIndex]?.durationSec ? preparedQueue[startIndex].durationSec * 1000 : 0);

    if (!isNativeTrackPlayerAvailable()) {
      queueSignatureRef.current = queueSignature;
      return;
    }

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

  async function playTrack(track: PlayerTrack, nextQueue?: PlayerTrack[], nextQueuePreview?: PlayerTrack[]) {
    try {
      desiredPlayingRef.current = true;
      const refreshedTrack = await refreshPlaybackTrack(track);
      const playbackQueue = mergeTrackById(nextQueue?.length ? nextQueue : [track], refreshedTrack);
      const playbackPreview = mergeTrackById(
        nextQueuePreview?.length ? nextQueuePreview : nextQueue?.length ? nextQueue : [track],
        refreshedTrack,
      );
      setQueuePreview(playbackPreview);
      await prepareQueue(playbackQueue, refreshedTrack.id);
      if (isNativeTrackPlayerAvailable()) {
        await TrackPlayer.play();
      }
      setIsPlaying(true);
    } catch (error) {
      setIsPlaying(false);
      console.warn('Failed to start playback', error);
      desiredPlayingRef.current = true;
      await recoverNativePlayback('start-playback-failed', track);
    }
  }

  async function recoverNativePlayback(reason: string, preferredTrack?: PlayerTrack) {
    if (!isNativeTrackPlayerAvailable() || recoveryInProgressRef.current) {
      return;
    }

    const track = preferredTrack || currentTrackRef.current;
    if (!track) {
      return;
    }

    recoveryInProgressRef.current = true;
    const shouldResume = desiredPlayingRef.current;
    const savedPositionMs = preferredTrack ? 0 : Math.max(0, positionMsRef.current - 600);
    const recoveryQueue = queueRef.current.length ? queueRef.current : [track];

    try {
      console.warn(`Recovering native playback: ${reason}`);
      await ensureTrackPlayerReady();
      const refreshedTrack = await refreshPlaybackTrack(track);
      const refreshedQueue = mergeTrackById(recoveryQueue, refreshedTrack);
      syncRefreshedTrack(refreshedTrack);
      queueSignatureRef.current = '';
      await prepareQueue(refreshedQueue, refreshedTrack.id);
      if (savedPositionMs > 0) {
        await TrackPlayer.seekTo(savedPositionMs / 1000);
        positionMsRef.current = savedPositionMs;
        setPositionMs(savedPositionMs);
      }
      if (shouldResume) {
        await TrackPlayer.play();
        setIsPlaying(true);
      }
      lastNativeProgressAtRef.current = Date.now();
    } catch (error) {
      console.warn('Native playback recovery failed', error);
      setIsPlaying(false);
    } finally {
      recoveryInProgressRef.current = false;
    }
  }

  async function setTrackForPlayback(track: PlayerTrack) {
    desiredPlayingRef.current = true;
    const refreshedTrack = await refreshPlaybackTrack(track);
    const refreshedQueue = syncRefreshedTrack(refreshedTrack);
    const existingIndex = refreshedQueue.findIndex((item) => item.id === refreshedTrack.id);

    try {
      if (existingIndex >= 0) {
        const nextTrack = refreshedQueue[existingIndex];
        const currentNativeQueue = isNativeTrackPlayerAvailable() ? await TrackPlayer.getQueue() : [];
        const nativeTrack = currentNativeQueue[existingIndex] as TrackPlayerTrack | undefined;

        if (nativeTrack && (nativeTrack as any).url !== (nextTrack.localAudioUrl || nextTrack.audioUrl)) {
          queueSignatureRef.current = '';
          await prepareQueue(refreshedQueue, nextTrack.id);
        }

        if (isNativeTrackPlayerAvailable()) {
          await TrackPlayer.skip(existingIndex);
        }
        setCurrentTrack(nextTrack);
        currentTrackRef.current = nextTrack;
        lastTrackIdRef.current = nextTrack.id;
        positionMsRef.current = 0;
        setPositionMs(0);
        setDurationMs(nextTrack.durationSec ? nextTrack.durationSec * 1000 : 0);
      } else {
        await prepareQueue([refreshedTrack], refreshedTrack.id);
      }

      if (isNativeTrackPlayerAvailable()) {
        await TrackPlayer.play();
      }
      setIsPlaying(true);
    } catch (error) {
      console.warn('Failed to switch track, recovering playback', error);
      await recoverNativePlayback('switch-track-failed', track);
    }
  }

  async function togglePlayback() {
    const next = !desiredPlayingRef.current;

    desiredPlayingRef.current = next;
    setIsPlaying(next);

    if (!currentTrackRef.current) {
      return;
    }

    await ensureTrackPlayerReady();

    if (!isNativeTrackPlayerAvailable()) {
      return;
    }

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
      if (next) {
        await recoverNativePlayback('toggle-play-failed');
      }
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
    positionMsRef.current = nextPositionMs;
    setPositionMs(nextPositionMs);
    await ensureTrackPlayerReady();
    if (!isNativeTrackPlayerAvailable()) {
      return;
    }
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
          .then((state: any) => {
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

    if (!isNativeTrackPlayerAvailable()) {
      return;
    }

    const nativeEvent = Event as any;
    const nativeState = State as any;

    const progressSubscription = TrackPlayer.addEventListener(nativeEvent.PlaybackProgressUpdated, (event: any) => {
      const fallbackTrack = currentTrackRef.current;
      const nextPositionMs = Math.round(event.position * 1000);
      const pendingSeekMs = pendingSeekMsRef.current;

      if (pendingSeekMs !== null) {
        const seekAgeMs = Date.now() - pendingSeekStartedAtRef.current;
        const seekConfirmed = Math.abs(nextPositionMs - pendingSeekMs) < 1200 || seekAgeMs > 1600;

        if (seekConfirmed) {
          pendingSeekMsRef.current = null;
          isSeekingRef.current = false;
          positionMsRef.current = nextPositionMs;
          setPositionMs(nextPositionMs);
        }
      } else if (!isSeekingRef.current) {
        positionMsRef.current = nextPositionMs;
        setPositionMs(nextPositionMs);
      }

      if (Math.abs(nextPositionMs - lastNativePositionMsRef.current) > 250) {
        lastNativePositionMsRef.current = nextPositionMs;
        lastNativeProgressAtRef.current = Date.now();
      }

      setDurationMs(
        Math.round(event.duration * 1000) ||
          (fallbackTrack?.durationSec ? fallbackTrack.durationSec * 1000 : 0),
      );
    });

    const stateSubscription = TrackPlayer.addEventListener(nativeEvent.PlaybackState, (event: any) => {
      if (event.state === nativeState.Playing) {
        desiredPlayingRef.current = true;
        setIsPlaying(true);
        return;
      }

      if (event.state === nativeState.Paused || event.state === nativeState.Stopped || event.state === nativeState.Ended) {
        setIsPlaying(false);
      }
    });

    const activeTrackSubscription = TrackPlayer.addEventListener(nativeEvent.PlaybackActiveTrackChanged, async (event: any) => {
      const nextTrack = typeof event.index === 'number' ? queueRef.current[event.index] : null;

      if (nextTrack) {
        currentTrackRef.current = nextTrack;
        lastTrackIdRef.current = nextTrack.id;
        setCurrentTrack(nextTrack);
        setDurationMs(nextTrack.durationSec ? nextTrack.durationSec * 1000 : 0);
        positionMsRef.current = 0;
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

    const errorSubscription = nativeEvent.PlaybackError
      ? TrackPlayer.addEventListener(nativeEvent.PlaybackError, (event: any) => {
          console.warn('Native playback error', event);
          void recoverNativePlayback('playback-error');
        })
      : null;

    const watchdog = setInterval(() => {
      if (
        desiredPlayingRef.current &&
        currentTrackRef.current &&
        !isSeekingRef.current &&
        !recoveryInProgressRef.current &&
        Date.now() - lastNativeProgressAtRef.current > 18000
      ) {
        void recoverNativePlayback('progress-stalled');
      }
    }, 6000);

    return () => {
      if (seekResumeTimerRef.current) {
        clearTimeout(seekResumeTimerRef.current);
      }
      progressSubscription.remove();
      stateSubscription.remove();
      activeTrackSubscription.remove();
      errorSubscription?.remove();
      clearInterval(watchdog);
    };
  }, []);

  useEffect(() => {
    async function loadSession() {
      try {
        const [nextFavorites, nextUser, nextPlaylists, nextFavoriteTracks] = await Promise.all([
          getFavorites(),
          getCurrentUser(),
          getPlaylists(),
          getFavoriteTracks(),
        ]);
        setFavoriteIds(new Set(nextFavorites));
        setCurrentUser(nextUser);
        setPlaylists(nextPlaylists);
        setFavoriteTracks(nextFavoriteTracks);
      } catch {
        setFavoriteIds(new Set());
        setFavoriteTracks([]);
        setPlaylists([]);
        setCurrentUser(null);
      }
    }

    void loadSession();
  }, []);

  async function refreshPersonalLibrary() {
    const [nextFavorites, nextPlaylists, nextFavoriteTracks] = await Promise.all([
      getFavorites(),
      getPlaylists(),
      getFavoriteTracks(),
    ]);
    setFavoriteIds(new Set(nextFavorites));
    setPlaylists(nextPlaylists);
    setFavoriteTracks(nextFavoriteTracks);
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
      setFavoriteTracks(await getFavoriteTracks());
    } catch {
      try {
        await refreshPersonalLibrary();
      } catch {
        // Keep the optimistic UI if the refresh also fails.
      }
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
      await refreshPersonalLibrary().catch(() => undefined);
    }
  }

  async function handleCreatePlaylist(name: string, trackId: string) {
    const createdPlaylist = await createPlaylist({ name, trackIds: [trackId] });
    setPlaylists((current) => [createdPlaylist, ...current]);
    return createdPlaylist;
  }

  async function openCurrentTrackRelease() {
    const releaseId = currentTrackRef.current?.releaseId || currentTrack?.releaseId;
    if (!releaseId) {
      return;
    }

    try {
      const release = await getRelease(releaseId);
      setIsFullPlayerOpen(false);
      setActiveRelease(release);
    } catch (error) {
      console.warn('Failed to open release from player cover', error);
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
          favoriteIds={favoriteIds}
          playlists={playlists}
          onCreatePlaylist={handleCreatePlaylist}
          onFavoriteTrack={handleFavorite}
          onPlayTrack={playTrack}
          onPlaylistToggle={handlePlaylistToggle}
          onOpenProfile={() => setActiveTab('profile')}
          onRefreshPersonalLibrary={refreshPersonalLibrary}
        />
      );
    }

    if (activeTab === 'playlists') {
      return (
        <PlaylistsScreen
          activeTrackId={currentTrack?.id || null}
          avatarUrl={currentUser?.avatarStorageUrl}
          playlists={playlists}
          onPlaylistsChange={setPlaylists}
          onPlayTrack={playTrack}
          onOpenProfile={() => setActiveTab('profile')}
          onRefreshPlaylists={async () => {
            setPlaylists(await getPlaylists());
          }}
          showTrackMeta={showTrackMeta}
        />
      );
    }

    if (activeTab === 'mixes') {
      return (
        <MixesScreen
          avatarUrl={currentUser?.avatarStorageUrl}
          activeTrackId={currentTrack?.id || null}
          onOpenProfile={() => setActiveTab('profile')}
          onPlayTrack={playTrack}
        />
      );
    }

    if (activeTab === 'favorites') {
      return (
        <FavoritesScreen
          activeTrackId={currentTrack?.id || null}
          avatarUrl={currentUser?.avatarStorageUrl}
          tracks={favoriteTracks}
          onPlayTrack={playTrack}
          onOpenProfile={() => setActiveTab('profile')}
          onRefresh={async () => {
            setFavoriteTracks(await getFavoriteTracks());
          }}
          showTrackMeta={showTrackMeta}
        />
      );
    }

    return (
      <ProfileScreen
        onAuthChange={setCurrentUser}
        showTrackMeta={showTrackMeta}
        onShowTrackMetaChange={setShowTrackMeta}
      />
    );
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
        />

        <FullPlayer
          track={currentTrack}
          visible={isFullPlayerOpen}
          isPlaying={isPlaying}
          positionMs={positionMs}
          durationMs={durationMs}
          currentUser={currentUser}
          isFavorite={currentTrack ? favoriteIds.has(currentTrack.id) : false}
          onClose={() => setIsFullPlayerOpen(false)}
          onToggle={togglePlayback}
          onFavorite={() => {
            if (currentTrack) {
              void handleFavorite(currentTrack.id);
            }
          }}
          queue={queue}
          queuePreview={queuePreview}
          playlists={playlists}
          isShuffleEnabled={isShuffleEnabled}
          isRepeatEnabled={isRepeatEnabled}
          onPrevious={() => playByOffset(-1)}
          onNext={() => playByOffset(1)}
          onSeek={seekToRatio}
          onSelectQueueTrack={(track) => playTrack(track, queue, queuePreview)}
          onPlaylistToggle={handlePlaylistToggle}
          onCreatePlaylist={handleCreatePlaylist}
          onToggleShuffle={() => setIsShuffleEnabled((current) => !current)}
          onToggleRepeat={() => setIsRepeatEnabled((current) => !current)}
          onOpenRelease={openCurrentTrackRelease}
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
