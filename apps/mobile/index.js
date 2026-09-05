import 'react-native-gesture-handler';
import React from 'react';
import { registerRootComponent } from 'expo';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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

function Root() {
  return React.createElement(
    GestureHandlerRootView,
    { style: { flex: 1 } },
    React.createElement(App),
  );
}

registerRootComponent(Root);
