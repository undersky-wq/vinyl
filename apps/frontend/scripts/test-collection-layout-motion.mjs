import { strict as assert } from 'node:assert';
import { COLLECTION_LAYOUT_DURATION, collectionLayoutProgress } from '../src/lib/collection-layout-motion.ts';

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
