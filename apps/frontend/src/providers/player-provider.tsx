'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { refreshPlayerTrack } from '../lib/api';
import { useAuth } from './auth-provider';
import { hasNativePlayer } from '../lib/native-player';
import { useNativePlayer } from './use-native-player';
import { isIOSWebKit, watchPersistentAudioStall } from '../lib/audio-stall-guard';
import { configureMusicAudioSession } from '../lib/music-audio-session';
import { getMediaArtwork, getMediaMetadataKey, startMediaArtworkUpdate } from '../lib/media-artwork-update';

export type PlayerTrack = {
  playbackSource?: { section: 'collection' | 'playlists' | 'mixes' | 'originals' | 'favorites'; name?: string };
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  coverUrl: string;
  coverFullUrl?: string;
  frontCoverUrl?: string;
  frontCoverFullUrl?: string;
  frontCoverMobileUrl?: string;
  backCoverUrl?: string;
  position?: string | null;
  coverSide?: 'front' | 'back';
  releaseId?: string;
  waveformData?: number[];
  isPublic?: boolean;
  isOriginal?: boolean;
};

export type PlayerContextType = {
  currentTrack: PlayerTrack | null;
  queue: PlayerTrack[];
  displayQueue: PlayerTrack[];
  currentIndex: number;
  isPlaying: boolean;
  progress: number;
  currentTime: number;
  duration: number;
  volume: number;
  isShuffleEnabled: boolean;
  isRepeatEnabled: boolean;
  canPlayPrevious: boolean;
  canPlayNext: boolean;
  playTrack: (track: PlayerTrack) => void;
  playQueue: (tracks: PlayerTrack[], startIndex?: number, displayTracks?: PlayerTrack[]) => void;
  prepareQueue: (tracks: PlayerTrack[], startIndex?: number, displayTracks?: PlayerTrack[]) => void;
  playQueueAtPercent: (tracks: PlayerTrack[], startIndex: number, percent: number) => void;
  replaceQueuePreservingCurrent: (tracks: PlayerTrack[], displayTracks?: PlayerTrack[]) => void;
  playPrevious: () => void;
  playNext: () => void;
  setVolume: (value: number) => void;
  seekToPercent: (percent: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  togglePlayback: () => void;
  getAudioElement: () => HTMLAudioElement | null;
};

const PlayerContext = createContext<PlayerContextType | null>(null);
const PlayerTransportContext = createContext<
  Pick<
    PlayerContextType,
    | 'currentTrack'
    | 'queue'
    | 'displayQueue'
    | 'currentIndex'
    | 'isPlaying'
    | 'volume'
    | 'isShuffleEnabled'
    | 'isRepeatEnabled'
    | 'canPlayPrevious'
    | 'canPlayNext'
  > | null
>(null);
const PlayerProgressContext = createContext<
  Pick<PlayerContextType, 'progress' | 'currentTime' | 'duration'> | null
>(null);
const PlayerActionsContext = createContext<
  Omit<
    PlayerContextType,
    | 'currentTrack'
    | 'queue'
    | 'displayQueue'
    | 'currentIndex'
    | 'isPlaying'
    | 'progress'
    | 'currentTime'
    | 'duration'
    | 'volume'
    | 'isShuffleEnabled'
    | 'isRepeatEnabled'
    | 'canPlayPrevious'
    | 'canPlayNext'
  > | null
>(null);
const PLAYER_STATE_KEY = 'vinyl-player-state';

let sharedAudio: HTMLAudioElement | null = null;
let sharedQueue: PlayerTrack[] = [];
let sharedDisplayQueue: PlayerTrack[] = [];
let sharedCurrentIndex = 0;
let sharedCurrentTrack: PlayerTrack | null = null;
let sharedVolume = 0.8;
let sharedIsShuffleEnabled = false;
let sharedIsRepeatEnabled = false;

function getSharedAudio() {
  if (!sharedAudio && typeof window !== 'undefined') {
    sharedAudio = new Audio();
    sharedAudio.preload = 'auto';
    sharedAudio.volume = sharedVolume;
  }

  return sharedAudio;
}

function readStoredState() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(PLAYER_STATE_KEY);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as {
      queue: PlayerTrack[];
      displayQueue?: PlayerTrack[];
      currentIndex: number;
      currentTrack: PlayerTrack | null;
      currentTime: number;
      volume?: number;
      isShuffleEnabled?: boolean;
      isRepeatEnabled?: boolean;
    };
  } catch {
    return null;
  }
}

function getRandomNextIndex(currentIndex: number, size: number) {
  if (size <= 1) {
    return currentIndex;
  }

  let nextIndex = currentIndex;
  while (nextIndex === currentIndex) {
    nextIndex = Math.floor(Math.random() * size);
  }

  return nextIndex;
}

