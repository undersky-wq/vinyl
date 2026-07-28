import Constants from 'expo-constants';
import {
  AuthUser,
  PlayerTrack,
  Playlist,
  PlaylistSummary,
  ProfileStats,
  Release,
  TimelineComment,
  Track,
  UserProfile,
} from '../types';

const configuredApiUrl = Constants.expoConfig?.extra?.apiUrl;
const API_URL = typeof configuredApiUrl === 'string' ? configuredApiUrl : 'https://mityadima.ru/api';

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    return null as T;
  }

  return JSON.parse(text) as T;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return readJson<T>(response);
}

export function getCoverUrl(release: Release) {
  return (
    release.coverThumbStorageUrl ||
    release.coverMediumStorageUrl ||
    release.coverStorageUrl ||
    release.coverImageUrl ||
    'https://placehold.co/320x320/png'
  );
}

export async function getHomeReleases(
  limit = 24,
  offset = 0,
  filters: { style?: string; styles?: string[]; hasAudio?: boolean; search?: string } = {},
) {
  const params = new URLSearchParams({
    summary: 'true',
    limit: String(limit),
    offset: String(offset),
  });

  const styles = filters.styles?.length ? filters.styles : filters.style ? [filters.style] : [];

  if (styles.length) {
    params.set('style', styles.join(','));
  }

  if (filters.hasAudio) {
    params.set('hasAudio', 'true');
  }

  if (filters.search?.trim()) {
    params.set('search', filters.search.trim());
  }

  return fetchJson<Release[]>(`/releases?${params.toString()}`);
}

export async function getRelease(id: string) {
  return fetchJson<Release>(`/releases/${id}`);
}

export async function getReleaseTimelineComments(releaseId: string) {
  return fetchJson<TimelineComment[]>(`/releases/${releaseId}/comments`);
}

export async function createReleaseTimelineComment(
  releaseId: string,
  input: { second: number; text: string },
) {
  return fetchJson<TimelineComment>(`/releases/${releaseId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
}

export async function updateReleaseTimelineComment(
  releaseId: string,
  commentId: string,
  input: { text: string },
) {
  return fetchJson<TimelineComment>(`/releases/${releaseId}/comments/${commentId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
}

export async function deleteReleaseTimelineComment(releaseId: string, commentId: string) {
  return fetchJson<{ deleted: boolean }>(`/releases/${releaseId}/comments/${commentId}`, {
    method: 'DELETE',
  });
}

export async function getReleasesFiltered(
  limit = 40,
  offset = 0,
  filters: { styles?: string[]; hasAudio?: boolean } = {},
) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  if (filters.styles?.length) {
    params.set('style', filters.styles.join(','));
  }

  if (filters.hasAudio) {
    params.set('hasAudio', 'true');
  }

  return fetchJson<Release[]>(`/releases?${params.toString()}`);
}

export async function getReleaseStyles() {
  return fetchJson<Array<{ name: string; count: number }>>('/releases/styles');
}

export async function getPlayableReleaseStyles() {
  const feed = await getLibraryFeedFiltered(1, 0);
  return (feed.options?.styles || []).map((name) => ({ name, count: 0 }));
}

export async function getLibraryFeed(limit = 20, offset = 0) {
  return getLibraryFeedFiltered(limit, offset);
}

export async function getLibraryFeedFiltered(
  limit = 20,
  offset = 0,
  filters: { styles?: string[]; artist?: string; key?: string | string[]; search?: string; isMix?: boolean } = {},
) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  if (filters.styles?.length) {
    params.set('style', filters.styles.join(','));
  }

  if (filters.artist) {
    params.set('artist', filters.artist);
  }

  if (Array.isArray(filters.key) && filters.key.length) {
    params.set('key', filters.key.join(','));
  } else if (typeof filters.key === 'string' && filters.key) {
    params.set('key', filters.key);
  }

  if (filters.search) {
    params.set('search', filters.search);
  }

  if (typeof filters.isMix === 'boolean') {
    params.set('isMix', filters.isMix ? 'true' : 'false');
  }

  return fetchJson<{
    releases: Release[];
    total: number;
    totalTracks: number;
    hasMore: boolean;
    options: { styles: string[]; artists: string[]; keys: string[] };
  }>(
    `/releases/library-feed?${params.toString()}`,
  );
}

