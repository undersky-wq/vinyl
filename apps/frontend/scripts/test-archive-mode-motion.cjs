const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
  try {
    for (const width of [1440,2560,390]) {
      const page = await browser.newPage({viewport:{width,height:844},deviceScaleFactor:width<700?3:1});
      await page.addInitScript(() => {
        const track={id:'motion-preview-0-A1',releaseId:'motion-preview-0',title:'Preview A1',artist:'Preview artist',audioUrl:'/api/preview-silence.wav',coverUrl:'/api/preview-cover/0/320',durationSec:240,playbackSource:{section:'collection',href:'/'}};
        sessionStorage.setItem('vinyl-player-state',JSON.stringify({currentTrack:track,queue:[track],currentIndex:0,currentTime:20}));
      });
      await page.goto(process.env.MOTION_TEST_URL || 'http://127.0.0.1:3100/', {waitUntil:'domcontentloaded'});
      await page.waitForSelector('.paper-record img');
      const shelf = page.getByRole('button',{name:/^Shelf$|^Полка$/});
      const stack = page.getByRole('button',{name:/^Stack$|^Стопка$/});
      await shelf.click();
      await page.waitForTimeout(1500);
      await page.evaluate(()=>{
        window.originalDeckNodes=[...document.querySelectorAll('.paper-record')].filter(node=>{
          const box=node.getBoundingClientRect();
          return box.right>0&&box.left<innerWidth&&box.bottom>0&&box.top<innerHeight;
        });
      });
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
        assert(await page.evaluate(()=>window.originalDeckNodes.every(node=>node.isConnected)), 'Visible Shelf sleeves stay mounted after Stack settles');
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
      // Interrupt the morph instead of waiting for its endpoint each time.
      for (let step=0;step<30;step++) {
        await (step%2 ? shelf : stack).dispatchEvent('click');
        await page.waitForTimeout(45);
      }
      await shelf.dispatchEvent('click');
      await page.waitForTimeout(1800);
      const settled = await page.evaluate(desktop => {
        const selectors=['.archive-page-header',...(desktop?['.paper-heading']:[]),'.paper-styles','.mini-player','.mini-player__timeline'];
        return selectors.map(selector => {
          const node=document.querySelector(selector);
          if(!node)return {selector,missing:true};
          const style=getComputedStyle(node),box=node.getBoundingClientRect();
          return {selector,backface:style.backfaceVisibility,opacity:Number(style.opacity),visibility:style.visibility,width:box.width,
            running:node.getAnimations({subtree:true}).filter(animation=>animation.playState==='running').length};
        });
      }, width>700);
      for(const item of settled) {
        assert(!item.missing, `${item.selector} remains mounted`);
        assert.equal(item.backface,'visible', `${item.selector}: 2D UI never uses cover backface culling`);
        assert.equal(item.visibility,'visible', `${item.selector}: no stale hidden state`);
        assert.equal(item.opacity,1, `${item.selector}: no stale fade`);
        assert(item.width>0, `${item.selector}: no collapsed UI`);
        assert.equal(item.running,0, `${item.selector}: interrupted animations settle`);
      }
      const progress=page.locator('.mini-player .progress');
      const seekBox=await progress.boundingBox();
      if(!seekBox || seekBox.width<=30) console.log(JSON.stringify({width,settled,seekBox,boxes:await page.locator('.mini-player,.mini-player__timeline,.mini-player .seekbar,.mini-player .progress').evaluateAll(nodes=>nodes.map(n=>({class:n.className,width:n.getBoundingClientRect().width,display:getComputedStyle(n).display,columns:getComputedStyle(n).gridTemplateColumns,flex:getComputedStyle(n).flex}))) }));
      assert(seekBox?.width>30,'Seek line retains its width after rapid toggles');
      await page.close();
    }
    console.log('PASS local browser: 30 interrupted Shelf/Stack switches at 390/1440/2560px; text, genres and mini-player seek line stay visible and settle; image sources and genre layout remain stable');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