function mergeTrackById(tracks: PlayerTrack[], nextTrack: PlayerTrack) {
  return tracks.map((track) => (track.id === nextTrack.id ? { ...track, ...nextTrack } : track));
}

function getReleaseScopedDisplayQueue(queue: PlayerTrack[], track: PlayerTrack) {
  if (!track.releaseId) {
    return null;
  }

  const releaseQueue = queue.filter((item) => item.releaseId === track.releaseId);
  return releaseQueue.length ? releaseQueue : null;
}

function getNextDisplayQueue(
  queue: PlayerTrack[],
  currentDisplayQueue: PlayerTrack[],
  track: PlayerTrack,
) {
  if (currentDisplayQueue.some((item) => item.id === track.id)) {
    return currentDisplayQueue;
  }

  return getReleaseScopedDisplayQueue(queue, track) || currentDisplayQueue;
}

function syncMediaPlaybackState(playing: boolean, hasTrack = true) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.playbackState = playing ? 'playing' : hasTrack ? 'paused' : 'none';
  } catch {
    // Media Session is optional; audio playback must continue without it.
  }
}

function updateMediaSessionPosition(audio: HTMLAudioElement | null) {
  if (
    typeof navigator === 'undefined' ||
    !('mediaSession' in navigator) ||
    !('setPositionState' in navigator.mediaSession) ||
    !audio ||
    !Number.isFinite(audio.duration) ||
    audio.duration <= 0
  ) {
    return;
  }

  try {
    navigator.mediaSession.setPositionState({
      duration: audio.duration,
      playbackRate: audio.playbackRate || 1,
      position: Math.min(audio.currentTime || 0, audio.duration),
    });
  } catch {
    // Position state is optional and stricter on some mobile browsers.
  }
}

function waitForArtwork(coverUrl: string, timeoutMs = 5000) {
  if (typeof window === 'undefined' || !coverUrl) {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    const image = new Image();
    let settled = false;

    const finish = (isReady: boolean) => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      resolve(isReady);
    };

    const timeoutId = window.setTimeout(() => finish(false), timeoutMs);

    image.onload = () => {
      if ('decode' in image) {
        image
          .decode()
          .then(() => finish(true))
          .catch(() => finish(true));
        return;
      }

      finish(true);
    };
    image.onerror = () => finish(false);
    image.src = coverUrl;
  });
}

async function safelyPlay(audio: HTMLAudioElement) {
  configureMusicAudioSession();
  try {
    await audio.play();
    return true;
  } catch (error) {
    console.warn('Audio playback failed', error);
    return false;
  }
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [native, setNative] = useState(false);
  useEffect(() => { setNative(hasNativePlayer()); }, []);
  return native ? <NativePlayerProvider>{children}</NativePlayerProvider> : <BrowserPlayerProvider>{children}</BrowserPlayerProvider>;
}

function NativePlayerProvider({ children }: { children: React.ReactNode }) {
  const value = useNativePlayer();
  return <PlayerTransportContext.Provider value={value}>
    <PlayerProgressContext.Provider value={value}>
      <PlayerActionsContext.Provider value={value}>
        <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
      </PlayerActionsContext.Provider>
    </PlayerProgressContext.Provider>
  </PlayerTransportContext.Provider>;
}

