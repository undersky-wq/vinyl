type MembershipPlaylist = { id: string; items: Array<{ track: { id: string } }> };

export function playlistMembershipCounts(playlists: MembershipPlaylist[]) {
  const memberships = new Map<string, Set<string>>();
  for (const playlist of playlists) for (const item of playlist.items) {
    const ids = memberships.get(item.track.id) || new Set<string>();
    ids.add(playlist.id);
    memberships.set(item.track.id, ids);
  }
  return new Map(Array.from(memberships, ([id, lists]) => [id, lists.size]));
}
