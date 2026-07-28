import { registerRootComponent } from 'expo';
import App from './App';

try {
  const TrackPlayerModule = require('react-native-track-player');
  const TrackPlayer = TrackPlayerModule.default || TrackPlayerModule;

  if (TrackPlayer?.registerPlaybackService) {
    TrackPlayer.registerPlaybackService(() => require('./src/track-player-service').playbackService);
  }
} catch {
  // Expo Go does not include react-native-track-player. The custom APK does.
}

registerRootComponent(App);
