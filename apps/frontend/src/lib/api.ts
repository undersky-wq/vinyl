import {
  AuthUser,
  HomeRelease,
  HomeReleaseApi,
  LibraryFeedResponse,
  Playlist,
  PlaylistSummary,
  ProfileStats,
  Release,
  SearchSuggestion,
  Track,
  UserProfile,
} from '../types';
import type { PlayerTrack } from '../providers/player-provider';

const API_URL =
  typeof window === 'undefined'
    ? process.env.API_URL_INTERNAL || process.env.NEXT_PUBLIC_API_URL || 'http://backend:3001/api'
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

class NonRetriableApiError extends Error {}

export type AudioBackfillStatus = {
  id: string | null;
  status: 'idle' | 'running' | 'completed' | 'failed';
  total: number;
  processed: number;
  updated: number;
  waveformUpdated: number;
  skipped: number;
  failed: number;
  error?: string;
};

export type AudioNormalizeStatus = {
  id: string | null;
  status: 'idle' | 'running' | 'completed' | 'failed';
  total: number;
  processed: number;
  normalized: number;
  skipped: number;
  failed: number;
  error?: string;
};

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    return null as T;
  }

  return JSON.parse(text) as T;
}

async function getResponseErrorMessage(response: Response, fallback: string) {
  const text = await response.text();
  if (!text.trim()) {
    return fallback;
  }

  try {
    const payload = JSON.parse(text) as { message?: string | string[]; error?: string };
    if (Array.isArray(payload.message)) {
      return payload.message.join(', ');
    }
    return payload.message || payload.error || fallback;
  } catch {
    return text;
  }
}

async function fetchJson<T>(path: string, init?: RequestInit, retries = 2): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${API_URL}${path}`, {
        cache: 'no-store',
        credentials: 'include',
        ...init,
      });

      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          throw new NonRetriableApiError(`Request failed with status ${response.status}`);
        }

        throw new Error(`Request failed with status ${response.status}`);
      }

      return parseJsonResponse<T>(response);
    } catch (error) {
      lastError = error;
      if (error instanceof NonRetriableApiError) {
        break;
      }

      if (attempt < retries) {
        await delay(attempt * 1000);
      }
    }
  }

  throw lastError;
}

export async function getReleases(searchParams?: URLSearchParams, cookieHeader?: string) {
  const suffix = searchParams?.toString() ? `?${searchParams.toString()}` : '';
  return fetchJson<Release[]>(`/releases${suffix}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

export async function getLibraryReleasesFeed(searchParams?: URLSearchParams, cookieHeader?: string) {
  const suffix = searchParams?.toString() ? `?${searchParams.toString()}` : '';
  return fetchJson<LibraryFeedResponse>(`/releases/library-feed${suffix}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

function mapHomeRelease(release: HomeReleaseApi): HomeRelease {
  return {
    id: release.id,
    artist: release.artist,
    title: release.title,
    year: release.year,
    styles: release.styles,
    coverStorageUrl: release.coverStorageUrl,
    coverThumbStorageUrl: release.coverThumbStorageUrl,
    coverMediumStorageUrl: release.coverMediumStorageUrl,
    coverImageUrl: release.coverImageUrl,
    tracks: release.tracks
      .map((track) => ({
        id: track.id,
        title: track.title,
        audioUrl: track.audioFiles.find((file) => file.storageUrl)?.storageUrl || '',
      }))
      .filter((track) => Boolean(track.audioUrl)),
  };
}

export async function getHomeReleases(searchParams?: URLSearchParams, cookieHeader?: string) {
  const suffix = searchParams?.toString() ? `?${searchParams.toString()}` : '';
  const releases = await fetchJson<HomeReleaseApi[]>(`/releases${suffix}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });

  return releases.map(mapHomeRelease);
}

