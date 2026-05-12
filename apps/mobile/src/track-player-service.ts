import TrackPlayer, { Event } from 'react-native-track-player';

function safely(action: () => Promise<void>) {
  action().catch(() => {
    // Remote controls can fire at the beginning/end of the queue. Ignore that
    // instead of letting Android recreate the media session after an error.
  });
}

export async function playbackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    safely(() => TrackPlayer.play());
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    safely(() => TrackPlayer.pause());
  });

  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    safely(() => TrackPlayer.skipToNext());
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    safely(() => TrackPlayer.skipToPrevious());
  });

  TrackPlayer.addEventListener(Event.RemoteSkip, (event) => {
    safely(() => TrackPlayer.skip(event.index));
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, (event) => {
    safely(() => TrackPlayer.seekTo(event.position));
  });
}
