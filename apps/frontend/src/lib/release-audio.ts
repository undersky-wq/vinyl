type ReleaseAudioStatus = {
  audioComplete?: boolean;
  tracks?: Array<{ audioFiles: unknown[] }>;
};

// Audio records remain present even when the API hides playback URLs from guests.
// Prefer the server flag: library results may contain only a filtered subset of tracks.
export function isReleaseAudioComplete(release: ReleaseAudioStatus): boolean {
  const tracks = release.tracks ?? [];
  return release.audioComplete ?? (tracks.length > 0 && tracks.every((track) => track.audioFiles.length > 0));
}

const STATUS_KEY = 'vinyl-release-audio-status';

function readStatuses(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const value = JSON.parse(window.sessionStorage.getItem(STATUS_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function rememberReleaseAudioStatus(id: string, complete: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STATUS_KEY, JSON.stringify({ ...readStatuses(), [id]: complete }));
  } catch {
    // Storage may be disabled; the detail view still updates directly from its tracks.
  }
}

// Returning from an upload must not restore an outdated badge along with the saved scroll position.
export function restoreReleaseAudioStatuses<T extends { id: string; audioComplete?: boolean }>(releases: T[]): T[] {
  const statuses = readStatuses();
  return releases.map((release) => typeof statuses[release.id] === 'boolean'
    ? { ...release, audioComplete: statuses[release.id] }
    : release);
}
