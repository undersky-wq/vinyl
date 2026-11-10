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

export type ReleaseCoverVariants = {
  backCoverThumbUrl?: string | null;
  backCoverMediumUrl?: string | null;
  secondCoverThumbUrl?: string | null;
  secondCoverMediumUrl?: string | null;
  secondBackCoverThumbUrl?: string | null;
  secondBackCoverMediumUrl?: string | null;
};

export type Release = ReleaseCoverVariants & {
  id: string;
  audioComplete?: boolean;
  artist: string;
  title: string;
  year: number | null;
  country?: string | null;
  genres: string[];
  styles: string[];
  isMix?: boolean;
  isOriginal?: boolean;
  coverStorageUrl: string | null;
  coverThumbStorageUrl?: string | null;
  coverMediumStorageUrl?: string | null;
  coverImageUrl: string | null;
  backCoverUrl?: string | null;
  secondCoverUrl?: string | null;
  secondBackCoverUrl?: string | null;
  images?: Array<{
    id: string;
    type: 'COVER' | 'GALLERY';
    thumbUrl?: string | null;
    mediumUrl?: string | null;
    isBackCover?: boolean;
    isSecondFrontCover?: boolean;
    isSecondBackCover?: boolean;
    url: string;
    storageKey: string;
  }>;
  tracks: Track[];
};

export type HomeRelease = ReleaseCoverVariants & {
  tracksLoaded?: boolean;
  trackCount?: number;
  trackSearchText?: string;
  id: string;
  audioComplete?: boolean;
  artist: string;
  title: string;
  year: number | null;
  styles: string[];
  isMix?: boolean;
  isOriginal?: boolean;
  coverStorageUrl: string | null;
  coverThumbStorageUrl?: string | null;
  coverMediumStorageUrl?: string | null;
  coverImageUrl: string | null;
  backCoverUrl?: string | null;
  secondCoverUrl?: string | null;
  secondBackCoverUrl?: string | null;
  images?: Array<{
    id: string;
    type: 'COVER' | 'GALLERY';
    isBackCover?: boolean;
    thumbUrl?: string | null;
    mediumUrl?: string | null;
    isSecondFrontCover?: boolean;
    isSecondBackCover?: boolean;
    url: string;
    storageKey: string;
  }>;
  tracks: Array<{
    id: string;
    title: string;
    audioUrl: string;
    artists?: string[];
    bpm?: number | null;
    key?: string | null;
    position?: string | null;
    durationRaw?: string | null;
    durationSec?: number | null;
    waveformData?: number[] | null;
  }>;
};

export type HomeReleaseApi = ReleaseCoverVariants & {
  tracksLoaded?: boolean;
  trackCount?: number;
  trackSearchText?: string;
  id: string;
  audioComplete?: boolean;
  artist: string;
  title: string;
  year: number | null;
  styles: string[];
  isMix?: boolean;
  isOriginal?: boolean;
  coverStorageUrl: string | null;
  coverThumbStorageUrl?: string | null;
  coverMediumStorageUrl?: string | null;
  coverImageUrl: string | null;
  backCoverUrl?: string | null;
  secondCoverUrl?: string | null;
  secondBackCoverUrl?: string | null;
  images?: Array<{
    id: string;
    type: 'COVER' | 'GALLERY';
    isBackCover?: boolean;
    thumbUrl?: string | null;
    mediumUrl?: string | null;
    isSecondFrontCover?: boolean;
    isSecondBackCover?: boolean;
    url: string;
    storageKey: string;
  }>;
  tracks: Array<{
    id: string;
    title: string;
    bpm?: number | null;
    artists?: string[];
    key?: string | null;
    waveformData?: number[] | null;
    audioFiles: AudioFile[];
    position?: string | null;
    durationRaw?: string | null;
    durationSec?: number | null;
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
  likeCount?: number;
  likedByMe?: boolean;
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
  mixesCount: number;
  tracksCount: number;
  playlistsCount: number;
};

export type AuthSettings = {
  shelfShakeSensitivity?: number;
  shelfWaveEnabled?: boolean;
  shelfSpinEnabled?: boolean;
  shelfShuffleEnabled?: boolean;
  allowGuestMixPlayback?: boolean;
  playbackRequiresRegistration?: boolean;
  registrationInviteRequired: boolean;
  siteDesign: SiteDesign;
};

export type SiteDesign = 'classic' | 'shelf';

export type SiteSettings = {
  shelfShakeSensitivity?: number;
  shelfWaveEnabled?: boolean;
  shelfSpinEnabled?: boolean;
  shelfShuffleEnabled?: boolean;
  registrationInviteRequired?: boolean;
  allowGuestMixPlayback?: boolean;
  playbackRequiresRegistration?: boolean;
  siteDesign: SiteDesign;
};

export type LibraryFeedOptions = {
  styles: string[];
  artists: string[];
  keys: string[];
};

export type LibraryFeedResponse = {
  releases: Release[];
  total: number;
  collectionTotal?: number;
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
