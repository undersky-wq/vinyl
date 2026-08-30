import type { Release } from '../types';

// Library tracks are filtered, so the server flag takes precedence over the visible list.
export function isReleaseAudioComplete(release: Pick<Release, 'audioComplete' | 'tracks'>): boolean {
  return release.audioComplete ?? (
    release.tracks.length > 0 && release.tracks.every((track) => track.audioFiles.length > 0)
  );
}
