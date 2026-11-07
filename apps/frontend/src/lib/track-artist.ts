export function trackArtist(track: { artists?: readonly string[] | null }, releaseArtist: string): string {
  return track.artists?.map(artist => artist.trim()).filter(Boolean).join(', ') || releaseArtist;
}
