import type { Playlist, Release } from '../types';

// Like the website, one sleeve represents one playlist entry, not one album.
export function playlistArchiveItems(playlist: Pick<Playlist, 'items'> | undefined, search = ''): Release[] {
  const words = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return (playlist?.items || []).map(({ track }) => {
    const release = track.release;
    return {
      ...release,
      id: release?.id || `missing-release-${track.id}`,
      artist: release?.artist || track.artists?.join(', ') || '',
      title: release?.title || track.title,
      year: release?.year ?? null, country: release?.country ?? null,
      styles: release?.styles || [], coverStorageUrl: release?.coverStorageUrl || null,
      coverImageUrl: release?.coverImageUrl || null, tracks: [release ? track : { ...track, audioFiles: [] }],
    };
  }).filter(release => words.every(word => `${release.artist} ${release.title} ${release.tracks[0].artists?.join(' ') || ''} ${release.tracks[0].title}`.toLocaleLowerCase().includes(word)));
}

export function archiveItemKey(release: Release, playlist: boolean) {
  return playlist ? `${release.id}:${release.tracks[0]?.id || ''}` : release.id;
}
