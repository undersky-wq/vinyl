import { useSyncExternalStore } from 'react';
let current = { id: '', positionMs: 0 };
const listeners = new Set<() => void>();
export function publishPlaybackPosition(id: string, positionMs: number) { current = { id, positionMs }; listeners.forEach(listener => listener()); }
export function usePlaybackPosition(id?: string) { return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => id === current.id ? current.positionMs : 0); }
