const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const css = ['record-archive.css','shelf-web.css','shelf-theme.css']
  .map(file => fs.readFileSync(path.join(__dirname,'../src/components',file),'utf8')).join('\n');

(async () => {
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    await page.setContent(`<html data-visual-variant="shelf" data-shelf-theme="light"><style>${css}</style>
      <section class="paper-archive is-playlist is-listing"><article class="paper-list-tracks">
        <div class="paper-track-line is-drop-before">Before</div>
        <div class="paper-track-line is-drop-after is-playing">After, playing</div>
        <div class="paper-track-line is-drop-before is-playing">Before, playing</div>
        <div class="paper-track-line is-drop-after">After</div>
      </article></section></html>`);
    for (const theme of ['light','dark','light']) {
      await page.evaluate(value => { document.documentElement.dataset.shelfTheme=value; }, theme);
      const shadows = await page.locator('.paper-track-line').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).boxShadow));
      const ink = theme==='dark' ? 'rgb(243, 243, 241)' : 'rgb(17, 17, 17)';
      assert(shadows.every(shadow => shadow.startsWith(ink)), `${theme}: insertion lines use theme foreground, including the playing row`);
      assert(shadows[0].includes('0px -2px'), 'Before line remains above the row');
      assert(shadows[1].includes('0px 2px'), `After line remains below the row: ${shadows[1]}`);
      assert(shadows[2].includes('0px -2px'), 'Playing row retains the before insertion line');
      assert(shadows[3].includes('0px 2px'), 'Ordinary row retains the after insertion line');
    }
    console.log('PASS CSS browser fixture: playlist insertion lines follow light/dark theme for before/after and playing rows, without changing drag logic');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
