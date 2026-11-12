const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width === 390, isMobile: width === 390 });
      page.setDefaultTimeout(10000);
      await page.addInitScript(() => localStorage.setItem('mityadima-cookie-choice-v1', 'necessary'));
      await page.goto(process.env.TOOLTIP_TEST_URL || 'http://localhost:3100/?layout=tracks', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('html[data-site-tooltips]');
      const target = page.locator('.paper-release-browse').first();
      await target.waitFor({ state: 'visible' });
      await page.waitForTimeout(1200);
      assert.equal(await target.getAttribute('title'), null, 'Eye has no browser-native tooltip');
      const metadata = page.locator('.paper-release-identity').first();
      for (const selector of ['.paper-release-identity-row>b', '.paper-release-identity-title', '.paper-release-label>span:not(.paper-release-control-slot)']) {
        const text = metadata.locator(selector).first();
        if (!await text.count()) continue;
        assert.equal(await text.getAttribute('title'), null);
        assert.equal(await text.getAttribute('data-site-tooltip'), null);
        await text.hover(); await page.waitForTimeout(250);
        assert(await page.locator('.site-tooltip').isHidden(), 'Artist, release and label text do not show tooltips');
      }
      await target.hover();
      const tip = page.locator('.site-tooltip');
      await tip.waitFor({ state: 'visible' });
      const anchorBox = await target.boundingBox(), tipBox = await tip.boundingBox();
      assert(tipBox.y >= anchorBox.y + anchorBox.height, 'Tooltip opens below its control when there is room');
      console.log(`Tooltip visible at ${width}px`);
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => { document.documentElement.dataset.shelfTheme = theme; }, theme);
        const style = await tip.evaluate(node => {
          const css = getComputedStyle(node), box = node.getBoundingClientRect();
          return { bg: css.backgroundColor, color: css.color, font: css.fontFamily, size: css.fontSize, radius: css.borderRadius,
            left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: innerWidth, height: innerHeight };
        });
        assert.equal(style.bg, theme === 'dark' ? 'rgb(17, 18, 20)' : 'rgb(255, 255, 255)');
        assert.equal(style.color, theme === 'dark' ? 'rgb(243, 243, 241)' : 'rgb(17, 17, 17)');
        assert(style.font.startsWith('Arial')); assert.equal(style.size, '12px'); assert.equal(style.radius, '0px');
        assert(style.left >= 0 && style.right <= style.width && style.top >= 0 && style.bottom <= style.height);
      }
      assert((await target.getAttribute('aria-describedby')).includes(await tip.getAttribute('id')));
      await page.keyboard.press('Escape'); await tip.waitFor({ state: 'hidden' });
      await page.evaluate(() => {
        const button = document.createElement('button'); button.id = 'tooltip-edge'; button.dataset.tooltip = 'A tooltip at the viewport edge';
        button.textContent = 'Edge'; button.style.cssText = 'position:fixed;bottom:0;right:0;z-index:2147480000'; document.body.append(button);
      });
      const edge = page.locator('#tooltip-edge'); await edge.focus(); await tip.waitFor({ state: 'visible' });
      assert((await tip.boundingBox()).y < (await edge.boundingBox()).y, 'Bottom-edge control falls back above to avoid clipping');
      const before = await edge.evaluate(node => getComputedStyle(node, '::after').display);
      assert.equal(before, 'none', 'Legacy pseudo-tooltip is not duplicated');
      await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await tip.waitFor({ state: 'hidden' });
      await page.evaluate(() => {
        const dialog = document.createElement('dialog'); dialog.id = 'tooltip-dialog';
        dialog.innerHTML = '<button data-site-tooltip="Dialog action">Action</button>'; document.body.append(dialog); dialog.showModal();
      });
      await page.waitForTimeout(100);
      await page.locator('#tooltip-dialog button').evaluate(node => node.blur());
      await page.locator('#tooltip-dialog button').focus(); await tip.waitFor({ state: 'visible' });
      assert(await tip.evaluate(node => node.matches(':popover-open')), 'Tooltip uses top layer above modal dialogs');
      await page.evaluate(() => document.querySelector('#tooltip-dialog').close());
      if (width === 390) {
        await edge.tap(); await page.waitForTimeout(250);
        assert(await tip.isHidden(), 'Touch tap does not leave an obstructing tooltip');
      }
      const flip = await page.evaluate(() => {
        const overlay = document.createElement('div'); overlay.className = 'mobile-player-overlay';
        overlay.innerHTML = '<button class="player-page__cover-flip player-page__cover-flip--metadata">Flip</button>'; document.body.append(overlay);
        const style = getComputedStyle(overlay.firstChild);
        const result = { border: style.borderTopWidth, background: style.backgroundColor, shadow: style.boxShadow };
        overlay.remove(); return result;
      });
      assert.deepEqual(flip, { border: '0px', background: 'rgba(0, 0, 0, 0)', shadow: 'none' }, 'Full-player flip control has no frame/background');
      await page.close();
    }
    console.log('PASS: live tooltips follow light/dark theme, Arial 12px, viewport bounds, hover/keyboard/Escape, modal top layer, no duplicate/native or sticky touch tips');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
