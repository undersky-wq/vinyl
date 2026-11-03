const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const frontend = path.join(__dirname, '..');
const cssFiles = ['src/app/globals.css', 'public/shelf.css', 'src/components/record-archive.css',
  'src/components/shelf-theme.css', 'src/components/shelf-web.css', 'src/components/paper-sections.css',
  'src/app/profile/profile.css', 'src/app/upload/upload.css', 'src/components/mobile-collection-picker.css',
  'src/components/shelf-typography.css'];
const css = cssFiles.map(file => fs.readFileSync(path.join(frontend, file), 'utf8')).join('\n');
const samples = `<main class="paper-archive"><h1 class="paper-heading">Artist : Release</h1><input class="paper-search" placeholder="Search"><p class="paper-empty">Nothing found. Change the search or choose All.</p></main>
<section class="paper-profile-page"><h2>Profile</h2><button class="profile-action-button">Settings</button><div class="two-factor-settings"><code>TEST-CODE</code></div></section>
<section class="paper-section-page"><h2>About me</h2><p>Biography</p></section>
<section class="paper-upload-page"><label>Title<input></label><button>Upload</button></section>
<dialog class="paper-mobile-picker" open><h2>Sections</h2><input placeholder="Search"><p>No results</p><button>Collection</button></dialog>
<div class="mini-player"><span class="mini-player__artist">Artist</span></div><div class="mobile-player-overlay"><button class="player-page__control">Play</button></div>`;

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const page = await browser.newPage();
    for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 844 });
      await page.setContent(`<html data-visual-variant="shelf" data-shelf-theme="${theme}"><head><style>${css}</style></head><body>${samples}</body></html>`);
      const failures = await page.locator('body, main *, section *, dialog *, .mini-player *, .mobile-player-overlay *').evaluateAll(nodes => nodes.filter(node => !node.closest('code,pre,kbd,samp')).flatMap(node => {
        const style = getComputedStyle(node);
        return style.fontFamily.startsWith('Arial, Helvetica') && style.fontStretch === '100%' ? [] : [{ tag: node.tagName, font: style.fontFamily, stretch: style.fontStretch }];
      }));
      assert.deepEqual(failures, [], `${width}px ${theme}: consistent text and controls`);
      assert.match(await page.locator('code').evaluate(node => getComputedStyle(node).fontFamily), /Consolas/);
    }
    if (process.env.TYPOGRAPHY_BASE_URL) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${process.env.TYPOGRAPHY_BASE_URL}/mixes?layout=tracks`);
      const search = page.getByRole('searchbox').or(page.getByRole('textbox', { name: 'Search releases and mixes' }));
      await search.first().waitFor();
      await page.route('**/api/releases**', async route => {
        const url = new URL(route.request().url());
        if (!url.searchParams.get('search')) return route.continue();
        return route.fulfill({ json: url.pathname.endsWith('/library-feed') ? { releases: [], total: 0, collectionTotal: 0, totalTracks: 0, hasMore: false, options: { styles: [], artists: [], keys: [] } } : [] });
      });
      await search.first().fill('zzzz-no-matching-artist');
      await page.locator('.paper-empty').waitFor({ state: 'visible', timeout: 30000 });
      const fonts = await page.locator('.paper-empty, .paper-search').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).fontFamily));
      assert(fonts.length >= 2 && fonts.every(font => font.startsWith('Arial, Helvetica')));
      const screenshot = path.resolve(frontend, '../../reports/search-empty-typography-mobile.png');
      await page.screenshot({ path: screenshot });
      console.log(`Screenshot: ${screenshot}`);
    }
    console.log('PASS: Shelf typography across mobile/desktop, light/dark, status messages, forms, dialogs, profile and player; code font preserved');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
