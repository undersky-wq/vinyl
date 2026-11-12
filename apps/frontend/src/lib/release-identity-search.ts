type ReleaseIdentity = { artist: string; title: string; labels?: string[]; trackSearchText?: string; tracks: Array<{ title: string }>; isMix?: boolean };

export function releaseIdentityQuery(field: 'artist' | 'label', value: string) {
  return `${field}:${JSON.stringify(value.trim())}`;
}

export function matchesReleaseSearch(release: ReleaseIdentity, query: string) {
  const scoped = /^(artist|label):("(?:[^"\\]|\\.)*")$/.exec(query.trim());
  if (scoped) {
    try {
      const value = (JSON.parse(scoped[2]) as string).trim().toLocaleLowerCase();
      const names = scoped[1] === 'artist' ? [release.artist] : release.labels || [];
      return !release.isMix && names.some(name => name.trim().toLocaleLowerCase() === value);
    } catch {
      // An incomplete search expression remains an ordinary text search.
    }
  }
  const text = `${release.artist} ${release.title} ${(release.labels || []).join(' ')} ${release.trackSearchText || release.tracks.map(track => track.title).join(' ')}`.toLocaleLowerCase();
  return query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).every(word => text.includes(word));
}
