const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const css = fs.readFileSync(path.join(__dirname, '../src/components/archive-page-header.css'), 'utf8');
const previewCss = fs.readFileSync(path.join(__dirname, '../src/components/mini-release-preview.css'), 'utf8');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
  try {
    for (const width of [390, 1440]) for (const theme of ['light', 'dark']) for (const preview of [false, true]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.setContent(`<html data-shelf-theme="${theme}"><style>${css}${previewCss}
        @media(max-width:700px){.paper-layout-controls{transition:transform .8s,opacity .4s,visibility 0s linear .8s}}
        .mobile-player-overlay{position:fixed;inset:0;z-index:220;background:#888}
        .mobile-player-overlay__collapse{position:absolute;left:3vw;top:20px;width:100px;height:64px}
        </style><body><div class="archive-chrome" data-about>
          <header class="archive-page-header"><input class="paper-search" placeholder="Search">
          <button class="paper-layout-controls">Shelf</button></header>
        </div><button id="open">Open player</button><script>
          document.querySelector('#open').onclick=()=>{
            const overlay=document.createElement('div');overlay.className='${preview ? 'mini-release-preview' : 'mobile-player-overlay'}';
            overlay.innerHTML='<button class="${preview ? 'mini-release-preview__dismiss' : 'mobile-player-overlay__collapse'}">Collapse</button>';
            overlay.querySelector('button').onclick=()=>overlay.remove();document.body.append(overlay);
          };
        </script></body></html>`);
      const header = page.locator('.archive-page-header');
      assert(await header.isVisible(), 'Header visible before opening');
      const before = await header.boundingBox();
      await page.locator('#open').evaluate(button => button.click());
      const immediate = await page.locator('.paper-layout-controls').evaluate(node=>({visibility:getComputedStyle(node).visibility,transition:getComputedStyle(node).transitionDuration}));
      assert.equal(immediate.visibility,'hidden','Icons hide immediately, without the inherited mobile visibility delay');
      assert.equal(immediate.transition,'0s','Overlay cancels delayed header transitions');
      assert.equal(await header.isVisible(), false, 'Player hides the persistent header in both themes');
      assert.equal(await page.locator('.paper-search').isVisible(), false);
      assert.equal(await page.locator('.paper-layout-controls').isVisible(), false);
      await page.locator(preview ? '.mini-release-preview__dismiss' : '.mobile-player-overlay__collapse').click({ timeout: 2000, position: { x: 10, y: 10 } });
      assert.equal(await page.locator('.mobile-player-overlay').count(), 0, 'Collapse receives the pointer click');
      assert.equal(await page.locator('.mini-release-preview').count(), 0, 'Release dismiss also receives clicks in the former header area');
      assert(await header.isVisible(), 'Closing restores header');
      assert.deepEqual(await header.boundingBox(), before, 'Header returns without changing geometry');
      await page.close();
    }
    console.log('PASS browser fixture: mobile/desktop, light/dark; full player and release preview hide the header, dismissal clickable, header position restored');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
