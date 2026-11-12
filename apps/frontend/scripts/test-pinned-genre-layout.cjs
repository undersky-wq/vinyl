const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.addInitScript(() => localStorage.setItem('mityadima-cookie-choice-v1', 'necessary'));
      await page.goto(process.env.PINNED_GENRE_TEST_URL || 'http://localhost:3100/?layout=tracks', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.paper-styles button[data-style]');
      const style = await page.locator('.paper-styles button[data-style]').last().getAttribute('data-style');
      await page.evaluate(style => {
        location.hash = new URLSearchParams({ styles: style }).toString();
      }, style);
      await page.waitForFunction(style => document.querySelector(`.paper-styles button[data-style="${CSS.escape(style)}"]`)?.getAttribute('aria-pressed') === 'true', style);
      for (const layout of ['stack', 'shelf', 'tracks', 'stack', 'shelf']) {
        await page.locator(`.paper-layout-controls>button[aria-label="${layout === 'stack' ? 'Стопка' : layout === 'shelf' ? 'Полка' : 'Треки'}"],.paper-layout-controls>button[aria-label="${layout === 'stack' ? 'Stack' : layout === 'shelf' ? 'Shelf' : 'Tracks'}"]`).click();
        await page.waitForTimeout(1200);
        const result = await page.evaluate(style => {
          const scroll = document.querySelector('.paper-styles>div');
          const row = [...scroll.querySelectorAll('[data-style]')].find(node => node.dataset.style === style);
          const clippedTop = row.offsetTop < scroll.scrollTop;
          const clippedBottom = row.offsetTop + row.offsetHeight > scroll.scrollTop + scroll.clientHeight;
          const pins = [...document.querySelectorAll('.paper-styles-pinned button')].filter(button => button.textContent.startsWith(style));
          return { height: scroll.clientHeight, clipped: clippedTop || clippedBottom, placeholder: row.classList.contains('is-pinned-placeholder'), pins: pins.length, selected: row.getAttribute('aria-pressed') };
        }, style);
        assert.equal(result.selected, 'true', `${width}/${layout}: selected genre persists`);
        if (result.height > 0 && result.clipped) {
          assert.equal(result.pins, 1, `${width}/${layout}: clipped genre remains pinned once`);
          assert(result.placeholder, `${width}/${layout}: duplicate row is hidden`);
        }
      }
      await page.close();
    }
    console.log('PASS: selected genres remain pinned when scroller size/visibility changes across Tracks, Stack and Shelf on mobile/desktop');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
