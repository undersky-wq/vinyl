export type AudioFile = {
  id: string;
  storageUrl: string | null;
};

export type Track = {
  id: string;
  title: string;
  position: string | null;
  durationRaw: string | null;
  durationSec?: number | null;
  artists?: string[];
  audioFiles: AudioFile[];
  bpm?: number | null;
  key?: string | null;
  waveformData?: number[];
  release?: Release;
};

export type Release = {
  id: string;
  artist: string;
  title: string;
  year: number | null;
  country: string | null;
  styles: string[];
  coverStorageUrl: string | null;
  coverThumbStorageUrl?: string | null;
  coverMediumStorageUrl?: string | null;
  coverImageUrl: string | null;
  tracks: Track[];
};

export type PlaylistSummary = {
  id: string;
  name: string;
  description: string | null;
  _count: {
    items: number;
  };
};

export type Playlist = {
  id: string;
  name: string;
  description: string | null;
  items: Array<{
    track: Track;
  }>;
};

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: 'USER' | 'ADMIN';
  avatarStorageUrl?: string | null;
};

export type PlayerTrack = {
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  localAudioUrl?: string | null;
  coverUrl: string;
  durationRaw?: string | null;
  durationSec?: number | null;
};

export type TabKey = 'home' | 'library' | 'playlists' | 'favorites' | 'profile';
