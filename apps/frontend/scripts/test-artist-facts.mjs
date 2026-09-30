import { strict as assert } from 'node:assert';
import { factFromWikiPage, getArtistFact, normalizeFactArtist } from '../src/lib/artist-facts.ts';

const page = (title, text = 'This artist is a musician and record producer based in Detroit.') => ({
  title, extract: text, categories: [{ title: 'Category:American record producers' }],
});
assert.equal(normalizeFactArtist('  Jeff   Mills '), 'Jeff Mills');
for (const value of ['', 'Various', 'Various Artists', 'V.A.', 'Unknown Artist', 'A feat. B', 'A & B', 'A|B', 'x\ny', 'x'.repeat(101)]) {
  assert.equal(normalizeFactArtist(value), null, value);
}
assert.equal(factFromWikiPage({ ...page('Test'), missing: true }, 'en'), null);
assert.equal(factFromWikiPage({ ...page('Test'), pageprops: { disambiguation: '' } }, 'en'), null);
assert.equal(factFromWikiPage({ ...page('Test'), categories: [{ title: 'Category:Politicians' }] }, 'en'), null);
assert.equal(factFromWikiPage(page('Test', 'A'.repeat(400) + '.'), 'en'), null);
assert.equal(factFromWikiPage(page('Test name'), 'en').source, 'https://en.wikipedia.org/wiki/Test_name');
assert.equal(factFromWikiPage(page('Jeff Mills', 'Джефф Миллз (англ. Jeff Mills; род. 18 июня 1963, Детройт) — американский музыкант и диджей, работающий в жанре техно.'), 'ru').text,
  'Джефф Миллз — американский музыкант и диджей, работающий в жанре техно.');

const nativeFetch = globalThis.fetch;
if (process.argv.includes('--live')) {
  const fact = await getArtistFact('Jeff Mills');
  assert.ok(fact, 'Live Wikipedia lookup should return a sourced musician fact');
  console.log('LIVE:', fact);
} else {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ query: { pages: [page('Test Artist')] } }); };
  const results = await Promise.all([getArtistFact('Test Artist'), getArtistFact('Test Artist')]);
  assert.ok(results[0]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(calls, 1, 'Concurrent requests are deduplicated');
  await getArtistFact('test artist');
  assert.equal(calls, 1, 'Case-normalized requests are cached');
  await getArtistFact('Various');
  assert.equal(calls, 1, 'No network request for compilation metadata');

  globalThis.fetch = async () => { calls++; throw new Error('offline'); };
  assert.equal(await getArtistFact('Offline Artist'), null);
  const failureCalls = calls;
  assert.equal(await getArtistFact('Offline Artist'), null);
  assert.equal(calls, failureCalls, 'Failures are cached, too');

  globalThis.fetch = async () => Response.json({ query: { pages: [page('Namesake'), page('Namesake (DJ)')] } });
  assert.equal(await getArtistFact('Namesake'), null, 'Ambiguous musicians must not produce a fact');

  globalThis.fetch = async url => Response.json({ query: { pages: url.startsWith('https://ru.') ? [] : [page('English Artist')] } });
  assert.equal((await getArtistFact('English Artist')).language, 'en', 'English fallback retains its language label');
  globalThis.fetch = nativeFetch;
  console.log('PASS: artist validation, sources, musician checks, ambiguity, fallback, caching, concurrent requests and offline handling');
}
