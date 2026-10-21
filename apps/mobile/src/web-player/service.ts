import TrackPlayer, { Event } from 'react-native-track-player';
import { applyPendingSeek, notifyPlayer, recoverPlayback, serialize, skip } from './controller';
import { syncNotificationArtwork } from '../lib/notification-artwork';

export async function websitePlaybackService() {
  const safe = (action: () => Promise<unknown>) => { void serialize(action).catch(() => notifyPlayer()); };
  TrackPlayer.addEventListener(Event.RemotePlay, () => safe(() => TrackPlayer.play()));
  TrackPlayer.addEventListener(Event.RemotePause, () => safe(() => TrackPlayer.pause()));
  TrackPlayer.addEventListener(Event.RemoteNext, () => safe(() => skip(1)));
  TrackPlayer.addEventListener(Event.RemotePrevious, () => safe(() => skip(-1)));
  TrackPlayer.addEventListener(Event.RemoteSeek, event => safe(() => TrackPlayer.seekTo(event.position)));
  TrackPlayer.addEventListener(Event.RemoteStop, () => safe(() => TrackPlayer.stop()));
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, () => {
    safe(applyPendingSeek);
    notifyPlayer();
  });
  TrackPlayer.addEventListener(Event.PlaybackState, () => { safe(applyPendingSeek); notifyPlayer(); });
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, () => {
    void syncNotificationArtwork(true).catch(() => undefined);
    notifyPlayer();
  });
  TrackPlayer.addEventListener(Event.PlaybackError, () => safe(recoverPlayback));
}