export async function getReleaseStyles(cookieHeader?: string) {
  return fetchJson<Array<{ name: string; count: number }>>('/releases/styles', {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

export async function getRelease(id: string, cookieHeader?: string) {
  return fetchJson<Release>(`/releases/${id}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

export async function getSearchSuggestions(search: string) {
  const params = new URLSearchParams();
  params.set('search', search);

  return fetchJson<SearchSuggestion[]>(`/releases/suggestions?${params.toString()}`);
}

export async function refreshPlayerTrack(trackId: string) {
  return fetchJson<PlayerTrack>(`/tracks/${trackId}/player`);
}

export async function getPlaylists(cookieHeader?: string) {
  return fetchJson<Playlist[]>('/playlists', {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

export async function getPlaylistSummaries(cookieHeader?: string) {
  return fetchJson<PlaylistSummary[]>('/playlists/summary', {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

export async function getPlaylist(playlistId: string, cookieHeader?: string) {
  return fetchJson<Playlist>(`/playlists/${playlistId}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

export async function getUsers(cookieHeader?: string) {
  return fetchJson<UserProfile[]>('/users', {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

export async function getCurrentUser(cookieHeader?: string) {
  return fetchJson<AuthUser | null>('/auth/me', {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

export async function getProfileStats(cookieHeader?: string) {
  return fetchJson<ProfileStats>('/auth/stats', {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

export async function getFavorites(cookieHeader?: string) {
  return fetchJson<string[]>('/favorites', {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

export async function getFavoriteTracks(cookieHeader?: string) {
  return fetchJson<Array<Track & { release: Release }>>('/favorites/tracks', {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

export async function postDiscogsSync() {
  const response = await fetch(`${API_URL}/discogs/sync`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error(await getResponseErrorMessage(response, 'Failed to sync Discogs'));
  }

  return parseJsonResponse(response);
}

export async function postAudioWaveformBackfill() {
  const response = await fetch(`${API_URL}/audio/backfill-durations`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error('Failed to backfill audio waveform');
  }

  return parseJsonResponse<{
    processed: number;
    updated: number;
    waveformUpdated: number;
    skipped: number;
    failed: number;
  }>(response);
}

export async function startAudioWaveformBackfill() {
  const response = await fetch(`${API_URL}/audio/backfill-durations/start`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error('Failed to start audio waveform backfill');
  }

  return parseJsonResponse<AudioBackfillStatus>(response);
}

export async function getAudioWaveformBackfillStatus() {
  return fetchJson<AudioBackfillStatus>('/audio/backfill-durations/status');
}

export async function startAudioNormalizeBackfill() {
  const response = await fetch(`${API_URL}/audio/normalize/start`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error('Failed to start audio normalization');
  }

  return parseJsonResponse<AudioNormalizeStatus>(response);
}

export async function getAudioNormalizeBackfillStatus() {
  return fetchJson<AudioNormalizeStatus>('/audio/normalize/status');
}

export async function createPlaylist(input: { name: string; description?: string; trackIds?: string[] }) {
  const response = await fetch(`${API_URL}/playlists`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error('Failed to create playlist');
  }

  return parseJsonResponse<Playlist>(response);
}

export async function addTrackToPlaylist(playlistId: string, trackId: string) {
  const response = await fetch(`${API_URL}/playlists/${playlistId}/items`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trackId }),
  });

  if (!response.ok) {
    throw new Error('Failed to add track to playlist');
  }

  return parseJsonResponse<Playlist>(response);
}

export async function removeTrackFromPlaylist(playlistId: string, trackId: string) {
  const response = await fetch(`${API_URL}/playlists/${playlistId}/items/${trackId}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to remove track from playlist');
  }

  return parseJsonResponse<Playlist>(response);
}

export async function updatePlaylist(playlistId: string, input: { name?: string; description?: string }) {
  const response = await fetch(`${API_URL}/playlists/${playlistId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error('Failed to update playlist');
  }

  return parseJsonResponse<Playlist>(response);
}

export async function reorderPlaylist(playlistId: string, trackIds: string[]) {
  const response = await fetch(`${API_URL}/playlists/${playlistId}/reorder`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trackIds }),
  });

  if (!response.ok) {
    throw new Error(await getResponseErrorMessage(response, 'Playlist reorder failed'));
  }

  return parseJsonResponse<Playlist>(response);
}

export async function uploadTrackAudio(trackId: string, file: File) {
  const payload = new FormData();
  payload.append('file', file);
  payload.append('trackId', trackId);

  const response = await fetch(`${API_URL}/audio/upload`, {
    method: 'POST',
    credentials: 'include',
    body: payload,
  });

  if (!response.ok) {
    throw new Error(await getResponseErrorMessage(response, 'File upload failed'));
  }

  return parseJsonResponse<{ id: string }>(response);
}

export async function createManualRelease(payload: FormData) {
  const response = await fetch(`${API_URL}/releases/manual`, {
    method: 'POST',
    credentials: 'include',
    body: payload,
  });

  if (!response.ok) {
    throw new Error(await getResponseErrorMessage(response, 'Manual release creation failed'));
  }

  return parseJsonResponse<Release>(response);
}

export async function deleteRelease(releaseId: string) {
  const response = await fetch(`${API_URL}/releases/${releaseId}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(await getResponseErrorMessage(response, 'Release delete failed'));
  }

  return parseJsonResponse<{ deleted: boolean }>(response);
}

export async function uploadReleaseCover(releaseId: string, file: File) {
  const payload = new FormData();
  payload.append('file', file);

  const response = await fetch(`${API_URL}/releases/${releaseId}/cover`, {
    method: 'POST',
    credentials: 'include',
    body: payload,
  });

  if (!response.ok) {
    throw new Error(await getResponseErrorMessage(response, 'Cover upload failed'));
  }

  return parseJsonResponse<Release>(response);
}

export async function updateReleaseStyles(releaseId: string, styles: string[]) {
  const response = await fetch(`${API_URL}/releases/${releaseId}/styles`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ styles }),
  });

  if (!response.ok) {
    throw new Error(await getResponseErrorMessage(response, 'Release styles update failed'));
  }

  return parseJsonResponse<Release>(response);
}

export async function updateTrackMetadata(
  trackId: string,
  input: { bpm?: number | null; key?: string | null; title?: string; artists?: string[] },
) {
  const response = await fetch(`${API_URL}/releases/tracks/${trackId}/metadata`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await getResponseErrorMessage(response, 'Track metadata update failed'));
  }

  return parseJsonResponse<Release['tracks'][number]>(response);
}

export async function deleteTrackAudio(audioId: string) {
  const response = await fetch(`${API_URL}/audio/${audioId}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('File delete failed');
  }

  return parseJsonResponse<{ deleted: boolean }>(response);
}

export async function registerUser(input: {
  email: string;
  password: string;
  displayName: string;
  inviteCode?: string;
}) {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error('Registration failed');
  }

  return parseJsonResponse<AuthUser>(response);
}

export async function loginUser(input: { email: string; password: string }) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error('Login failed');
  }

  return parseJsonResponse<AuthUser>(response);
}

export async function logoutUser() {
  const response = await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Logout failed');
  }

  return parseJsonResponse<{ ok: true }>(response);
}

export async function uploadAvatar(file: File) {
  const payload = new FormData();
  payload.append('file', file);

  const response = await fetch(`${API_URL}/auth/avatar`, {
    method: 'POST',
    credentials: 'include',
    body: payload,
  });

  if (!response.ok) {
    throw new Error('Avatar upload failed');
  }

  return parseJsonResponse<AuthUser>(response);
}

export async function toggleFavoriteTrack(trackId: string) {
  const response = await fetch(`${API_URL}/favorites`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trackId }),
  });

  if (!response.ok) {
    throw new Error('Favorite update failed');
  }

  return parseJsonResponse<{ active: boolean }>(response);
}
