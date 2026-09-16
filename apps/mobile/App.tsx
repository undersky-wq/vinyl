import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
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
import { syncNotificationArtwork } from './src/lib/notification-artwork';
import { resolveOfflineTrack, warmOfflineAudioIndex, withCachedOfflineAudio } from './src/lib/offline-audio';
import { createPlaybackRequests, replaceQueueAroundActiveTrack } from './src/lib/playback-queue';
import { createRetriableResource, type RetriableResource } from './src/lib/retriable-resource';
import { colors, radius, spacing } from './src/theme';
import { AppLanguage, AuthUser, PlayerTrack, Playlist, Release, TabKey, Track } from './src/types';

type FavoriteTrack = Track & { release: Release };

declare const require: (path: string) => any;

const tabs: Array<{ key: TabKey; label: Record<AppLanguage, string>; Icon: typeof House }> = [
  { key: 'home', label: { en: 'Home', ru: 'Главная' }, Icon: House },
  { key: 'library', label: { en: 'Library', ru: 'Библиотека' }, Icon: Library },
  { key: 'playlists', label: { en: 'Playlists', ru: 'Плейлисты' }, Icon: ListMusic },
  { key: 'mixes', label: { en: 'Mixes', ru: 'Миксы' }, Icon: AudioLines },
  { key: 'favorites', label: { en: 'Likes', ru: 'Избранное' }, Icon: Heart },
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

function mergeFavoriteTrackIds(ids: Iterable<string>, tracks: FavoriteTrack[]) {
  return new Set([...ids, ...tracks.map((track) => track.id)]);
}

export default function App() {
  const [lang, setLang] = useState<AppLanguage>('en');
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
  const isHomeVisible = activeTab === 'home' && !activeRelease;
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
  const playbackRequestsRef = useRef(createPlaybackRequests());
  const playbackRequestIdRef = useRef(0);
  const pendingTrackIdRef = useRef<string | null>(null);
  const pendingQueueRef = useRef<PlayerTrack[] | null>(null);
  const queueLoaderRef = useRef<(() => Promise<PlayerTrack[]>) | undefined>(undefined);
  const playbackTransitionRef = useRef(false);
  const favoriteIdsResourceRef = useRef<RetriableResource | null>(null);
  const currentUserResourceRef = useRef<RetriableResource | null>(null);
  const playlistsResourceRef = useRef<RetriableResource | null>(null);
  const favoriteTracksResourceRef = useRef<RetriableResource | null>(null);

  if (!favoriteIdsResourceRef.current) {
    favoriteIdsResourceRef.current = createRetriableResource(getFavorites, (nextFavorites) => {
      setFavoriteIds(new Set(nextFavorites));
    });
  }
  if (!currentUserResourceRef.current) {
    currentUserResourceRef.current = createRetriableResource(getCurrentUser, setCurrentUser);
  }
  if (!playlistsResourceRef.current) {
    playlistsResourceRef.current = createRetriableResource(getPlaylists, setPlaylists);
  }
  if (!favoriteTracksResourceRef.current) {
    favoriteTracksResourceRef.current = createRetriableResource(getFavoriteTracks, (nextFavoriteTracks) => {
      setFavoriteTracks(nextFavoriteTracks);
      setFavoriteIds((current) => mergeFavoriteTrackIds(current, nextFavoriteTracks));
    });
  }

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
        autoUpdateMetadata: false,
        minBuffer: 8,
        maxBuffer: 30,
        playBuffer: 0.35,
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
      // Two UI updates per second keep the timer smooth enough without forcing
      // the entire React Native tree to reconcile four times per second.
      progressUpdateEventInterval: 0.5,
      color: 0xb578ff,
    });

    isTrackPlayerReadyRef.current = true;
  }

  function toTrackPlayerTrack(track: PlayerTrack): TrackPlayerTrack & { id: string } {
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

      return { ...track, ...refreshedTrack, coverUrl: track.coverUrl || refreshedTrack.coverUrl || '' };
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

  function updateLockScreenArtwork(track: PlayerTrack, request = playbackRequestIdRef.current) {
    if (!isNativeTrackPlayerAvailable() || !track.coverUrl) return;
    if (!playbackRequestsRef.current.isCurrent(request)) return;
    void syncNotificationArtwork().catch(() => undefined);
  }

  async function prepareQueue(nextQueue: PlayerTrack[], startTrackId: string, request = playbackRequestIdRef.current) {
    await ensureTrackPlayerReady();

    const selected = nextQueue.find((item) => item.id === startTrackId) || nextQueue[0];
    if (!selected) return false;
    const localTrack = await resolveOfflineTrack(selected);
    if (!playbackRequestsRef.current.isCurrent(request)) return false;
    const preparedQueue = mergeTrackById(nextQueue.map(withCachedOfflineAudio), localTrack);
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
      return true;
    }

    if (queueSignatureRef.current === queueSignature) {
      const currentNativeQueue = await TrackPlayer.getQueue();
      if (!playbackRequestsRef.current.isCurrent(request)) return false;
      if (currentNativeQueue.length === preparedQueue.length) {
        await TrackPlayer.skip(startIndex);
        return true;
      }
    }

    const trackPlayerQueue = preparedQueue.map(toTrackPlayerTrack);
    queueSignatureRef.current = queueSignature;
    await TrackPlayer.reset();
    if (!playbackRequestsRef.current.isCurrent(request)) return false;
    await TrackPlayer.add(trackPlayerQueue);
    if (!playbackRequestsRef.current.isCurrent(request)) return false;
    await TrackPlayer.skip(startIndex);
    return true;
  }

  async function replacePlaybackQueue(tracks: PlayerTrack[], preview: PlayerTrack[], request: number) {
    await playbackRequestsRef.current.run(request, async () => {
      const active = currentTrackRef.current;
      if (!active || !tracks.some((item) => item.id === active.id)) return;
      const prepared = mergeTrackById(tracks.map(withCachedOfflineAudio), active);
      pendingQueueRef.current = prepared;
      try {
        if (isNativeTrackPlayerAvailable()) {
          const replaced = await replaceQueueAroundActiveTrack(
            TrackPlayer,
            prepared.map(toTrackPlayerTrack),
            active.id,
            () => playbackRequestsRef.current.isCurrent(request),
          );
          if (!replaced) return;
        }
        if (!playbackRequestsRef.current.isCurrent(request)) return;
        queueRef.current = prepared;
        queueSignatureRef.current = prepared.map((item) => `${item.id}:${item.localAudioUrl || item.audioUrl}`).join('|');
        setQueue(prepared);
        const currentId = currentTrackRef.current?.id;
        setQueuePreview(preview.some((item) => item.id === currentId)
          ? mergeTrackById(preview, currentTrackRef.current || active)
          : prepared.filter((item) => item.releaseId === currentTrackRef.current?.releaseId));
      } finally {
        // If a native update was interrupted, retain the queue actually installed in Android.
        if (isNativeTrackPlayerAvailable() && playbackRequestsRef.current.isCurrent(request)) {
          const nativeQueue = await TrackPlayer.getQueue();
          const known = new Map([...queueRef.current, ...prepared].map((item) => [item.id, item]));
          const actual = nativeQueue.flatMap((item: TrackPlayerTrack) => {
            const match = known.get(String(item.id));
            return match ? [match] : [];
          });
          queueRef.current = actual;
          setQueue(actual);
        }
        pendingQueueRef.current = null;
      }
    });
  }

  async function extendPlaybackQueue(request: number, immediate: PlayerTrack[], preview: PlayerTrack[], loadQueue?: () => Promise<PlayerTrack[]>) {
    // This work starts only after play(). Failure must not interrupt the selected track.
    await warmOfflineAudioIndex();
    if (!playbackRequestsRef.current.isCurrent(request)) return;
    await replacePlaybackQueue(immediate, preview, request).catch((error) => console.warn('Page queue update failed', error));
    if (!loadQueue || !playbackRequestsRef.current.isCurrent(request)) return;
    try {
      const fullQueue = await loadQueue();
      if (playbackRequestsRef.current.isCurrent(request)) {
        await replacePlaybackQueue(fullQueue, preview, request);
      }
    } catch (error) {
      console.warn('Keeping current page queue; full queue unavailable', error);
    }
  }

  async function playTrack(track: PlayerTrack, nextQueue?: PlayerTrack[], nextQueuePreview?: PlayerTrack[], loadQueue?: () => Promise<PlayerTrack[]>) {
    const request = playbackRequestsRef.current.begin();
    const previousTrackId = currentTrackRef.current?.id;
    playbackRequestIdRef.current = request;
    queueLoaderRef.current = loadQueue;
    desiredPlayingRef.current = true;
    playbackTransitionRef.current = true;
    setIsPlaying(true);
    pendingTrackIdRef.current = isNativeTrackPlayerAvailable() && previousTrackId !== track.id ? track.id : null;
    currentTrackRef.current = track;
    queueRef.current = [track];
    positionMsRef.current = 0;
    lastNativePositionMsRef.current = 0;
    lastNativeProgressAtRef.current = Date.now();
    pendingSeekMsRef.current = null;
    isSeekingRef.current = false;
    const knownFavorite = favoriteTracks.find((favoriteTrack) => favoriteTrack.id === track.id);
    if (knownFavorite) {
      setFavoriteIds((current) => current.has(track.id)
        ? current
        : mergeFavoriteTrackIds(current, [knownFavorite]));
    }
    setCurrentTrack(track);
    setPositionMs(0);
    setDurationMs(track.durationSec ? track.durationSec * 1000 : 0);
    try {
      // Feed URLs are already playable. Refresh only missing URLs or on playback failure.
      const refreshedTrack = track.audioUrl || track.localAudioUrl ? track : await refreshPlaybackTrack(track);
      if (!playbackRequestsRef.current.isCurrent(request)) return;
      const playbackQueue = mergeTrackById(nextQueue?.length ? nextQueue : [track], refreshedTrack);
      const playbackPreview = mergeTrackById(
        nextQueuePreview?.length ? nextQueuePreview : nextQueue?.length ? nextQueue : [track],
        refreshedTrack,
      );
      setQueuePreview(playbackPreview);
      const started = await playbackRequestsRef.current.run(request, async () => {
        if (!await prepareQueue([refreshedTrack], refreshedTrack.id, request)) return false;
        if (!playbackRequestsRef.current.isCurrent(request)) return false;
        if (isNativeTrackPlayerAvailable() && desiredPlayingRef.current) await TrackPlayer.play();
        if (playbackRequestsRef.current.isCurrent(request)) {
          playbackTransitionRef.current = false;
          setIsPlaying(desiredPlayingRef.current);
          updateLockScreenArtwork(refreshedTrack, request);
        }
        lastNativeProgressAtRef.current = Date.now();
        return true;
      });
      if (started && playbackRequestsRef.current.isCurrent(request)) {
        void extendPlaybackQueue(request, playbackQueue, playbackPreview, loadQueue);
      }
    } catch (error) {
      if (!playbackRequestsRef.current.isCurrent(request)) return;
      if (pendingTrackIdRef.current === track.id) pendingTrackIdRef.current = null;
      playbackTransitionRef.current = false;
      setIsPlaying(false);
      console.warn('Failed to start playback', error);
      await recoverNativePlayback('start-playback-failed', track);
      if (playbackRequestsRef.current.isCurrent(request)) {
        void extendPlaybackQueue(request, nextQueue?.length ? nextQueue : [track], nextQueuePreview || [track], loadQueue);
      }
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
    const request = playbackRequestIdRef.current;
    const savedPositionMs = preferredTrack ? 0 : Math.max(0, positionMsRef.current - 600);
    const recoveryQueue = queueRef.current.length ? queueRef.current : [track];

    try {
      console.warn(`Recovering native playback: ${reason}`);
      await ensureTrackPlayerReady();
      const refreshedTrack = await refreshPlaybackTrack(track);
      if (!playbackRequestsRef.current.isCurrent(request)) return;
      if (currentTrackRef.current?.id !== track.id) return;
      const refreshedQueue = mergeTrackById(recoveryQueue, refreshedTrack);
      await playbackRequestsRef.current.run(request, async () => {
        syncRefreshedTrack(refreshedTrack);
        queueSignatureRef.current = '';
        if (!await prepareQueue(refreshedQueue, refreshedTrack.id, request)) return;
        if (!playbackRequestsRef.current.isCurrent(request)) return;
        if (savedPositionMs > 0) {
          await TrackPlayer.seekTo(savedPositionMs / 1000);
          positionMsRef.current = savedPositionMs;
          setPositionMs(savedPositionMs);
        }
        if (desiredPlayingRef.current) {
          await TrackPlayer.play();
          setIsPlaying(true);
        }
        lastNativeProgressAtRef.current = Date.now();
      });
    } catch (error) {
      console.warn('Native playback recovery failed', error);
      if (playbackRequestsRef.current.isCurrent(request)) setIsPlaying(false);
    } finally {
      recoveryInProgressRef.current = false;
    }
  }

  async function setTrackForPlayback(track: PlayerTrack) {
    await playTrack(track, queueRef.current, queuePreview, queueLoaderRef.current);
  }

  async function togglePlayback() {
    const next = !desiredPlayingRef.current;

    desiredPlayingRef.current = next;
    if (!next) playbackTransitionRef.current = false;
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
    void warmOfflineAudioIndex();

    if (!isNativeTrackPlayerAvailable()) {
      return;
    }

    const nativeEvent = Event as any;
    const nativeState = State as any;

    const progressSubscription = TrackPlayer.addEventListener(nativeEvent.PlaybackProgressUpdated, (event: any) => {
      // Android can emit one last progress event from the previous item while the
      // next item is loading. Keep the new track at zero until it becomes active.
      if (pendingTrackIdRef.current !== null) return;

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
        playbackTransitionRef.current = false;
        desiredPlayingRef.current = true;
        setIsPlaying(true);
        return;
      }

      if (event.state === nativeState.Paused || event.state === nativeState.Stopped || event.state === nativeState.Ended) {
        if (playbackTransitionRef.current && desiredPlayingRef.current) return;
        setIsPlaying(false);
      }
    });

    const activeTrackSubscription = TrackPlayer.addEventListener(nativeEvent.PlaybackActiveTrackChanged, async (event: any) => {
      // Inserting tracks before the playing item changes its index, not the playing item.
      const nextTrack = event.track?.id
        ? (pendingQueueRef.current || queueRef.current).find((item) => item.id === String(event.track.id))
        : null;

      if (nextTrack) {
        const pendingTrackId = pendingTrackIdRef.current;
        if (pendingTrackId !== null && pendingTrackId !== nextTrack.id) return;

        const confirmedPendingTrack = pendingTrackId === nextTrack.id;
        const changedTrack = currentTrackRef.current?.id !== nextTrack.id;
        if (confirmedPendingTrack) pendingTrackIdRef.current = null;
        currentTrackRef.current = nextTrack;
        lastTrackIdRef.current = nextTrack.id;
        setCurrentTrack(nextTrack);
        setDurationMs(nextTrack.durationSec ? nextTrack.durationSec * 1000 : 0);
        if (changedTrack || confirmedPendingTrack) {
          positionMsRef.current = 0;
          setPositionMs(0);
          pendingSeekMsRef.current = null;
          isSeekingRef.current = false;
        }
        // The background service owns notification metadata; this is only a
        // foreground sync request and does not replace the native queue item.
        updateLockScreenArtwork(nextTrack);
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
    void favoriteIdsResourceRef.current?.load();
    void currentUserResourceRef.current?.load();
    void playlistsResourceRef.current?.load();
    void favoriteTracksResourceRef.current?.load();
  }, []);

  useEffect(() => {
    if (activeTab === 'playlists' && !playlistsResourceRef.current?.hasLoaded()) {
      void playlistsResourceRef.current?.load();
    }
    if (activeTab === 'favorites') {
      if (!favoriteIdsResourceRef.current?.hasLoaded()) void favoriteIdsResourceRef.current?.load();
      if (!favoriteTracksResourceRef.current?.hasLoaded()) void favoriteTracksResourceRef.current?.load();
    }
  }, [activeTab]);

  async function refreshPersonalLibrary() {
    await Promise.allSettled([
      favoriteIdsResourceRef.current?.load(true),
      playlistsResourceRef.current?.load(true),
      favoriteTracksResourceRef.current?.load(true),
    ]);
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

  useEffect(() => {
    if (!activeRelease || isFullPlayerOpen) {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setActiveRelease(null);
      return true;
    });
    return () => subscription.remove();
  }, [activeRelease, isFullPlayerOpen]);

  function renderScreen() {
    if (activeRelease) {
      return (
        <ReleaseDetailScreen
          isAdmin={currentUser?.role === 'ADMIN'}
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
      return null;
    }

    if (activeTab === 'library') {
      return (
        <LibraryScreen
          lang={lang}
          onLanguageChange={setLang}
          isAdmin={currentUser?.role === 'ADMIN'}
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
          lang={lang}
          onLanguageChange={setLang}
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
          lang={lang}
          onLanguageChange={setLang}
          isAdmin={currentUser?.role === 'ADMIN'}
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
          lang={lang}
          onLanguageChange={setLang}
          activeTrackId={currentTrack?.id || null}
          avatarUrl={currentUser?.avatarStorageUrl}
          tracks={favoriteTracks}
          onPlayTrack={playTrack}
          onOpenProfile={() => setActiveTab('profile')}
          onRefresh={async () => {
            await refreshPersonalLibrary();
          }}
          showTrackMeta={showTrackMeta}
        />
      );
    }

    return (
      <ProfileScreen
        lang={lang}
        onLanguageChange={setLang}
        onAuthChange={setCurrentUser}
        showTrackMeta={showTrackMeta}
        onShowTrackMetaChange={setShowTrackMeta}
      />
    );
  }

  // Playback progress changes frequently. Keep the large lists underneath the
  // player mounted, but do not reconcile them for timer-only updates.
  const homeScreen = useMemo(
    () => (
      <HomeScreen
        lang={lang}
        onLanguageChange={setLang}
        isAdmin={currentUser?.role === 'ADMIN'}
        isActive={isHomeVisible && !isFullPlayerOpen}
        avatarUrl={currentUser?.avatarStorageUrl}
        onOpenProfile={() => setActiveTab('profile')}
        onOpenRelease={setActiveRelease}
      />
    ),
    [currentUser?.avatarStorageUrl, currentUser?.role, isFullPlayerOpen, isHomeVisible, lang],
  );
  const activeScreen = useMemo(
    () => renderScreen(),
    [
      activeRelease,
      activeTab,
      currentTrack?.id,
      currentUser,
      favoriteIds,
      favoriteTracks,
      isPlaying,
      lang,
      playlists,
      queue,
      queuePreview,
      showTrackMeta,
    ],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.root}>
        {/* Keep the same list and layout mounted so paginated data and scroll survive navigation. */}
        <View
          style={[styles.homeLayer, !isHomeVisible && styles.homeLayerHidden]}
          pointerEvents={isHomeVisible ? 'auto' : 'none'}
          accessibilityElementsHidden={!isHomeVisible}
          importantForAccessibility={isHomeVisible ? 'auto' : 'no-hide-descendants'}
        >
          {homeScreen}
        </View>
        {activeScreen}

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
                accessibilityRole="tab"
                accessibilityLabel={tab.label[lang]}
                accessibilityState={{ selected: active }}
              >
                <Icon
                  size={23}
                  strokeWidth={2.2}
                  color={active ? colors.accent : colors.muted}
                />
                <Text
                  style={[styles.tabLabel, active && styles.tabActive]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {tab.label[lang]}
                </Text>
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
  homeLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  homeLayerHidden: {
    opacity: 0,
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
    minWidth: 0,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: 16,
  },
  tabLabel: {
    alignSelf: 'stretch',
    color: colors.muted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  tabActiveBackground: {
    backgroundColor: 'rgba(181, 120, 255, 0.13)',
  },
  tabActive: {
    color: colors.accent,
  },
});
