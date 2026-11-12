type ReleaseIdentity = { artist: string; title: string; labels?: string[]; trackSearchText?: string; tracks: Array<{ title: string }>; isMix?: boolean };
export type ReleaseIdentityFilter = { field: 'artist' | 'label'; value: string };

export function releaseIdentityFilterFromParams(params: Pick<URLSearchParams, 'get'>): ReleaseIdentityFilter | null {
  const artist = params.get('artist')?.trim();
  const label = params.get('label')?.trim();
  return artist ? { field: 'artist', value: artist } : label ? { field: 'label', value: label } : null;
}

export function writeReleaseIdentityFilter(params: URLSearchParams, filter: ReleaseIdentityFilter | null) {
  params.delete('artist'); params.delete('label');
  if (filter) params.set(filter.field, filter.value);
}

export function sameReleaseIdentityFilter(left: ReleaseIdentityFilter | null, right: ReleaseIdentityFilter | null) {
  return left?.field === right?.field && (left?.value.trim().toLocaleLowerCase() || '') === (right?.value.trim().toLocaleLowerCase() || '');
}

export function matchesReleaseIdentity(release: ReleaseIdentity, filter: ReleaseIdentityFilter | null) {
  if (!filter) return true;
  const names = filter.field === 'artist' ? [release.artist] : release.labels || [];
  return !release.isMix && names.some(name => name.trim().toLocaleLowerCase() === filter.value.trim().toLocaleLowerCase());
}

export function releaseIdentityQuery(field: 'artist' | 'label', value: string) {
  return `${field}:${JSON.stringify(value.trim())}`;
}

export function parseReleaseIdentityQuery(query: string): { field: 'artist' | 'label'; value: string } | null {
  const scoped = /^(artist|label):("(?:[^"\\]|\\.)*")$/.exec(query.trim());
  if (scoped) {
    try {
      return { field: scoped[1] as 'artist' | 'label', value: (JSON.parse(scoped[2]) as string).trim() };
    } catch {
      // An incomplete search expression remains an ordinary text search.
    }
  }
  return null;
}

export function releaseSearchInput(query: string) {
  return parseReleaseIdentityQuery(query) ? '' : query;
}

export function matchesReleaseSearch(release: ReleaseIdentity, query: string) {
  const scoped = parseReleaseIdentityQuery(query);
  if (scoped) {
    return matchesReleaseIdentity(release, scoped);
  }
  const text = `${release.artist} ${release.title} ${(release.labels || []).join(' ')} ${release.trackSearchText || release.tracks.map(track => track.title).join(' ')}`.toLocaleLowerCase();
  return query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).every(word => text.includes(word));
}
