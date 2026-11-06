const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.join(__dirname, '..');
const base = process.env.EDIT_CONTROLS_BASE_URL;

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    if (base) {
      await page.context().addCookies([{ name: 'vinyl_session', value: 'preview-only', url: base }]);
      await page.addInitScript(() => {
        localStorage.setItem('vinyl-admin-web-edit-mode', 'on');
        localStorage.setItem('vinyl-cookie-consent', 'accepted');
      });
      const collectionFixtures = require('../../../.local/native-preview/data.json').slice(3, 5);
      await page.route('**/api/releases/*', route => {
        const id = new URL(route.request().url()).pathname.split('/').pop();
        const release = collectionFixtures.find(item => item.id === id);
        return release ? route.fulfill({ json: { ...release, images: release.images || [], tracks: release.tracks || [] } }) : route.continue();
      });
      for (const section of ['/', '/mixes', '/tracks']) {
        for (const mode of ['shelf', 'grid', 'stack', 'tracks']) {
          await page.goto(`${base}${section}?layout=${mode}`);
          await page.locator(`.paper-archive[data-layout="${mode}"]`).waitFor();
          assert.equal(await page.locator('.paper-record .shelf-release-edit-trigger').count(), 0, 'no pencils on artwork');
          assert.equal(await page.locator('button button').count(), 0, 'no nested action buttons');
          if (mode === 'tracks' && section === '/') {
            await page.locator('.paper-list-tracks').first().waitFor();
            assert(await page.locator('.paper-list-tracks h2>.shelf-release-year>.shelf-release-edit-trigger').count()>0, 'collection Tracks exposes admin editing before the year');
            continue;
          }
          if (mode !== 'tracks') {
            assert.equal(await page.locator('.shelf-release-edit-trigger').count(), 0, 'collapsed layout has no edit buttons');
            await page.locator('.paper-record-open').first().dispatchEvent('click');
            if (mode === 'shelf') {
              await page.locator('.paper-archive.is-open:not(.is-expanded)').waitFor();
              assert.equal(await page.locator('.shelf-release-edit-trigger').count(), 0, 'first shelf reveal has no pencil');
              await page.locator('.paper-record-open').first().dispatchEvent('click');
            }
            await page.locator('.paper-archive.is-expanded').waitFor();
          }
          const scope = mode === 'tracks' ? '.paper-mix-heading' : '.paper-tracklist';
          const edit = page.locator(`${scope} .shelf-release-year .shelf-release-edit-trigger`).first();
          await edit.waitFor();
          const size = await edit.evaluate(node => ({ width: node.offsetWidth, height: node.offsetHeight }));
          assert.deepEqual(size, { width: 24, height: 24 }, `${section}/${mode}: compact pencil target`);
          assert(await edit.evaluate(node => !node.nextElementSibling || node.nextElementSibling.tagName === 'TIME'), 'pencil precedes the year');
          await edit.click();
          await page.locator('body > dialog.shelf-editor[open]').waitFor();
          assert.equal(await page.locator('.paper-record.is-selected').count(), mode === 'tracks' ? 0 : 1, 'editing preserves the current release state');
          await page.keyboard.press('Escape');
          await page.locator('dialog.shelf-editor[open]').waitFor({ state: 'hidden' });
        }
      }
      await page.goto(`${base}/mixes?layout=tracks`);
      const play = page.locator('.paper-mix-play').first();
      await play.waitFor();
      await play.click();
      await page.locator('.mini-player:not(.mini-player--hidden)').waitFor();
      assert.equal(await page.locator('dialog.shelf-editor[open]').count(), 0, 'Play must not open the editor');
      await page.locator('a.paper-avatar').first().click();
      await page.locator('.paper-profile-page').waitFor();
      await page.locator('.mini-player:not(.mini-player--hidden)').waitFor();
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => { document.documentElement.dataset.shelfTheme = theme; }, theme);
        const panel = await page.evaluate(() => {
          const style = getComputedStyle(document.body, '::after');
          return { display: style.display, height: style.height, background: style.backgroundColor, border: style.borderTopWidth };
        });
        assert.equal(panel.display, 'block', `${theme}: profile footer backing visible`);
        assert.equal(panel.height, '104px');
        assert.equal(panel.border, '1px');
        assert.notEqual(panel.background, 'rgba(0, 0, 0, 0)');
      }
      await page.screenshot({ path: path.resolve(root, '../../reports/profile-player-edit-fix.png') });
      await page.goto(`${base}/releases/mix-0`);
      await page.locator('.shelf-mix-detail .paper-mix-play').click();
      await page.locator('.mini-player:not(.mini-player--hidden)').waitFor();
      assert.equal(await page.locator('dialog.shelf-editor[open]').count(), 0, 'permalink Play is independent of editing');
      await page.locator('.shelf-mix-detail .shelf-release-edit-trigger').click();
      await page.locator('body > dialog.shelf-editor[open]').waitFor();
      await page.keyboard.press('Escape');
      await page.evaluate(() => {
        localStorage.setItem('vinyl-admin-web-edit-mode', 'off');
        window.dispatchEvent(new Event('vinyl-admin-web-edit-mode-change'));
      });
      await page.locator('.shelf-release-edit-trigger').waitFor({ state: 'hidden' });
    }
    // Detail pages use a display:contents grid; the editor must not occupy a grid cell or cover Play.
    const css = ['src/app/globals.css', 'public/shelf.css', 'src/components/shelf-theme.css',
      'src/components/shelf-web.css', 'src/components/record-archive.css',
      'src/components/shelf-mix-detail.css', 'src/components/music-mobile-layout.css']
      .map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
    for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 1000 });
      await page.setContent(`<html data-visual-variant="shelf" data-shelf-theme="${theme}"><head><style>${css}</style></head><body><script>window.edits=0;window.plays=0;</script>
        <main class="shelf-mix-detail"><article class="shelf-mix-detail__content">
          <button class="shelf-mix-detail__cover">Artwork</button><section class="shelf-mix-detail__info">
          <div class="paper-mix-heading"><button class="paper-mix-play" onclick="window.plays=(window.plays||0)+1">Play</button><h2><span class="paper-mix-name">Artist : Mix</span><span class="shelf-release-year"><button class="shelf-edit-trigger shelf-release-edit-trigger" onclick="window.edits=(window.edits||0)+1">Edit</button><time>2026</time></span></h2></div>
          <div class="paper-mix-timeline">Waveform</div></section></article></main></body></html>`);
      const play = page.locator('.paper-mix-play');
      await play.click();
      assert.equal(await page.evaluate(() => window.edits || 0), 0, `${width}/${theme}: pencil never intercepts Play`);
      assert.equal(await page.evaluate(() => window.plays), 1);
      const box = await page.locator('.shelf-release-edit-trigger').boundingBox();
      assert.equal(box.width, 24);
      assert.equal(box.height, 24);
      const year = await page.locator('.shelf-release-year time').boundingBox();
      assert(box.x + box.width <= year.x && year.x - box.x - box.width <= 5, 'pencil sits immediately before the year');
      assert(Math.abs(box.y + box.height/2 - year.y - year.height/2) < 1, 'pencil and year are vertically aligned');
    }
    console.log(base
      ? 'PASS: edit controls across collection/mixes/tracks layouts; Play hit targets; profile backing in light/dark'
      : 'PASS: detail Play/pencil hit areas at mobile/desktop widths in light/dark CSS fixtures');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