export async function getLibraryQueueFiltered(
  filters: { styles?: string[]; key?: string | string[]; search?: string } = {},
) {
  const params = new URLSearchParams();

  if (filters.styles?.length) {
    params.set('style', filters.styles.join(','));
  }

  if (Array.isArray(filters.key) && filters.key.length) {
    params.set('key', filters.key.join(','));
  } else if (typeof filters.key === 'string' && filters.key) {
    params.set('key', filters.key);
  }

  if (filters.search) {
    params.set('search', filters.search);
  }

  return fetchJson<PlayerTrack[]>(`/releases/library-queue?${params.toString()}`);
}

export async function refreshPlayerTrack(trackId: string) {
  return fetchJson<Partial<PlayerTrack> & { id: string; audioUrl: string }>(`/tracks/${trackId}/player`);
}

export async function getPlaylistSummaries() {
  return fetchJson<PlaylistSummary[]>('/playlists/summary');
}

export async function getPlaylists() {
  return fetchJson<Playlist[]>('/playlists');
}

export async function createPlaylist(input: { name: string; description?: string; trackIds?: string[] }) {
  return fetchJson<Playlist>('/playlists', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
}

export async function getFavoriteTracks() {
  return fetchJson<Array<Track & { release: Release }>>('/favorites/tracks');
}

export async function getFavorites() {
  return fetchJson<string[]>('/favorites');
}

export async function getProfileStats() {
  return fetchJson<ProfileStats>('/auth/stats');
}

export async function getUsers() {
  return fetchJson<UserProfile[]>('/users');
}

export type AudioJobStatus = {
  id: string | null;
  status: 'idle' | 'running' | 'completed' | 'failed';
  total: number;
  processed: number;
  updated?: number;
  waveformUpdated?: number;
  normalized?: number;
  skipped: number;
  failed: number;
  error?: string;
};

export async function postDiscogsSync() {
  return fetchJson<unknown>('/discogs/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
}

export async function startAudioWaveformBackfill() {
  return fetchJson<AudioJobStatus>('/audio/backfill-durations/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
}

export async function getAudioWaveformBackfillStatus() {
  return fetchJson<AudioJobStatus>('/audio/backfill-durations/status');
}

export async function startAudioNormalizeBackfill() {
  return fetchJson<AudioJobStatus>('/audio/normalize/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
}

export async function getAudioNormalizeBackfillStatus() {
  return fetchJson<AudioJobStatus>('/audio/normalize/status');
}

export async function toggleFavoriteTrack(trackId: string) {
  return fetchJson<{ active: boolean }>('/favorites', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trackId }),
  });
}

export async function addTrackToPlaylist(playlistId: string, trackId: string) {
  return fetchJson<Playlist>(`/playlists/${playlistId}/items`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trackId }),
  });
}

export async function removeTrackFromPlaylist(playlistId: string, trackId: string) {
  return fetchJson<Playlist>(`/playlists/${playlistId}/items/${trackId}`, {
    method: 'DELETE',
  });
}

export async function updatePlaylist(playlistId: string, input: { name?: string; description?: string }) {
  return fetchJson<Playlist>(`/playlists/${playlistId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
}

export async function reorderPlaylists(playlistIds: string[]) {
  return fetchJson<PlaylistSummary[]>('/playlists/reorder', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ playlistIds }),
  });
}

export async function getCurrentUser() {
  return fetchJson<AuthUser | null>('/auth/me');
}

export async function login(email: string, password: string) {
  return fetchJson<AuthUser>('/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
}

export async function register(input: {
  email: string;
  password: string;
  displayName: string;
  inviteCode: string;
}) {
  return fetchJson<AuthUser>('/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
}

export async function logout() {
  return fetchJson<{ ok: boolean }>('/auth/logout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
}
