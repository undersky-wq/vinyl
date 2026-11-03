import type { PlayerTrack, Release } from '../types';

export function downloadArchiveItems(tracks: PlayerTrack[], search = ''): Release[] {
  const words = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return tracks.filter(track => words.every(word => `${track.artist} ${track.title}`.toLocaleLowerCase().includes(word))).map(track => ({
    id: track.releaseId || `download-${track.id}`, artist: track.artist, title: track.title,
    year: null, country: null, styles: [], isMix: track.isMix, isOriginal: track.isOriginal,
    coverStorageUrl: track.coverUrl || null, coverImageUrl: null,
    tracks: [{ id: track.id, title: track.title, artists: [track.artist], position: null,
      durationRaw: track.durationRaw || null, durationSec: track.durationSec,
      waveformData: track.waveformData || undefined,
      audioFiles: [{ id: `offline-${track.id}`, storageUrl: track.localAudioUrl || track.audioUrl }],
    }],
  }));
}
