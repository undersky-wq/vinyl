import { strict as assert } from 'node:assert';
import { warmCoverImages } from '../src/lib/warm-cover-images.ts';

const images = [];
globalThis.Image = class {
  onload = null;
  onerror = null;
  constructor() { images.push(this); }
};
const warmed = new Set(['cached']);
const stop = warmCoverImages(['cached', ...Array.from({length: 50}, (_, i) => `cover-${i}`), 'cover-0'], warmed);
assert.equal(images.length, 2, 'only two concurrent background requests');
assert.equal(images[0].src, 'cover-0');
assert.equal(images[0].fetchPriority, 'low');
for (let i = 0; i < images.length; i++) {
  images[i].onload();
  assert.ok(images.filter(image => image.onload !== null).length <= 2);
}
assert.equal(images.length, 32, 'bounded warm window, not the whole catalog');
assert.equal(warmed.size, 33);
stop();

const before = images.length;
const cancel = warmCoverImages(['cancel-0', 'cancel-1', 'cancel-2'], warmed);
cancel();
assert.equal(images.length, before + 2);
assert.equal(images.at(-1).onload, null, 'cleanup prevents further requests');
assert.equal(images.at(-1).onerror, null);

const failureStop = warmCoverImages(['broken'], warmed);
images.at(-1).onerror();
assert.equal(warmed.has('broken'), false, 'failed covers are not marked cached');
failureStop();

const bounded = new Set(Array.from({length: 128}, (_, i) => `old-${i}`));
const boundedStop = warmCoverImages(['new'], bounded);
images.at(-1).onload();
assert.equal(bounded.size, 128);
assert.ok(bounded.has('new'));
boundedStop();
console.log('PASS: two low-priority requests, cached/duplicate skipping, 32-cover limit, cancellation, errors, bounded cache');
