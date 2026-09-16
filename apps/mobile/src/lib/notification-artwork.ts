import TrackPlayer from 'react-native-track-player';
import { getLockScreenArtworkUrl } from './artwork-cache';

let pending: Promise<void> | null = null;
let published = '';

// Owned by the playback service, so notification artwork also works while the UI
// is suspended. Never replace a playing queue item just to change its artwork:
// Android treats that as another item update and can clear the bitmap again.
export function syncNotificationArtwork(invalidate = false): Promise<void> {
  if (invalidate) published = '';
  if (pending) return pending;
  pending = (async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const track = await TrackPlayer.getActiveTrack();
      if (!track) { published = ''; return; }
      const coverUrl = typeof track.artwork === 'string' ? track.artwork : '';
      const signature = JSON.stringify([track.id, coverUrl, track.title, track.artist]);
      if (signature === published) return;
      const artwork = coverUrl ? await getLockScreenArtworkUrl(String(track.id), coverUrl) : undefined;
      const active = await TrackPlayer.getActiveTrack();
      if (active?.id !== track.id || active?.artwork !== track.artwork) continue;
      await TrackPlayer.updateNowPlayingMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration: track.duration,
        ...(artwork ? { artwork } : {}),
      });
      // A failed download may use the remote URL temporarily. Retry on the next
      // playback-state event instead of permanently marking that image cached.
      if (!coverUrl || artwork?.startsWith('file:') || artwork?.startsWith('content:')) {
        published = signature;
      }
      return;
    }
  })().finally(() => { pending = null; });
  return pending;
}
