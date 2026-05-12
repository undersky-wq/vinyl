const fs = require('fs');
const path = require('path');

const musicModulePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-track-player',
  'android',
  'src',
  'main',
  'java',
  'com',
  'doublesymmetry',
  'trackplayer',
  'module',
  'MusicModule.kt',
);

if (!fs.existsSync(musicModulePath)) {
  console.warn('[patch-track-player] MusicModule.kt not found, skipping patch.');
  process.exit(0);
}

let source = fs.readFileSync(musicModulePath, 'utf8');
const before = source;

source = source
  .replace(
    'Arguments.fromBundle(musicService.tracks[index].originalItem)',
    'Arguments.fromBundle(musicService.tracks[index].originalItem ?: Bundle())',
  )
  .replace(
    'Arguments.fromBundle(\n                musicService.tracks[musicService.getCurrentTrackIndex()].originalItem\n            )',
    'Arguments.fromBundle(\n                musicService.tracks[musicService.getCurrentTrackIndex()].originalItem ?: Bundle()\n            )',
  );

if (source !== before) {
  fs.writeFileSync(musicModulePath, source);
  console.log('[patch-track-player] Patched react-native-track-player for React Native 0.81.');
} else {
  console.log('[patch-track-player] Patch already applied or upstream changed.');
}
