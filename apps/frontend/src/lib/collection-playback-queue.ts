import type { PlayerTrack } from '../providers/player-provider';

export function orderCollectionQueue(tracks: PlayerTrack[], releaseIds: string[]): PlayerTrack[] {
  const order = new Map(releaseIds.map((id, index) => [id, index]));
  return tracks.filter(track => track.audioUrl && track.releaseId && order.has(track.releaseId)).sort((a, b) =>
    order.get(a.releaseId!)! - order.get(b.releaseId!)!
    || (a.position || '').localeCompare(b.position || '', undefined, {numeric:true, sensitivity:'base'}),
  );
}
