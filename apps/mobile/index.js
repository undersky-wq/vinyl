import TrackPlayer from 'react-native-track-player';
import { registerRootComponent } from 'expo';
import App from './App';

TrackPlayer.registerPlaybackService(() => require('./src/track-player-service').playbackService);

registerRootComponent(App);
