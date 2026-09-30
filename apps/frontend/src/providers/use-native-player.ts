'use client';

import { useEffect, useRef, useState } from 'react';
import { nativePlayerCommand, type NativePlayerState } from '../lib/native-player';
import { useAuth } from './auth-provider';
import type { PlayerContextType, PlayerTrack } from './player-provider';

// Android owns the queue and the clock, including while the WebView is asleep.
export function useNativePlayer(): PlayerContextType {
  const { requirePlayback } = useAuth();
  const [state, setState] = useState<NativePlayerState>({
    queue: [], displayIds: [], position: 0, duration: 0, playing: false,
    shuffle: false, repeat: false, volume: .8,
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Waveform components consume timeupdate/seeked and these read-only values.
    // This element never receives a source and cannot produce duplicate audio.
    const audio = new Audio();
    Object.defineProperties(audio, {
      currentTime: { get: () => stateRef.current.position, set: (position: number) => nativePlayerCommand('seek', { position }) },
      duration: { get: () => stateRef.current.duration },
      paused: { get: () => !stateRef.current.playing },
    });
    audioRef.current = audio;
    const receive = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.channel !== 'vinyl-player' || detail.version !== 1 || detail.type !== 'state') return;
      setState(previous => ({ ...previous, ...detail.state }));
    };
    const sync = () => nativePlayerCommand('sync');
    window.addEventListener('vinyl-native-player', receive);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pageshow', sync);
    sync();
    return () => {
      window.removeEventListener('vinyl-native-player', receive);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('pageshow', sync);
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    audioRef.current?.dispatchEvent(new Event('loadedmetadata'));
    audioRef.current?.dispatchEvent(new Event('timeupdate'));
    audioRef.current?.dispatchEvent(new Event('seeked'));
  }, [state.position, state.duration, state.trackId]);

  const queue = state.queue || [];
  const currentIndex = Math.max(0, queue.findIndex(track => track.id === state.trackId));
  const currentTrack = queue.find(track => track.id === state.trackId) || null;
  const displayQueue = queue.filter(track => state.displayIds?.includes(track.id));
  const setQueue = (tracks: PlayerTrack[], index = 0, displayTracks?: PlayerTrack[], autoplay = true, percent = 0, preserve = false) => {
    const playable = tracks.filter(track => track.audioUrl);
    if (!playable.length || !requirePlayback()) return;
    nativePlayerCommand('queue', {
      tracks: playable, index: Math.max(0, Math.min(index, playable.length - 1)),
      displayIds: (displayTracks || playable).map(track => track.id), autoplay, percent, preserve,
    });
  };

  return {
    queue, displayQueue: displayQueue.length ? displayQueue : queue, currentIndex, currentTrack,
    isPlaying: state.playing, currentTime: state.position, duration: state.duration,
    progress: state.duration > 0 ? Math.min(100, state.position / state.duration * 100) : 0,
    volume: state.volume, isShuffleEnabled: state.shuffle, isRepeatEnabled: state.repeat,
    canPlayPrevious: Boolean(currentTrack && (state.position > 3 || currentIndex > 0 || state.shuffle || state.repeat)),
    canPlayNext: Boolean(currentTrack && (currentIndex < queue.length - 1 || state.shuffle || state.repeat)),
    playTrack: track => setQueue([track]),
    playQueue: (tracks, index, display) => setQueue(tracks, index, display),
    prepareQueue: (tracks, index, display) => setQueue(tracks, index, display, false),
    playQueueAtPercent: (tracks, index, percent) => setQueue(tracks, index, undefined, true, percent),
    replaceQueuePreservingCurrent: (tracks, display) => {
      const index = tracks.findIndex(track => track.id === currentTrack?.id);
      if (index >= 0) setQueue(tracks, index, display, state.playing, 0, true);
    },
    playPrevious: () => nativePlayerCommand('previous'),
    playNext: () => nativePlayerCommand('next'),
    setVolume: value => nativePlayerCommand('volume', { value }),
    seekToPercent: percent => nativePlayerCommand('seek', { percent }),
    toggleShuffle: () => nativePlayerCommand('shuffle', { value: !state.shuffle }),
    toggleRepeat: () => nativePlayerCommand('repeat', { value: !state.repeat }),
    togglePlayback: () => {
      if (currentTrack && requirePlayback()) nativePlayerCommand(state.playing ? 'pause' : 'play');
    },
    getAudioElement: () => audioRef.current,
  };
}
