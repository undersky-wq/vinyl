const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
  try {
    for (const width of [1440,390]) {
      const page = await browser.newPage({viewport:{width,height:844},deviceScaleFactor:width<700?3:1});
      await page.goto(process.env.MOTION_TEST_URL || 'http://127.0.0.1:3100/', {waitUntil:'domcontentloaded'});
      await page.waitForSelector('.paper-record img');
      const shelf = page.getByRole('button',{name:/^Shelf$|^Полка$/});
      const stack = page.getByRole('button',{name:/^Stack$|^Стопка$/});
      await shelf.click();
      await page.waitForTimeout(1500);
      for (let cycle=0;cycle<2;cycle++) {
        await page.evaluate(() => {
          window.motionTrace = [];
          window.coverSourceChanges = [];
          window.motionObserver = new MutationObserver(records => {
            window.coverSourceChanges.push(...records.map(record => record.attributeName));
          });
          window.motionObserver.observe(document.querySelector('.paper-transport'), {
            subtree:true,attributes:true,attributeFilter:['src','srcset'],
          });
          const started = performance.now();
          const sample = () => {
            const nav = document.querySelector('.paper-styles');
            window.motionTrace.push({top:nav.offsetTop,height:nav.offsetHeight,
              transitions:nav.getAnimations().map(animation => animation.transitionProperty),
              layers:[...document.querySelectorAll('.paper-record')].every(card => getComputedStyle(card).willChange.includes('transform'))});
            if (performance.now()-started<1600) requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        });
        await stack.click();
        await page.waitForTimeout(1700);
        const result = await page.evaluate(() => {
          window.motionObserver.disconnect();
          return {frames:window.motionTrace,changes:window.coverSourceChanges};
        });
        assert(result.frames.length>5, 'Sampled multiple animation frames');
        assert.deepEqual(result.changes, [], 'Loaded cover sources stay fixed in Shelf/Stack');
        assert(result.frames.every(frame => frame.layers), 'Mounted covers retain their compositor hint');
        if (width>700) {
          assert(result.frames.every(frame => !frame.transitions.includes('top')&&!frame.transitions.includes('bottom')), 'Genres never animate layout properties');
          assert(new Set(result.frames.map(frame=>frame.top)).size<=2, 'Genre top committed only once');
          assert(new Set(result.frames.map(frame=>frame.height)).size<=2, 'Genre height committed only once');
        }
        await shelf.click();
        await page.waitForTimeout(1500);
      }
      await page.close();
    }
    console.log('PASS local browser: repeated Shelf/Stack transitions on mobile/desktop keep image sources and cover layers stable; desktop genres animate without per-frame layout changes');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
