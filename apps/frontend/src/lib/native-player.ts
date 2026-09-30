import type { PlayerTrack } from '../providers/player-provider';

export type NativePlayerState = {
  queue?: PlayerTrack[];
  displayIds?: string[];
  trackId?: string;
  position: number;
  duration: number;
  playing: boolean;
  shuffle: boolean;
  repeat: boolean;
  volume: number;
};

type NativeWindow = Window & {
  ReactNativeWebView?: { postMessage: (message: string) => void; injectedObjectJson?: () => string };
};

export function hasNativePlayer() {
  if (typeof window === 'undefined') return false;
  try {
    const bridge = (window as NativeWindow).ReactNativeWebView;
    return Boolean(bridge?.postMessage && JSON.parse(bridge.injectedObjectJson?.() || '{}').vinylPlayer === 1);
  } catch { return false; }
}

export function nativePlayerCommand(type: string, payload: Record<string, unknown> = {}) {
  (window as NativeWindow).ReactNativeWebView?.postMessage(JSON.stringify({
    channel: 'vinyl-player', version: 1, type, ...payload,
  }));
}
