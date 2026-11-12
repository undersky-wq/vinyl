const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
  try{
    for(const width of [390,1440])for(const theme of ['light','dark']){
      const page=await browser.newPage({viewport:{width,height:900}});
      await page.context().addCookies([{name:'vinyl_session',value:'local-page-error-test',url:'http://localhost:3100'}]);
      await page.addInitScript(theme=>{
        localStorage.setItem('mityadima-shelf-theme',theme);localStorage.setItem('mityadima-cookie-choice-v1','necessary');
        const track={id:'error-track',releaseId:'error-release',artist:'Artist',title:'Track',audioUrl:'/no-test-audio.mp3',coverUrl:'/icon.png'};
        sessionStorage.setItem('vinyl-player-state',JSON.stringify({currentTrack:track,queue:[track],currentIndex:0,currentTime:0}));
      },theme);
      await page.goto('http://localhost:3100/?layout=tracks',{waitUntil:'domcontentloaded'});
      await page.locator('.site-error-page').waitFor({state:'visible'});
      await page.locator('.mini-player').waitFor({state:'visible'});
      const style=await page.evaluate(()=>{
        const player=getComputedStyle(document.querySelector('.mini-player'));
        return {variant:document.documentElement.dataset.visualVariant,theme:document.documentElement.dataset.shelfTheme,
          nav:getComputedStyle(document.querySelector('.mobile-nav')).display,radius:player.borderRadius,font:player.fontFamily,
          error:getComputedStyle(document.querySelector('.site-error-page')).backgroundColor};
      });
      assert.equal(style.variant,'shelf');assert.equal(style.theme,theme);assert.equal(style.nav,'none');assert.equal(style.radius,'0px');assert(style.font.includes('Arial'));
      assert.equal(style.error,theme==='dark'?'rgb(17, 18, 20)':'rgb(255, 255, 255)');
      await page.close();
    }
    console.log('PASS: isolated page-loading failures retain Shelf mini-player, hide legacy mobile navigation and follow light/dark themes at mobile/desktop widths');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
