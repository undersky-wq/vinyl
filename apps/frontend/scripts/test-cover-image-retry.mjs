import assert from 'node:assert/strict';
import { retryCoverImage } from '../src/lib/retry-cover-image.ts';

globalThis.window = { location: { href: 'https://mityadima.ru/', origin: 'https://mityadima.ru' } };
const source = { srcset: '' };
const image = {
  currentSrc: 'https://s3.ru-7.storage.selcloud.ru/vinyl-covers/covers/test/thumb.webp?X-Amz-Signature=expired',
  src: '', dataset: {},
  parentElement: { tagName: 'PICTURE', querySelectorAll: () => [source] },
};
assert.equal(retryCoverImage(image), true);
const repaired = new URL(image.src);
assert.equal(repaired.pathname, '/api/media/vinyl-covers/covers/test/thumb.webp');
assert.equal(repaired.searchParams.has('X-Amz-Signature'), false);
assert.equal(source.srcset, image.src);
assert.equal(retryCoverImage(image), false);
image.currentSrc = image.src;
assert.equal(retryCoverImage(image), false);
image.currentSrc = 'https://mityadima.ru/api/media/vinyl-covers/covers/next/front.jpg';
assert.equal(retryCoverImage(image), true, 'a reused mini-player image can recover the next release too');
const stable = { currentSrc: 'https://mityadima.ru/api/media/vinyl-covers/covers/test/front.jpg', dataset: {} };
assert.equal(retryCoverImage(stable), true);
assert.equal(new URL(stable.src).searchParams.has('retry'), true);
for (const url of ['https://example.com/image.jpg', 'https://mityadima.ru/api/media/audio/audio/test.mp3', 'https://mityadima.ru/fallback-cover.svg']) {
  assert.equal(retryCoverImage({ currentSrc: url, dataset: {} }), false);
}
console.log('PASS: expired legacy covers, mobile picture recovery, stable covers and bounded retries');
