export type AudioFile = {
  id: string;
  storageUrl: string | null;
  normalizedStorageUrl?: string | null;
};

export type Track = {
  id: string;
  position: string | null;
  title: string;
  durationRaw: string | null;
  durationSec?: number | null;
  artists: string[];
  bpm: number | null;
  key: string | null;
  waveformData?: number[] | null;
  audioFiles: AudioFile[];
  storeLinks?: Array<{
    id: string;
    title: string;
    url: string;
    storeName: string;
  }>;
};

export type Release = {
  id: string;
  artist: string;
  title: string;
  year: number | null;
  country?: string | null;
  genres: string[];
  styles: string[];
  isMix?: boolean;
  coverStorageUrl: string | null;
  coverThumbStorageUrl?: string | null;
  coverMediumStorageUrl?: string | null;
  coverImageUrl: string | null;
  images?: Array<{
    id: string;
    type: 'COVER' | 'GALLERY';
    url: string;
    storageKey: string;
  }>;
  tracks: Track[];
};

export type HomeRelease = {
  id: string;
  artist: string;
  title: string;
  year: number | null;
  styles: string[];
  isMix?: boolean;
  coverStorageUrl: string | null;
  coverThumbStorageUrl?: string | null;
  coverMediumStorageUrl?: string | null;
  coverImageUrl: string | null;
  tracks: Array<{
    id: string;
    title: string;
    audioUrl: string;
  }>;
};

export type HomeReleaseApi = {
  id: string;
  artist: string;
  title: string;
  year: number | null;
  styles: string[];
  isMix?: boolean;
  coverStorageUrl: string | null;
  coverThumbStorageUrl?: string | null;
  coverMediumStorageUrl?: string | null;
  coverImageUrl: string | null;
  tracks: Array<{
    id: string;
    title: string;
    audioFiles: AudioFile[];
  }>;
};

export type Playlist = {
  id: string;
  name: string;
  description: string | null;
  sortOrder?: number;
  items: Array<{
    id: string;
    sortOrder: number;
    track: Track & {
      release: Release;
    };
  }>;
};

export type PlaylistSummary = {
  id: string;
  name: string;
  description: string | null;
  sortOrder?: number;
  _count: {
    items: number;
  };
};

export type UserProfile = {
  id: string;
  email: string | null;
  displayName: string;
  discogsUsername: string | null;
  role: 'USER' | 'ADMIN';
  avatarStorageKey?: string | null;
  avatarStorageUrl?: string | null;
  createdAt: string;
  _count: {
    collectionItems: number;
    playlists: number;
    audioFiles: number;
    favoriteTracks: number;
  };
};

export type AuthUser = {
  id: string;
  email: string | null;
  displayName: string;
  discogsUsername: string | null;
  role: 'USER' | 'ADMIN';
  avatarStorageKey?: string | null;
  avatarStorageUrl?: string | null;
  createdAt: string;
};

export type TimelineComment = {
  id: string;
  releaseId: string;
  userId: string;
  second: number;
  text: string;
  createdAt: string;
  user: {
    id: string;
    displayName: string;
    avatarStorageUrl?: string | null;
  };
};

export type ProfileStats = {
  releasesCount: number;
  tracksCount: number;
  playlistsCount: number;
};

export type LibraryFeedOptions = {
  styles: string[];
  artists: string[];
  keys: string[];
};

export type LibraryFeedResponse = {
  releases: Release[];
  total: number;
  totalTracks: number;
  hasMore: boolean;
  options: LibraryFeedOptions;
};

export type SearchSuggestion = {
  id: string;
  label: string;
  meta: string;
  type: 'artist' | 'release' | 'track';
  search: string;
  releaseId?: string;
};
