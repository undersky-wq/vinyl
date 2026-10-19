import type { HomeRelease } from '../types';
import type { PlayerTrack } from '../providers/player-provider';

export function musicPageQueue(releases: HomeRelease[]): PlayerTrack[] {
  return releases.flatMap(release => release.tracks.filter(track => track.audioUrl).map(track => ({
    ...track,
    waveformData: track.waveformData || [],
    artist: release.artist,
    coverUrl: release.coverMediumStorageUrl || release.coverThumbStorageUrl || release.coverStorageUrl || release.coverImageUrl || '/icon.png',
    coverFullUrl: release.coverStorageUrl || release.coverImageUrl || release.coverMediumStorageUrl || '/icon.png',
    releaseId: release.id,
    isPublic: Boolean(release.isMix),
    isOriginal: release.isOriginal,
  })));
}
