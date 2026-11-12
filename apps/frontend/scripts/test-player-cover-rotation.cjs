const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, hasTouch: width === 390, isMobile: width === 390 });
      const rows = await (await page.request.get('http://127.0.0.1:3201/api/releases')).json();
      const release = rows.find(row => row.tracks.length && !row.isMix);
      const track = { id: release.tracks[0].id, releaseId: release.id, artist: release.artist, title: release.tracks[0].title,
        position: 'A1', coverUrl: release.coverStorageUrl, frontCoverFullUrl: release.coverStorageUrl, backCoverUrl: release.backCoverUrl,
        audioUrl: '/no-audio-in-ui-test.mp3', playbackSource: { section: 'collection', href: '/' } };
      await page.addInitScript(track => {
        localStorage.setItem('mityadima-cookie-choice-v1', 'necessary');
        sessionStorage.setItem('vinyl-player-state', JSON.stringify({ currentTrack: track, queue: [track], currentIndex: 0, currentTime: 20 }));
      }, track);
      await page.goto(process.env.ROTATION_TEST_URL || 'http://localhost:3100/', { waitUntil: 'domcontentloaded' });
      await page.locator('.mini-track-transition__cover').click();
      const overlay = page.locator('.mobile-player-overlay');
      await overlay.waitFor({ state: 'visible' });
      async function drag(surface, container) {
        await surface.waitFor({ state: 'visible' }); await page.waitForTimeout(1200);
        const box = await surface.boundingBox(); assert(box.width > 100 && box.height > 100);
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        if (width === 390) {
          const cdp = await page.context().newCDPSession(page);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 60, y: y + 20 }] });
          await page.waitForTimeout(150);
          assert((await surface.getAttribute('style')).includes('rotateY'));
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
        } else {
          await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 80, y + 25, { steps: 8 });
          await page.waitForTimeout(150); assert((await surface.getAttribute('style')).includes('rotateY')); await page.mouse.up();
        }
        assert(await container.isVisible(), 'Dragging must not close the player/release');
        await page.waitForTimeout(1600);
        assert.equal(await surface.evaluate(node => node.style.transform), '', 'Rotation settles without overriding selected cover side');
      }
      await drag(overlay.locator('.cover-rotation-surface'), overlay);
      await overlay.locator('.cover-rotation-surface').click(); await overlay.waitFor({ state: 'hidden' });
      await page.locator('.mini-player__artist').click();
      const preview = page.locator('.mini-release-preview');
      await drag(preview.locator('.cover-rotation-surface'), preview);
      await preview.locator('.cover-rotation-surface').click(); await preview.waitFor({ state: 'hidden' });
      await page.goto('http://localhost:3100/player', { waitUntil: 'domcontentloaded' });
      await drag(page.locator('.player-page__cover-frame .cover-rotation-surface'), page.locator('.player-page').first());
      await page.close();
    }
    console.log('PASS: full-player overlay, mini-player release preview and /player covers rotate with mouse/touch, settle, remain open after drag and close on ordinary click');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
