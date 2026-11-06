const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
  try{
    for(const width of [1440,390]){
      const page=await browser.newPage({viewport:{width,height:844}});
      await page.goto(process.env.MOTION_TEST_URL||'http://127.0.0.1:3100/',{waitUntil:'domcontentloaded'});
      await page.waitForSelector('.paper-record');
      await page.getByRole('button',{name:/^Grid$|^Сетка$/}).click();
      await page.waitForTimeout(1500);
      for(const scroll of [0,900]){
        await page.locator('.paper-row').evaluate((node,top)=>node.scrollTo(0,top),scroll);
        await page.waitForTimeout(300);
        const index=await page.locator('.paper-record').evaluateAll(nodes=>nodes.find(node=>{
          const box=node.getBoundingClientRect();return box.top>250&&box.bottom<650&&box.left>=0;
        })?.dataset.index);
        assert(index!==undefined, 'A visible grid sleeve is available');
        // Exercise expansion independently of hover hit areas; verify the
        // expanded artwork's actual on-screen hit region below.
        await page.locator(`.paper-record[data-index="${index}"] .paper-record-open`).dispatchEvent('click');
        await page.waitForTimeout(1500);
        const result=await page.locator('.paper-record.is-selected').evaluate(node=>{
          const image=node.querySelector('img'),box=image.getBoundingClientRect();
          const center={x:box.x+box.width/2,y:box.y+box.height/2};
          return {loaded:image.complete&&image.naturalWidth>0,top:box.top,bottom:box.bottom,width:box.width,
            hit:document.elementsFromPoint(center.x,center.y).some(element=>element.closest('.paper-record.is-selected')===node)};
        });
        assert(result.loaded, 'Expanded artwork is loaded');
        assert(result.width>100&&result.top>=0&&result.bottom<=844, `${width}/${scroll}: artwork remains in the viewport: ${JSON.stringify(result)}`);
        assert(result.hit, `${width}/${scroll}: expanded artwork is not clipped by the scrolling grid`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1200);
      }
      await page.close();
    }
    console.log('PASS local browser: expanded Grid artwork is loaded, visible and reachable on mobile/desktop, at the top and after scrolling');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
