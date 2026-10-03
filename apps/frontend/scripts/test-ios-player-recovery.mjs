import assert from 'node:assert/strict';
import { isIOSWebKit, watchPersistentAudioStall } from '../src/lib/audio-stall-guard.ts';
import { getMediaArtwork, getMediaMetadataKey, startMediaArtworkUpdate } from '../src/lib/media-artwork-update.ts';

function fakeClock() {
  let time = 0, nextId = 0;
  const timers = new Map();
  return {
    now: () => time,
    set: (callback, delay) => { const id = ++nextId; timers.set(id, { callback, at: time + delay }); return id; },
    clear: id => timers.delete(id),
    advance(ms) {
      time += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= time) { timers.delete(id); timer.callback(); }
      }
    },
    pending: () => timers.size,
  };
}
class FakeAudio extends EventTarget {
  currentTime = 20; src = 'https://example.com/mix.mp3';
  paused = false; ended = false; seeking = false; readyState = 2;
  emit(name) { this.dispatchEvent(new Event(name)); }
}
assert.equal(isIOSWebKit('iPhone Safari', 'iPhone', 5), true);
assert.equal(isIOSWebKit('Safari', 'MacIntel', 5), true);
assert.equal(isIOSWebKit('Android Chrome', 'Linux', 5), false);
assert.equal(isIOSWebKit('Safari', 'MacIntel', 0), false);

let audio = new FakeAudio(), clock = fakeClock(), recoveries = 0;
let stop = watchPersistentAudioStall(audio, () => recoveries++, clock);
audio.emit('stalled'); audio.emit('waiting');
assert.equal(clock.pending(), 1, 'duplicate events share a single watchdog');
clock.advance(2000); audio.currentTime = 22; audio.emit('timeupdate'); clock.advance(10000);
assert.equal(recoveries, 0, 'short network delay or buffered playback must not restart audio');
audio.emit('waiting'); clock.advance(10000);
assert.equal(recoveries, 1, 'persistent starvation is recovered');
audio.emit('waiting'); clock.advance(10000);
assert.equal(recoveries, 1, 'recovery cooldown prevents restart loops');
stop();

for (const change of [
  a => { a.paused = true; a.emit('pause'); },
  a => { a.seeking = true; a.emit('seeking'); },
  a => { a.src = 'next.mp3'; },
  a => { a.readyState = 4; },
  a => { a.currentTime += 1; },
  a => { a.emit('playing'); },
]) {
  audio = new FakeAudio(); clock = fakeClock();
  let calls = 0;
  stop = watchPersistentAudioStall(audio, () => calls++, clock);
  audio.emit('waiting'); change(audio); clock.advance(10000);
  assert.equal(calls, 0, 'pause, seek, track change or resumed playback cancels recovery'); stop();
}
audio = new FakeAudio(); clock = fakeClock();
stop = watchPersistentAudioStall(audio, () => { throw Error('disposed recovery'); }, clock);
audio.emit('waiting'); stop(); clock.advance(10000);
assert.equal(clock.pending(), 0);

assert.deepEqual(getMediaArtwork('cover.jpg'), [{ src: 'cover.jpg' }]);
assert.deepEqual(getMediaArtwork(''), []);
assert.notEqual(getMediaMetadataKey({ id:'1', title:'Track', artist:'Artist', coverUrl:'' }),
  getMediaMetadataKey({ id:'1', title:'Track', artist:'Artist', coverUrl:'cover.jpg' }));
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
clock = fakeClock(); let published = 0, loads = 0;
stop = startMediaArtworkUpdate('cover.jpg', () => published++, async () => ++loads >= 2, clock);
assert.equal(published, 1, 'artwork is supplied without waiting for image loading');
await flush(); clock.advance(2000); await flush();
assert.equal(loads, 2); assert.equal(published, 3); assert.equal(clock.pending(), 0);
stop();
clock = fakeClock(); loads = 0;
stop = startMediaArtworkUpdate('missing.jpg', () => {}, async () => { loads++; return false; }, clock);
await flush(); clock.advance(2000); await flush(); clock.advance(4000); await flush();
assert.equal(loads, 3, 'failed artwork retries are bounded'); assert.equal(clock.pending(), 0); stop();
let finishLoad; published = 0;
clock = fakeClock();
stop = startMediaArtworkUpdate('slow.jpg', () => published++, () => new Promise(resolve => { finishLoad = resolve; }), clock);
clock.advance(4000);
assert.equal(published, 1, 'slow artwork remains available to the system player');
finishLoad(true); await flush(); assert.equal(published, 2); stop();
published = 0;
stop = startMediaArtworkUpdate('old.jpg', () => published++, () => new Promise(resolve => { finishLoad = resolve; }), fakeClock());
stop(); finishLoad(true); await flush();
assert.equal(published, 1, 'late old-track artwork cannot replace the next track');
console.log('PASS: iOS-only stall watchdog, cooldown, cancellation, immediate artwork and bounded retries');
