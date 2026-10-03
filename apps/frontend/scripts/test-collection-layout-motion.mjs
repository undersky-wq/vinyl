import { strict as assert } from 'node:assert';
import { COLLECTION_LAYOUT_DURATION, collectionLayoutProgress, mergeVisibleReleaseIndices, extrapolateStackCoverFrame } from '../src/lib/collection-layout-motion.ts';

assert.equal(collectionLayoutProgress(-100), 0);
assert.equal(collectionLayoutProgress(COLLECTION_LAYOUT_DURATION + 100), 3);
assert.equal(collectionLayoutProgress(650), 1);
assert.equal(collectionLayoutProgress(789), 1);
assert.equal(collectionLayoutProgress(1440), 2);
assert.equal(collectionLayoutProgress(1579), 2);
for (const reverse of [false, true]) {
  let previous = reverse ? 3 : 0;
  const layouts = new Set();
  for (let ms = 0; ms <= COLLECTION_LAYOUT_DURATION; ms++) {
    const value = collectionLayoutProgress(ms, reverse);
    assert.ok(value >= 0 && value <= 3);
    assert.ok(reverse ? value <= previous : value >= previous);
    assert.ok(Math.abs(value - previous) < .003, 'No jumps between layouts');
    layouts.add(Math.round(value));
    previous = value;
  }
  assert.deepEqual([...layouts], reverse ? [3, 2, 1, 0] : [0, 1, 2, 3]);
  assert.equal(previous, reverse ? 0 : 3);
}
console.log('PASS: Shelf / Stack / Grid / Tracks, continuous forward and reverse morphs');
assert.deepEqual(mergeVisibleReleaseIndices([25, 32, 63], [0, 1, 2], 3), [0, 1, 2]);
assert.deepEqual(mergeVisibleReleaseIndices([0, 1], [], 0), []);
assert.deepEqual(mergeVisibleReleaseIndices([0, 1, 1, -1], [1, 2, 999], 3), [0, 1, 2]);
console.log('PASS: catalog -> short playlist, empty playlist and deduplicated visible windows');
const stackFrames = new Map([
  ['100', { left:'400px', top:'200px', width:'300px', transform:'rotateX(-55deg)', opacity:'1' }],
  ['101', { left:'400px', top:'161.6px', width:'300px', transform:'rotateX(-55deg)', opacity:'1' }],
]);
for (const index of ['90', '110']) {
  const frame = extrapolateStackCoverFrame(stackFrames, index, -38.4);
  assert.ok(Math.abs(parseFloat(frame.top) - (200 + (Number(index) - 100) * -38.4)) < .001);
  assert.equal(frame.left, '400px'); assert.equal(frame.transform, 'rotateX(-55deg)');
}
assert.equal(extrapolateStackCoverFrame(new Map(), '1', -38.4), undefined);
assert.equal(extrapolateStackCoverFrame(stackFrames, 'invalid', -38.4), undefined);
assert.equal(stackFrames.size, 2, 'do not mount or fabricate the whole collection');
console.log('PASS: both Shelf edges continue the captured Stack geometry instead of popping in');