function BrowserPlayerProvider({ children }: { children: React.ReactNode }) {
  const { requirePlayback } = useAuth();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<PlayerTrack[]>(sharedQueue);
  const displayQueueRef = useRef<PlayerTrack[]>(sharedDisplayQueue);
  const currentIndexRef = useRef(sharedCurrentIndex);
  const currentTrackRef = useRef<PlayerTrack | null>(sharedCurrentTrack);
  const shuffleEnabledRef = useRef(sharedIsShuffleEnabled);
  const repeatEnabledRef = useRef(sharedIsRepeatEnabled);
  const pendingSeekPercentRef = useRef<number | null>(null);
  const recoveryInFlightRef = useRef(false);
  const playbackRequestedRef = useRef(false);
  const automaticStartRef = useRef<{ id: string; retries: number } | null>(null);
  const loadedTrackIdRef = useRef(sharedCurrentTrack?.id || '');
  const mediaMetadataKeyRef = useRef('');
  const mediaMetadataTimerRef = useRef<number | null>(null);
  const mediaPlayRef = useRef<() => void>(() => {});
  const mediaPauseRef = useRef<() => void>(() => {});
  const mediaPreviousRef = useRef<() => void>(() => {});
  const mediaNextRef = useRef<() => void>(() => {});
  const mediaSeekRef = useRef<(seekTime: number) => void>(() => {});
  const mediaSeekBackwardRef = useRef<() => void>(() => {});
  const mediaSeekForwardRef = useRef<() => void>(() => {});
  const [queue, setQueue] = useState<PlayerTrack[]>(sharedQueue);
  const [displayQueue, setDisplayQueue] = useState<PlayerTrack[]>(sharedDisplayQueue);
  const [currentIndex, setCurrentIndex] = useState(sharedCurrentIndex);
  const [currentTrack, setCurrentTrack] = useState<PlayerTrack | null>(sharedCurrentTrack);
  const [isPlaying, setIsPlaying] = useState(Boolean(sharedAudio && !sharedAudio.paused));
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(sharedAudio?.currentTime || 0);
  const [duration, setDuration] = useState(sharedAudio?.duration || 0);
  const [volume, setVolumeState] = useState(sharedAudio?.volume ?? sharedVolume);
  const [isShuffleEnabled, setIsShuffleEnabled] = useState(sharedIsShuffleEnabled);
  const [isRepeatEnabled, setIsRepeatEnabled] = useState(sharedIsRepeatEnabled);
  const persistedSecond = Math.floor(currentTime);

  function startQueuedTrack(index: number) {
    const track = queueRef.current[index];
    const audio = audioRef.current;
    if (!track || !audio) return;
    sharedCurrentIndex = index;
    sharedCurrentTrack = track;
    currentIndexRef.current = index;
    currentTrackRef.current = track;
    sharedDisplayQueue = getNextDisplayQueue(queueRef.current, displayQueueRef.current, track);
    displayQueueRef.current = sharedDisplayQueue;
    playbackRequestedRef.current = true;
    automaticStartRef.current = { id: track.id, retries: 0 };
    pendingSeekPercentRef.current = null;
    syncMediaPlaybackState(true);
    // Both system controls and ended events start audio without waiting for React.
    audio.src = track.audioUrl;
    loadedTrackIdRef.current = track.id;
    audio.currentTime = 0;
    void safelyPlay(audio);
    setCurrentTime(0);
    setProgress(0);
    setDuration(0);
    setCurrentIndex(index);
    setCurrentTrack(track);
    setDisplayQueue(sharedDisplayQueue);
  }

  useEffect(() => {
    const audio = getSharedAudio();
    if (!audio) {
      return;
    }

    audioRef.current = audio;

    if (!sharedCurrentTrack) {
      const stored = readStoredState();
      if (stored?.currentTrack) {
        sharedQueue = stored.queue || [];
        sharedDisplayQueue = stored.displayQueue || sharedQueue;
        sharedCurrentIndex = stored.currentIndex || 0;
        sharedCurrentTrack = stored.currentTrack;
        queueRef.current = sharedQueue;
        displayQueueRef.current = sharedDisplayQueue;
        currentIndexRef.current = sharedCurrentIndex;
        currentTrackRef.current = sharedCurrentTrack;
        setQueue(sharedQueue);
        setDisplayQueue(sharedDisplayQueue);
        setCurrentIndex(sharedCurrentIndex);
        setCurrentTrack(sharedCurrentTrack);

        if (audio.src !== stored.currentTrack.audioUrl) {
          audio.src = stored.currentTrack.audioUrl;
        }
        loadedTrackIdRef.current = stored.currentTrack.id;

        if (stored.currentTime > 0) {
          audio.currentTime = stored.currentTime;
        }

        if (typeof stored.volume === 'number') {
          sharedVolume = Math.max(0, Math.min(stored.volume, 1));
          audio.volume = sharedVolume;
          setVolumeState(sharedVolume);
        }

        if (typeof stored.isShuffleEnabled === 'boolean') {
          sharedIsShuffleEnabled = stored.isShuffleEnabled;
          shuffleEnabledRef.current = stored.isShuffleEnabled;
          setIsShuffleEnabled(stored.isShuffleEnabled);
        }

        if (typeof stored.isRepeatEnabled === 'boolean') {
          sharedIsRepeatEnabled = stored.isRepeatEnabled;
          repeatEnabledRef.current = stored.isRepeatEnabled;
          setIsRepeatEnabled(stored.isRepeatEnabled);
        }
      }
    }

    let countedRelease = '';
    let listeningSeconds = 0;
    let lastPlaybackTime = audio.currentTime;
    const newPlaySession = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), byte => byte.toString(16).padStart(2, '0')).join('');
    let playSession = newPlaySession();
    let playRecorded = false;
    let recordingPlay = false;
    const syncPlaybackState = () => {
      const music = currentTrackRef.current;
      if (music?.releaseId !== countedRelease) {
        countedRelease = music?.releaseId || '';
        listeningSeconds = 0;
        lastPlaybackTime = audio.currentTime;
        playSession = newPlaySession();
        playRecorded = false;
      }
      const delta = audio.currentTime - lastPlaybackTime;
      lastPlaybackTime = audio.currentTime;
      if (!audio.paused && !audio.seeking && delta > 0 && delta < 2) listeningSeconds += delta;
      if (music && (music.isPublic || music.isOriginal) && listeningSeconds >= 30 && !playRecorded && !recordingPlay) {
        recordingPlay = true;
        const id = countedRelease;
        const session = playSession;
        void import('../lib/music-engagement').then(module => module.recordMusicPlay(id, session))
          .then(() => { if (session === playSession) playRecorded = true; })
          .catch(() => undefined).finally(() => { recordingPlay = false; });
      }
      setCurrentTime(audio.currentTime || 0);

      if (!audio.duration || Number.isNaN(audio.duration)) {
        setDuration(0);
        setProgress(0);
        return;
      }

      setDuration(audio.duration);
      setProgress((audio.currentTime / audio.duration) * 100);
    };

    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      setCurrentTime(audio.currentTime || 0);

      if (
        pendingSeekPercentRef.current !== null &&
        Number.isFinite(audio.duration) &&
        audio.duration > 0
      ) {
        const normalizedPercent = Math.max(0, Math.min(pendingSeekPercentRef.current, 100));
        const nextTime = (audio.duration * normalizedPercent) / 100;
        if (typeof audio.fastSeek === 'function') {
          audio.fastSeek(nextTime);
        } else {
          audio.currentTime = nextTime;
        }
        setCurrentTime(nextTime);
        setProgress(normalizedPercent);
        pendingSeekPercentRef.current = null;
      }
    };

    const onPlay = () => {
      playbackRequestedRef.current = true;
      syncMediaPlaybackState(true);
      setIsPlaying(true);
    };

    const onPause = () => {
      // A media/network error can pause the element without a user pause.
      if (!audio.error && !audio.ended && !automaticStartRef.current) playbackRequestedRef.current = false;
      syncMediaPlaybackState(playbackRequestedRef.current && Boolean(automaticStartRef.current));
      setIsPlaying(false);
    };

    const onPlaying = () => { automaticStartRef.current = null; };
    const onCanPlay = () => {
      const pending = automaticStartRef.current;
      if (!pending || pending.id !== currentTrackRef.current?.id
        || !playbackRequestedRef.current || !audio.paused || pending.retries >= 2) return;
      pending.retries += 1;
      void safelyPlay(audio);
    };

    const onEnded = () => {
      const queueSize = queueRef.current.length;
      if (!queueSize) {
        playbackRequestedRef.current = false;
        setIsPlaying(false);
        setProgress(100);
        return;
      }

      let nextIndex = currentIndexRef.current + 1;

      if (repeatEnabledRef.current) {
        nextIndex = currentIndexRef.current;
      } else if (shuffleEnabledRef.current) {
        nextIndex = getRandomNextIndex(currentIndexRef.current, queueSize);
      } else if (nextIndex >= queueSize) {
        playbackRequestedRef.current = false;
        setIsPlaying(false);
        setProgress(100);
        return;
      }

      const nextTrack = queueRef.current[nextIndex];
      if (!nextTrack) {
        playbackRequestedRef.current = false;
        setIsPlaying(false);
        setProgress(100);
        return;
      }

      startQueuedTrack(nextIndex);
    };

    let disposed = false;
    let pendingRestore: (() => void) | null = null;
    const recoverCurrentTrack = async (forceReload = false) => {
      const audioElement = audioRef.current;
      const trackToRecover = currentTrackRef.current;
      if (!audioElement || !trackToRecover || recoveryInFlightRef.current) {
        return;
      }

      recoveryInFlightRef.current = true;
      const originalSource = audioElement.src;
      const originalTime = audioElement.currentTime;

      try {
        const refreshedTrack = await refreshPlayerTrack(trackToRecover.id);
        if (disposed || !refreshedTrack.audioUrl || currentTrackRef.current?.id !== trackToRecover.id
          || audioElement.src !== originalSource) {
          return;
        }
        // The network may have recovered while the refresh request was in flight.
        if (forceReload && !audioElement.error && (audioElement.paused || audioElement.ended
          || audioElement.seeking || audioElement.readyState >= 3
          || Math.abs(audioElement.currentTime - originalTime) > .1)) return;

        // Preserve the latest position, not the position before the API request.
        const resumeTime = audioElement.currentTime || 0;
        const shouldResume = playbackRequestedRef.current || (!audioElement.paused && !audioElement.ended);

        const nextTrack = { ...trackToRecover, ...refreshedTrack };
        const nextQueue = mergeTrackById(queueRef.current, nextTrack);
        const nextDisplayQueue = mergeTrackById(displayQueueRef.current, nextTrack);

        sharedCurrentTrack = nextTrack;
        currentTrackRef.current = nextTrack;
        sharedQueue = nextQueue;
        queueRef.current = nextQueue;
        sharedDisplayQueue = nextDisplayQueue;
        displayQueueRef.current = nextDisplayQueue;

        setCurrentTrack(nextTrack);
        setQueue(nextQueue);
        setDisplayQueue(nextDisplayQueue);

        const needsReload = audioElement.src !== nextTrack.audioUrl || Boolean(audioElement.error) || forceReload;
        if (needsReload) {
          audioElement.src = nextTrack.audioUrl;
          audioElement.load();
        }
        loadedTrackIdRef.current = nextTrack.id;

        // Refreshing metadata alone must not seek or restart a healthy stream.
        if (!needsReload) return;

        const restoreTime = () => {
          pendingRestore = null;
          if (disposed || currentTrackRef.current?.id !== trackToRecover.id
            || audioElement.src !== nextTrack.audioUrl) return;
          if (Number.isFinite(audioElement.duration) && audioElement.duration > 0) {
            audioElement.currentTime = Math.min(resumeTime, Math.max(audioElement.duration - 0.2, 0));
          } else {
            audioElement.currentTime = resumeTime;
          }
          setCurrentTime(audioElement.currentTime || resumeTime);
          if (Number.isFinite(audioElement.duration) && audioElement.duration > 0) {
            setProgress(((audioElement.currentTime || resumeTime) / audioElement.duration) * 100);
          }
        };

        if (audioElement.readyState >= 1) {
          restoreTime();
        } else {
          if (pendingRestore) audioElement.removeEventListener('loadedmetadata', pendingRestore);
          pendingRestore = restoreTime;
          audioElement.addEventListener('loadedmetadata', restoreTime, { once: true });
        }

        if (shouldResume) {
          void safelyPlay(audioElement);
        }
      } catch (error) {
        console.warn('Audio recovery failed', error);
      } finally {
        recoveryInFlightRef.current = false;
      }
    };

    const onError = () => {
      void recoverCurrentTrack();
      console.warn('Audio element error', audio.error);
    };

    const onStalled = () => {
      if (currentTrackRef.current && !audio.paused && !audio.ended) {
        void recoverCurrentTrack();
      }
    };

    const iosWebKit = isIOSWebKit(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
    const stopStallGuard = iosWebKit
      ? watchPersistentAudioStall(audio, () => void recoverCurrentTrack(true))
      : null;

    const syncAfterPageResume = () => {
      syncPlaybackState();
      setIsPlaying(!audio.paused && !audio.ended);

      if (audio.ended && currentTrackRef.current) {
        onEnded();
      }
    };

    audio.addEventListener('timeupdate', syncPlaybackState);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    if (!iosWebKit) audio.addEventListener('stalled', onStalled);
    window.addEventListener('pageshow', syncAfterPageResume);
    document.addEventListener('visibilitychange', syncAfterPageResume);

    syncPlaybackState();
    setIsPlaying(!audio.paused);

    return () => {
      disposed = true;
      stopStallGuard?.();
      if (pendingRestore) audio.removeEventListener('loadedmetadata', pendingRestore);
      audio.removeEventListener('timeupdate', syncPlaybackState);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('stalled', onStalled);
      window.removeEventListener('pageshow', syncAfterPageResume);
      document.removeEventListener('visibilitychange', syncAfterPageResume);
    };
  }, []);

  useEffect(() => {
    queueRef.current = queue;
    sharedQueue = queue;
  }, [queue]);

  useEffect(() => {
    displayQueueRef.current = displayQueue;
    sharedDisplayQueue = displayQueue;
  }, [displayQueue]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
    sharedCurrentIndex = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
    sharedCurrentTrack = currentTrack;
  }, [currentTrack]);

  useEffect(() => {
    if (!currentTrack) {
      return;
    }

    const trackToRefresh = currentTrack;
    let isCancelled = false;

    async function refreshSignedUrls() {
      try {
        const refreshedTrack = await refreshPlayerTrack(trackToRefresh.id);
        if (isCancelled || !refreshedTrack.audioUrl) {
          return;
        }

        const hasChanged =
          refreshedTrack.audioUrl !== trackToRefresh.audioUrl ||
          refreshedTrack.coverUrl !== trackToRefresh.coverUrl;

        if (!hasChanged) {
          return;
        }

        const nextTrack = { ...trackToRefresh, ...refreshedTrack };
        const nextQueue = mergeTrackById(queueRef.current, nextTrack);
        const nextDisplayQueue = mergeTrackById(displayQueueRef.current, nextTrack);

        sharedCurrentTrack = nextTrack;
        currentTrackRef.current = nextTrack;
        sharedQueue = nextQueue;
        queueRef.current = nextQueue;
        sharedDisplayQueue = nextDisplayQueue;
        displayQueueRef.current = nextDisplayQueue;

        setCurrentTrack(nextTrack);
        setQueue(nextQueue);
        setDisplayQueue(nextDisplayQueue);
      } catch {
        // Stored S3 signed URLs can expire; if refresh fails, keep playback state untouched.
      }
    }

    void refreshSignedUrls();

    return () => {
      isCancelled = true;
    };
  }, [currentTrack?.id]);

  useEffect(() => {
    shuffleEnabledRef.current = isShuffleEnabled;
    sharedIsShuffleEnabled = isShuffleEnabled;
  }, [isShuffleEnabled]);

  useEffect(() => {
    repeatEnabledRef.current = isRepeatEnabled;
    sharedIsRepeatEnabled = isRepeatEnabled;
  }, [isRepeatEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined' || !currentTrack) {
      return;
    }

    window.sessionStorage.setItem(
      PLAYER_STATE_KEY,
        JSON.stringify({
          queue,
          displayQueue,
          currentIndex,
          currentTrack,
          currentTime: persistedSecond,
          volume,
          isShuffleEnabled,
          isRepeatEnabled,
        }),
      );
  }, [queue, displayQueue, currentIndex, currentTrack, persistedSecond, volume, isShuffleEnabled, isRepeatEnabled]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) {
      return;
    }

    const sameTrackLoaded = loadedTrackIdRef.current === currentTrack.id && Boolean(audio.src);

    if (sameTrackLoaded) {
      return;
    }

    audio.src = currentTrack.audioUrl;
    loadedTrackIdRef.current = currentTrack.id;
    audio.currentTime = 0;
    setCurrentTime(0);
    setProgress(0);
    setDuration(0);

    void safelyPlay(audio);
  }, [currentTrack]);

  const setQueueState = (tracks: PlayerTrack[], startIndex = 0, displayTracks?: PlayerTrack[]) => {
    const playableTracks = tracks.filter((track) => Boolean(track.audioUrl));
    if (!playableTracks.length) {
      return null;
    }

    const safeIndex = Math.max(0, Math.min(startIndex, playableTracks.length - 1));
    const nextTrack = playableTracks[safeIndex];
    if (!requirePlayback(nextTrack.isPublic === true, nextTrack.isOriginal === true)) {
      return null;
    }

    sharedQueue = playableTracks;
    automaticStartRef.current = null;
    playbackRequestedRef.current = true;
    sharedDisplayQueue = (displayTracks || playableTracks).filter((track) => Boolean(track.audioUrl));
    sharedCurrentIndex = safeIndex;
    sharedCurrentTrack = nextTrack;
    queueRef.current = playableTracks;
    displayQueueRef.current = sharedDisplayQueue;
    currentIndexRef.current = safeIndex;
    currentTrackRef.current = nextTrack;

    setQueue(playableTracks);
    setDisplayQueue(sharedDisplayQueue);
    setCurrentIndex(safeIndex);
    setCurrentTrack(nextTrack);

    return nextTrack;
  };

  const playQueue = (tracks: PlayerTrack[], startIndex = 0, displayTracks?: PlayerTrack[]) => {
    setQueueState(tracks, startIndex, displayTracks);
  };

  const prepareQueue = (tracks: PlayerTrack[], startIndex = 0, displayTracks?: PlayerTrack[]) => {
    playbackRequestedRef.current = false;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
    }
    setIsPlaying(false);
    setQueueState(tracks, startIndex, displayTracks);
  };

  const playTrack = (track: PlayerTrack) => {
    playQueue([track], 0);
  };

  const playQueueAtPercent = (tracks: PlayerTrack[], startIndex: number, percent: number) => {
    pendingSeekPercentRef.current = Math.max(0, Math.min(percent, 100));
    playQueue(tracks, startIndex);
  };

  const replaceQueuePreservingCurrent = (tracks: PlayerTrack[], displayTracks?: PlayerTrack[]) => {
    const activeTrack = currentTrackRef.current;
    if (!activeTrack) {
      return;
    }

    const playableTracks = tracks.filter((track) => Boolean(track.audioUrl)).map(track => ({...track, playbackSource:track.playbackSource || activeTrack.playbackSource}));
    const nextIndex = playableTracks.findIndex((track) => track.id === activeTrack.id);
    if (nextIndex < 0) {
      return;
    }

    const requestedDisplayQueue = (displayTracks || playableTracks).filter((track) => Boolean(track.audioUrl));
    const nextDisplayQueue = requestedDisplayQueue.some((track) => track.id === activeTrack.id)
      ? requestedDisplayQueue
      : getReleaseScopedDisplayQueue(playableTracks, activeTrack) || playableTracks;

    sharedQueue = playableTracks;
    sharedDisplayQueue = nextDisplayQueue;
    sharedCurrentIndex = nextIndex;
    queueRef.current = playableTracks;
    displayQueueRef.current = nextDisplayQueue;
    currentIndexRef.current = nextIndex;

    setQueue(playableTracks);
    setDisplayQueue(nextDisplayQueue);
    setCurrentIndex(nextIndex);
  };

  const playNext = () => {
    const queueSize = queueRef.current.length;
    if (!queueSize) {
      return;
    }

    let nextIndex = currentIndexRef.current + 1;
    if (shuffleEnabledRef.current) {
      nextIndex = getRandomNextIndex(currentIndexRef.current, queueSize);
    } else if (nextIndex >= queueSize) {
      if (!repeatEnabledRef.current) {
        return;
      }

      nextIndex = 0;
    }

    const nextTrack = queueRef.current[nextIndex];
    if (!nextTrack) {
      return;
    }

    startQueuedTrack(nextIndex);
  };

  const playPrevious = () => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      setProgress(0);
      return;
    }

    const queueSize = queueRef.current.length;
    if (!queueSize) {
      return;
    }

    let previousIndex = currentIndexRef.current - 1;
    if (shuffleEnabledRef.current) {
      previousIndex = getRandomNextIndex(currentIndexRef.current, queueSize);
    } else if (previousIndex < 0) {
      if (!repeatEnabledRef.current) {
        return;
      }

      previousIndex = queueSize - 1;
    }

    const previousTrack = queueRef.current[previousIndex];
    if (!previousTrack) {
      return;
    }

    sharedCurrentIndex = previousIndex;
    sharedCurrentTrack = previousTrack;
    sharedDisplayQueue = getNextDisplayQueue(queueRef.current, displayQueueRef.current, previousTrack);
    currentIndexRef.current = previousIndex;
    currentTrackRef.current = previousTrack;
    displayQueueRef.current = sharedDisplayQueue;
    setCurrentIndex(previousIndex);
    setCurrentTrack(previousTrack);
    setDisplayQueue(sharedDisplayQueue);
  };

  const togglePlayback = () => {
    if (!requirePlayback(currentTrack?.isPublic === true, currentTrack?.isOriginal === true)) {
      return;
    }

    const audio = audioRef.current;
    if (!audio || !currentTrack) {
      return;
    }

    if (automaticStartRef.current || (!audio.paused && !audio.ended)) {
      automaticStartRef.current = null;
      playbackRequestedRef.current = false;
      audio.pause();
      return;
    }

    void safelyPlay(audio);
  };

  const getAudioElement = () => audioRef.current;

  const seekToPercent = (percent: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) {
      return;
    }

    const normalizedPercent = Math.max(0, Math.min(percent, 100));
    const nextTime = (audio.duration * normalizedPercent) / 100;
    if (typeof audio.fastSeek === 'function') {
      audio.fastSeek(nextTime);
    } else {
      audio.currentTime = nextTime;
    }
    setCurrentTime(nextTime);
    setProgress(normalizedPercent);
    updateMediaSessionPosition(audio);
  };

  const setVolume = (value: number) => {
    const audio = audioRef.current;
    const nextVolume = Math.max(0, Math.min(value, 1));
    sharedVolume = nextVolume;
    setVolumeState(nextVolume);

    if (audio) {
      audio.volume = nextVolume;
    }
  };

  const toggleShuffle = () => {
    const nextValue = !shuffleEnabledRef.current;
    shuffleEnabledRef.current = nextValue;
    sharedIsShuffleEnabled = nextValue;
    setIsShuffleEnabled(nextValue);
  };

  const toggleRepeat = () => {
    const nextValue = !repeatEnabledRef.current;
    repeatEnabledRef.current = nextValue;
    sharedIsRepeatEnabled = nextValue;
    setIsRepeatEnabled(nextValue);
  };

  const canPlayPrevious =
    queue.length > 1 &&
    (isShuffleEnabled || isRepeatEnabled || currentIndex > 0);
  const canPlayNext =
    queue.length > 1 &&
    (isShuffleEnabled || isRepeatEnabled || currentIndex < queue.length - 1);

  mediaPlayRef.current = () => {
    const audio = audioRef.current;
    if (audio) {
      void safelyPlay(audio);
    }
  };
  mediaPauseRef.current = () => {
    automaticStartRef.current = null;
    playbackRequestedRef.current = false;
    syncMediaPlaybackState(false);
    audioRef.current?.pause();
  };
  mediaPreviousRef.current = playPrevious;
  mediaNextRef.current = playNext;
  mediaSeekBackwardRef.current = playPrevious;
  mediaSeekForwardRef.current = playNext;
  mediaSeekRef.current = (seekTime: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seekTime)) {
      return;
    }

    const nextTime = Number.isFinite(audio.duration)
      ? Math.max(0, Math.min(seekTime, audio.duration))
      : Math.max(0, seekTime);

    if (typeof audio.fastSeek === 'function') {
      audio.fastSeek(nextTime);
    } else {
      audio.currentTime = nextTime;
    }
    setCurrentTime(nextTime);
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      setProgress((nextTime / audio.duration) * 100);
    }
    updateMediaSessionPosition(audio);
  };

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !currentTrack) {
      return;
    }

    const metadataKey = getMediaMetadataKey(currentTrack);
    if (mediaMetadataKeyRef.current === metadataKey) {
      return;
    }

    if (mediaMetadataTimerRef.current) {
      window.clearTimeout(mediaMetadataTimerRef.current);
    }

    const trackForMetadata = currentTrack;
    const waitMs = trackForMetadata.coverUrl ? 80 : 1200;
    let isCancelled = false;
    let stopArtworkUpdate: (() => void) | undefined;

    mediaMetadataTimerRef.current = window.setTimeout(() => {
      (() => {
        const latestTrack = currentTrackRef.current;
        if (
          isCancelled ||
          !latestTrack ||
          latestTrack.id !== trackForMetadata.id ||
          mediaMetadataKeyRef.current === metadataKey
        ) {
          return;
        }

        const coverUrl = latestTrack.coverUrl || trackForMetadata.coverUrl;
        stopArtworkUpdate = startMediaArtworkUpdate(coverUrl, () => {
          if (isCancelled || currentTrackRef.current?.id !== trackForMetadata.id) return;
          navigator.mediaSession.metadata = new MediaMetadata({
            title: latestTrack.title,
            artist: latestTrack.artist,
            album: 'Vinyl Collection',
            artwork: getMediaArtwork(coverUrl),
          });
          mediaMetadataKeyRef.current = metadataKey;
        }, waitForArtwork);
      })();
    }, waitMs);

    return () => {
      isCancelled = true;
      stopArtworkUpdate?.();
      if (mediaMetadataTimerRef.current) {
        window.clearTimeout(mediaMetadataTimerRef.current);
        mediaMetadataTimerRef.current = null;
      }
    };
  }, [currentTrack]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }

    syncMediaPlaybackState(isPlaying || (playbackRequestedRef.current && Boolean(automaticStartRef.current)), Boolean(currentTrack));
  }, [currentTrack, isPlaying]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }

    try {
      navigator.mediaSession.setActionHandler('play', () => mediaPlayRef.current());
      navigator.mediaSession.setActionHandler('pause', () => mediaPauseRef.current());
      navigator.mediaSession.setActionHandler('previoustrack', () => mediaPreviousRef.current());
      navigator.mediaSession.setActionHandler('nexttrack', () => mediaNextRef.current());
      navigator.mediaSession.setActionHandler('seekbackward', () => mediaSeekBackwardRef.current());
      navigator.mediaSession.setActionHandler('seekforward', () => mediaSeekForwardRef.current());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (typeof details.seekTime !== 'number') {
          return;
        }

        mediaSeekRef.current(details.seekTime);
      });
    } catch {
      // Some browsers expose Media Session partially.
    }

    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
        navigator.mediaSession.setActionHandler('seekto', null);
      } catch {
        // Ignore partial implementations during cleanup.
      }
    };
  }, []);

  useEffect(() => {
    updateMediaSessionPosition(audioRef.current);
  }, [currentTime, duration]);

  const transportValue = {
    currentTrack,
    queue,
    displayQueue,
    currentIndex,
    isPlaying,
    volume,
    isShuffleEnabled,
    isRepeatEnabled,
    canPlayPrevious,
    canPlayNext,
  };

  const progressValue = {
    progress,
    currentTime,
    duration,
  };

  const actionsValue = {
    playTrack,
    playQueue,
    prepareQueue,
    playQueueAtPercent,
    replaceQueuePreservingCurrent,
    playPrevious,
    playNext,
    setVolume,
    seekToPercent,
    toggleShuffle,
    toggleRepeat,
    togglePlayback,
    getAudioElement,
  };

  return (
    <PlayerTransportContext.Provider value={transportValue}>
      <PlayerProgressContext.Provider value={progressValue}>
        <PlayerActionsContext.Provider value={actionsValue}>
          <PlayerContext.Provider
            value={{
              ...transportValue,
              ...progressValue,
              ...actionsValue,
            }}
          >
            {children}
          </PlayerContext.Provider>
        </PlayerActionsContext.Provider>
      </PlayerProgressContext.Provider>
    </PlayerTransportContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used inside PlayerProvider');
  }
  return context;
}

export function usePlayerTransport() {
  const context = useContext(PlayerTransportContext);
  if (!context) {
    throw new Error('usePlayerTransport must be used inside PlayerProvider');
  }
  return context;
}

export function usePlayerProgress() {
  const context = useContext(PlayerProgressContext);
  if (!context) {
    throw new Error('usePlayerProgress must be used inside PlayerProvider');
  }
  return context;
}

export function usePlayerActions() {
  const context = useContext(PlayerActionsContext);
  if (!context) {
    throw new Error('usePlayerActions must be used inside PlayerProvider');
  }
  return context;
}
