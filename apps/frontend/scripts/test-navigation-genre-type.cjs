const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const css=['record-archive.css','shelf-web.css','shelf-theme.css'].map(file=>fs.readFileSync(path.join(__dirname,'../src/components',file),'utf8')).join('\n');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
  try{
    for(const width of [390,1440,2560])for(const theme of ['light','dark']){
      const page=await browser.newPage({viewport:{width,height:900}});
      if(process.env.NAVIGATION_TEST_URL){
        await page.goto(process.env.NAVIGATION_TEST_URL,{waitUntil:'domcontentloaded'});
        await page.waitForSelector('.paper-styles button[data-style]');
        await page.evaluate(value=>{document.documentElement.dataset.shelfTheme=value;},theme);
        await page.waitForTimeout(450);
      }else await page.setContent(`<html data-visual-variant="shelf" data-shelf-theme="${theme}"><style>${css}</style><body>
        <section class="paper-archive" style="--grid-top:88px;--grid-bottom:84px">
          <nav class="paper-sections"><button><svg width="17" height="17"></svg><span>Playlists <sup>12</sup></span></button><button><svg width="17" height="17"></svg><span>Mixes <sup>11</sup></span></button>
            <button class="paper-section-collection" aria-current="page"><span>Collection</span></button></nav>
          <nav class="paper-styles"><button>House <sup>161</sup></button><button>Disco <sup>117</sup></button>
            <button aria-pressed="true">Techno</button></nav>
        </section></body></html>`);
      const actual=await page.evaluate(()=>{
        const sample=selector=>{
          const nodes=[...document.querySelectorAll(selector)],style=getComputedStyle(nodes[0]);
          return {color:style.color,font:style.fontFamily,weight:style.fontWeight,line:style.lineHeight,
            rowHeight:nodes[0].getBoundingClientRect().height,step:nodes[1].getBoundingClientRect().top-nodes[0].getBoundingClientRect().top};
        };
        return {pages:sample('.paper-sections>button:not([aria-current="page"])'),genres:sample('.paper-styles button:not([aria-pressed="true"])')};
      });
      for(const field of ['color','font','weight','line'])assert.equal(actual.pages[field],actual.genres[field],`${width}/${theme}: same ${field}`);
      for(const field of ['rowHeight','step'])assert(Math.abs(actual.pages[field]-actual.genres[field])<.1,`${width}/${theme}: same ${field}: ${JSON.stringify(actual)}`);
      const colors=await page.locator('[aria-current="page"],[aria-pressed="true"]').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).color));
      assert(colors.every(color=>color!==actual.pages.color),'Selected pages and genres retain accent colors');
      await page.close();
    }
    console.log(`PASS ${process.env.NAVIGATION_TEST_URL?'live local page':'CSS browser fixture'}: page names match genre color, typography, row height and spacing at mobile/desktop widths in light/dark; active accents preserved`);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
