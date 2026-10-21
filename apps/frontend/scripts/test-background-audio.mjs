import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { configureMusicAudioSession } from '../src/lib/music-audio-session.ts';

assert.equal(configureMusicAudioSession({}), false);
assert.equal(configureMusicAudioSession({ audioSession: { type: 'auto' } }), true);
const session = { type: 'auto' };
configureMusicAudioSession({ audioSession: session });
assert.equal(session.type, 'playback');
assert.equal(configureMusicAudioSession({ get audioSession() { throw Error('unavailable'); } }), false);
assert.equal(configureMusicAudioSession({ audioSession: Object.freeze({ type: 'auto' }) }), false);
let writes = 0;
configureMusicAudioSession({ audioSession: { get type() { return 'playback'; }, set type(value) { writes++; } } });
assert.equal(writes, 0, 'do not reactivate an already configured session');

// Execute the real ended handler without React rendering or running effects.
const source = readFileSync(new URL('../src/providers/player-provider.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('player.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
const eventHandlers = {};
let randomNextSource;
let startQueuedSource;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'startQueuedTrack') startQueuedSource = node.getText(ast);
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'getRandomNextIndex') randomNextSource = node.getText(ast);
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'onEnded') handler = node.initializer.getText(ast);
  if (ts.isVariableDeclaration(node) && ['onPause', 'onCanPlay', 'onPlaying', 'playNext'].includes(node.name.getText(ast))) eventHandlers[node.name.getText(ast)] = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(handler);
const tracks = [{ id: 'first', audioUrl: 'first.mp3' }, { id: 'second', audioUrl: 'second.mp3' }];
function fixture(index, repeat = false, shuffle = false, next = handler) {
  const calls = [];
  const context = {
    audio: { src: tracks[index].audioUrl, currentTime: 30 },
    queueRef: { current: tracks }, currentIndexRef: { current: index }, currentTrackRef: { current: tracks[index] },
    displayQueueRef: { current: tracks }, shuffleEnabledRef: { current: shuffle }, repeatEnabledRef: { current: repeat },
    loadedTrackIdRef: { current: tracks[index].id },
    playbackRequestedRef: { current: false }, pendingSeekPercentRef: { current: 80 },
    automaticStartRef: { current: null },
    syncMediaPlaybackState: playing => { context.mediaPlaying = playing; },
    getNextDisplayQueue: queue => queue,
    getRandomNextIndex: vm.runInNewContext(`${ts.transpile(randomNextSource)}; getRandomNextIndex`),
    safelyPlay: audio => { calls.push(audio.src); return Promise.resolve(true); },
  };
  for (const name of ['setIsPlaying', 'setCurrentTime', 'setProgress', 'setDuration', 'setCurrentIndex', 'setCurrentTrack', 'setDisplayQueue']) context[name] = () => {};
  context.audioRef = {current:context.audio};
  vm.runInNewContext(`${ts.transpile(startQueuedSource)}; (${next})()`, context);
  return { context, calls };
}
let result = fixture(0);
assert.deepEqual(result.calls, ['second.mp3']);
assert.equal(result.context.audio.currentTime, 0);
assert.equal(result.context.loadedTrackIdRef.current, 'second');
assert.equal(result.context.currentTrackRef.current.id, 'second');
assert.equal(result.context.playbackRequestedRef.current, true);
assert.equal(result.context.pendingSeekPercentRef.current, null);
assert.equal(result.context.mediaPlaying, true, 'keep the system media session active between tracks');
result.context.audio.paused = true;
result.context.audio.error = null;
result.context.audio.ended = false;
vm.runInNewContext(`(${eventHandlers.onPause})()`, result.context);
assert.equal(result.context.playbackRequestedRef.current, true, 'source-switch pause must preserve automatic playback');
assert.equal(result.context.mediaPlaying, true, 'loading pause must not mark the system session paused');
vm.runInNewContext(`(${eventHandlers.onCanPlay})()`, result.context);
assert.equal(result.calls.length, 2, 'retry once the next file is ready');
vm.runInNewContext(`(${eventHandlers.onPlaying})()`, result.context);
vm.runInNewContext(`(${eventHandlers.onCanPlay})()`, result.context);
assert.equal(result.calls.length, 2, 'do not restart a track that has started');
result = fixture(0);
result.context.playbackRequestedRef.current = false;
result.context.audio.paused = true;
vm.runInNewContext(`(${eventHandlers.onCanPlay})()`, result.context);
assert.equal(result.calls.length, 1, 'respect an explicit pause while loading');
result = fixture(1);
assert.deepEqual(result.calls, [], 'end of queue without repeat must stay stopped');
result = fixture(1, true);
assert.deepEqual(result.calls, ['second.mp3'], 'repeat the current track, not the queue');
assert.equal(result.context.audio.currentTime, 0);
result = fixture(0, true);
assert.deepEqual(result.calls, ['first.mp3'], 'repeat before the end of the queue too');
result = fixture(1, true, true);
assert.deepEqual(result.calls, ['second.mp3'], 'repeat current track takes precedence over shuffle');
result = fixture(0, false, true);
assert.deepEqual(result.calls, ['second.mp3'], 'shuffle selects another queued track');
result = fixture(1, false, true);
assert.deepEqual(result.calls, ['first.mp3'], 'shuffle continues from the final queued track');
const systemNext = fixture(0, false, false, eventHandlers.playNext);
const automaticNext = fixture(0);
assert.deepEqual(systemNext.calls, automaticNext.calls, 'system controls and auto advance start the same file');
assert.equal(systemNext.context.currentTrackRef.current.id, automaticNext.context.currentTrackRef.current.id);
assert.equal(systemNext.context.audio.currentTime, automaticNext.context.audio.currentTime);
console.log('PASS: optional audio-session setup and immediate queue advance without React effects (mock media; not a phone lock-screen test)');
