const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const lib = path.join(__dirname, '../src/lib/release-identity-search.ts');
const compiled = ts.transpileModule(fs.readFileSync(lib, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
new Function('module', 'exports', compiled)(loaded, loaded.exports);
const { matchesReleaseSearch, releaseIdentityQuery } = loaded.exports;
const release = { artist: 'Boot & Tax', title: 'Fusci EP', labels: ['Optimo Trax', 'Other Label'], tracks: [{ title: 'Song' }] };
assert(matchesReleaseSearch(release, releaseIdentityQuery('artist', 'boot & tax')));
assert(!matchesReleaseSearch(release, releaseIdentityQuery('artist', 'Boot')));
assert(matchesReleaseSearch(release, releaseIdentityQuery('label', 'Other Label')));
assert(!matchesReleaseSearch(release, releaseIdentityQuery('label', 'Optimo')));
assert(!matchesReleaseSearch({ ...release, isMix: true }, releaseIdentityQuery('artist', release.artist)));
assert(matchesReleaseSearch(release, 'fusci song'));
assert(matchesReleaseSearch(release, ''));
assert(!matchesReleaseSearch({ ...release, labels: undefined }, releaseIdentityQuery('label', 'Missing')));
assert(matchesReleaseSearch({ ...release, artist: 'Artist "quoted" \\ name' }, releaseIdentityQuery('artist', 'Artist "quoted" \\ name')));
assert.doesNotThrow(() => matchesReleaseSearch(release, 'artist:"bad\nvalue"'));
const css = ['record-archive.css', 'shelf-web.css', 'shelf-theme.css', 'archive-render-stability.css']
  .map(file => fs.readFileSync(path.join(__dirname, '../src/components', file), 'utf8')).join('\n');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
  try {
    for (const width of [320, 390, 700, 1440]) for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setContent(`<html data-visual-variant="shelf" data-shelf-theme="${theme}"><style>${css}</style><body>
        <section class="paper-archive is-listing" style="--list-size:100px;--type:17px;--list-left:3vw">
          <div class="paper-list-tracks" style="top:100px"><h2 class="paper-release-identity"><span class="paper-release-identity-lines">
            <span class="paper-release-identity-row"><b>Very long artist name with many words</b><button class="paper-release-browse" aria-label="Artist releases" aria-pressed="true"><svg width="16" height="16"></svg></button></span>
            <span class="paper-release-identity-title paper-release-title-regular">A very long release name that must never overflow the available space</span>
            <span class="paper-release-identity-row paper-release-identity-labels"><span class="paper-release-label"><span>A very long label name</span><button class="paper-release-browse" aria-label="Label releases"><svg width="16" height="16"></svg></button></span></span>
          </span><span class="shelf-release-year"><time>2026</time></span></h2></div>
        </section></body></html>`);
      const result = await page.evaluate(() => {
        const header = document.querySelector('h2'), rows = [...document.querySelector('.paper-release-identity-lines').children];
        const bounds = header.getBoundingClientRect();
        return {
          height: bounds.height,
          top: bounds.top,
          bottom: bounds.bottom,
          rows: rows.map(node => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, right: r.right }; }),
          buttons: [...document.querySelectorAll('.paper-release-browse')].map(node => { const r = node.getBoundingClientRect(); return { width: r.width, right: r.right }; }),
          right: bounds.right,
          ellipsis: getComputedStyle(document.querySelector('.paper-release-identity-title')).textOverflow,
          activeColor: getComputedStyle(document.querySelector('[aria-pressed="true"]')).color,
          artistWeight: getComputedStyle(document.querySelector('.paper-release-identity-row>b')).fontWeight,
          artistFont: getComputedStyle(document.querySelector('.paper-release-identity-row>b')).fontFamily,
          year: { color: getComputedStyle(document.querySelector('.shelf-release-year>time')).color, size: getComputedStyle(document.querySelector('.shelf-release-year>time')).fontSize },
          title: { color: getComputedStyle(document.querySelector('.paper-release-identity-title')).color, size: getComputedStyle(document.querySelector('.paper-release-identity-title')).fontSize },
          alignment: [...document.querySelectorAll('.paper-release-browse')].map(button => {
            const icon = button.querySelector('svg').getBoundingClientRect();
            const text = button.previousElementSibling.getBoundingClientRect();
            return Math.abs((icon.top + icon.bottom) / 2 - (text.top + text.bottom) / 2);
          }),
          iconSizes: [...document.querySelectorAll('.paper-release-browse>svg')].map(node => node.getBoundingClientRect().width),
        };
      });
      assert(result.rows[0].bottom <= result.rows[1].top && result.rows[1].bottom <= result.rows[2].top, `${width}/${theme}: three separate rows`);
      assert(result.buttons.every(button => button.width >= 24 && button.right <= result.right + 1), `${width}/${theme}: visible eye controls`);
      if (width <= 700) {
        assert.equal(result.height, 100, `${width}/${theme}: header matches cover height`);
        assert(result.rows[2].bottom - result.rows[0].top <= 100, `${width}/${theme}: text stays inside cover height`);
        assert.equal(result.rows[0].top, result.top, 'Artist starts at cover top');
        assert.equal(result.rows[2].bottom, result.bottom, 'Label ends at cover bottom');
        assert(result.alignment.every(offset => offset < 1), `${width}/${theme}: eyes vertically centered beside artist and label`);
        assert(result.iconSizes.every(size => size === result.iconSizes[0]), 'Artist and label eyes have equal size');
      }
      assert.equal(result.ellipsis, 'ellipsis');
      assert.equal(result.activeColor, 'rgb(52, 120, 219)', 'Selected eye uses collection blue');
      assert.equal(result.artistWeight, '600', 'Artist matches genre weight');
      assert(result.artistFont.startsWith('Arial'), 'Artist uses Arial');
      assert.deepEqual(result.year, result.title, 'Release year matches title color and size');
      await page.locator('[aria-pressed="true"]').evaluate(node => node.setAttribute('aria-pressed', 'false'));
      await page.waitForTimeout(250);
      const colors = await page.locator('.paper-release-browse').evaluateAll(nodes => nodes.map(button => ({ icon: getComputedStyle(button).color, text: getComputedStyle(button.previousElementSibling).color })));
      assert(colors.every(row => row.icon === row.text), `${width}/${theme}: inactive eyes inherit the adjacent text color`);
      await page.close();
    }
    if (process.env.RELEASE_IDENTITY_TEST_URL) {
      const releases = [0, 1, 2].map(index => ({
        id: `identity-live-${index}`, artist: index < 2 ? 'Identity live Artist' : 'Identity live Other', title: `Identity live Release ${index}`,
        labels: [index === 1 ? 'Other label' : 'Shared label'], styles: ['House'], year: 2026, isMix: false, isOriginal: false,
        coverImageUrl: '/icon.png', coverStorageUrl: '/icon.png', tracksLoaded: true,
        tracks: [{ id: `identity-track-${index}`, title: 'Track', position: 'A1', audioFiles: [] }],
      }));
      for (const width of [390, 1440]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        let dataset = releases;
        await page.route('**/api/releases**', route => {
          const url = new URL(route.request().url());
          if (url.pathname === '/api/releases' && url.searchParams.get('catalog') === 'true') return route.fulfill({ json: dataset });
          const release = dataset.find(item => url.pathname === `/api/releases/${item.id}`);
          return release ? route.fulfill({ json: release }) : route.continue();
        });
        const url = new URL(process.env.RELEASE_IDENTITY_TEST_URL);
        url.searchParams.set('layout', 'tracks'); url.searchParams.set('search', 'Identity live');
        await page.goto(url.href, { waitUntil: 'domcontentloaded' });
        const headers = page.locator('.paper-release-identity');
        await page.waitForFunction(() => document.querySelectorAll('.paper-release-identity').length === 3);
        const artist = () => headers.first().locator('.paper-release-browse').first();
        await artist().click();
        await page.waitForFunction(() => document.querySelectorAll('.paper-release-identity').length === 2);
        assert.equal(await artist().getAttribute('aria-pressed'), 'true');
        await artist().click();
        await page.waitForFunction(() => document.querySelectorAll('.paper-release-identity').length === 3);
        const label = () => page.locator('.paper-release-identity-labels .paper-release-browse').first();
        await label().click();
        await page.waitForFunction(() => document.querySelectorAll('.paper-release-identity').length === 2);
        await label().click();
        await page.waitForFunction(() => document.querySelectorAll('.paper-release-identity').length === 3);
        assert.equal(await page.locator('.paper-search').inputValue(), 'Identity live');
        assert(await page.locator('.paper-archive.is-listing').count(), 'Tracks mode retained');
        dataset = Array.from({ length: 18 }, (_, index) => ({ ...releases[0], id: `scroll-release-${index}`, artist: index === 12 || index === 14 ? 'Identity live Scroll artist' : `Identity live Filler ${index}`, labels: ['Scroll label'], tracks: [{ ...releases[0].tracks[0], id: `scroll-track-${index}` }] }));
        await page.goto(url.href, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-release-id="scroll-release-1"]');
        await page.evaluate(() => {
          const first = document.querySelector('[data-release-id="scroll-release-0"]');
          const second = document.querySelector('[data-release-id="scroll-release-1"]');
          document.querySelector('.paper-row').scrollTop = (parseFloat(second.style.top) - parseFloat(first.style.top)) * 12;
        });
        const anchored = page.locator('[data-release-id="scroll-release-12"]');
        const anchoredEye = () => anchored.locator('.paper-release-browse').first();
        await anchoredEye().click();
        await page.waitForFunction(() => document.querySelectorAll('.paper-release-identity').length === 2);
        await page.waitForTimeout(800);
        const before = (await anchored.boundingBox()).y;
        await anchoredEye().click();
        await page.waitForFunction(() => document.querySelector('.paper-search').value === 'Identity live');
        await page.waitForTimeout(800);
        assert(await anchored.count(), 'Clicked release remains mounted after restoring full virtualized list');
        const after = (await anchored.boundingBox()).y;
        assert(Math.abs(after - before) < 2, `${width}: clicked release keeps its screen position after clearing filter (${before} vs ${after})`);
        await page.close();
      }
      console.log('PASS: live local page, artist/label toggles restore prior search/list and retain Tracks mode on mobile/desktop (isolated API fixtures)');
    }
    console.log('PASS: exact artist/label search; three-row layout at 320/390/700/1440px, light/dark; mobile cover-height bounds; active blue eye; Arial 600 artist');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
