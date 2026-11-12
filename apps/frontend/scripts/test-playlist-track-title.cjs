const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const css = ['record-archive.css', 'shelf-web.css', 'shelf-theme.css', 'shelf-motion-preview.css']
  .map(file => fs.readFileSync(path.join(__dirname, '../src/components', file), 'utf8')).join('\n');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
  try {
    for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setContent(`<html data-visual-variant="shelf" data-shelf-theme="${theme}"><style>${css}</style><body>
        <section class="paper-archive is-playlist is-listing">
          <div class="paper-list-tracks is-compact-track">
            ${['', 'is-playing'].map(state => `<div class="paper-track-line ${state}"><button class="paper-track-play"><span class="paper-track-primary"><span class="paper-track-primary-line"><b>Artist</b><em>Title</em></span></span></button></div>`).join('')}
          </div>
        </section>
        <div class="mini-player"><div class="mini-player__meta"><button class="mini-player__title">Title</button></div></div>
        </body></html>`);
      const result = await page.evaluate(() => ({
        reference: getComputedStyle(document.querySelector('.mini-player__title')).color,
        titles: [...document.querySelectorAll('.paper-track-primary-line>em')].map(node => getComputedStyle(node).color),
        artists: [...document.querySelectorAll('.paper-track-primary-line>b')].map(node => getComputedStyle(node).color),
      }));
      for (let index = 0; index < result.titles.length; index++) assert.equal(result.titles[index], result.artists[index], `${width}/${theme}: title restores inherited text color, including playing row`);
      assert(result.artists.every(color => color !== result.reference), `${width}/${theme}: artist retains its own color`);
      await page.close();
    }
    console.log('PASS: playlist/favorites track titles restore normal text color on mobile/desktop, light/dark, playing/idle rows; artists unchanged');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
