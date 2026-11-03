import type { PlayerTrack } from '../providers/player-provider';

export function canExtendCollectionQueue(activeTrack: PlayerTrack | null, initialTrackId: string, releaseIds: string[]): boolean {
  if (!activeTrack) return false;
  if (activeTrack.id === initialTrackId) return true;
  return activeTrack.playbackSource?.section === 'collection'
    && Boolean(activeTrack.releaseId && releaseIds.includes(activeTrack.releaseId));
}

export function orderCollectionQueue(tracks: PlayerTrack[], releaseIds: string[]): PlayerTrack[] {
  const order = new Map(releaseIds.map((id, index) => [id, index]));
  return tracks.filter(track => track.audioUrl && track.releaseId && order.has(track.releaseId)).sort((a, b) =>
    order.get(a.releaseId!)! - order.get(b.releaseId!)!
    || (a.position || '').localeCompare(b.position || '', undefined, {numeric:true, sensitivity:'base'}),
  );
}

export function liveCollectionQueue(tracks: PlayerTrack[], releaseIds: string[], activeTrack: PlayerTrack, href?: string): PlayerTrack[] {
  const ordered = orderCollectionQueue(tracks, releaseIds).map(track => ({
    ...track, playbackSource: { ...activeTrack.playbackSource, section: 'collection' as const, ...(href ? {href} : {}) },
  }));
  // Keep an excluded playing track only as an anchor; never interrupt its audio.
  return ordered.some(track => track.id === activeTrack.id) ? ordered : [{ ...activeTrack, playbackSource:{...activeTrack.playbackSource,section:'collection',...(href?{href}:{})}, queueAnchorOnly: true }, ...ordered];
}
