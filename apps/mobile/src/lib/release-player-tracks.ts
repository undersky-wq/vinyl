import { getCoverUrl } from './api';
import type { PlayerTrack, Release } from '../types';

export function buildPlayableReleaseTracks(release: Release): PlayerTrack[] {
  return release.tracks.flatMap(track => {
    const audioUrl = track.audioFiles.find(file => file.storageUrl)?.storageUrl;
    if (!audioUrl) return [];
    return [{ id: track.id, title: track.title, artist: track.artists?.length ? track.artists.join(', ') : release.artist,
      audioUrl, coverUrl: getCoverUrl(release), releaseId: release.id, durationRaw: track.durationRaw,
      durationSec: track.durationSec, waveformData: track.waveformData, isMix: Boolean(release.isMix) }];
  });
}
