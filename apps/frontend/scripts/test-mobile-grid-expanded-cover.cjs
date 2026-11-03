const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
  try {
    const css=['record-archive.css','shelf-web.css','shelf-theme.css','shelf-mobile-layout.css']
      .map(file=>fs.readFileSync(path.join(__dirname,'../src/components',file),'utf8')).join('\n');
    for(const [width,height]of [[320,568],[375,667],[390,844],[430,932],[700,500],[1440,900]])for(const playlist of [false,true])for(const theme of ['light','dark']) {
      const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
      const background=theme==='dark'?'#101112':'#fff';
      await page.setContent(`<html data-visual-variant="shelf" data-shelf-theme="${theme}"><style>${css}</style><body><div class="page-shell--home"><section class="home-stage--shelf paper-archive is-grid${playlist?' is-playlist':''}" style="--grid-top:190px;--grid-bottom:84px;--grid-mix:1;--list-mix:0;--grid-size:80px;--side-size:80px;--mobile-heading-top:130px"><header class="paper-header"><div style="position:fixed;left:16px;top:20px;width:250px;height:64px;background:${background}">Header</div><h1 class="paper-heading">Collection : All genres</h1></header><div class="paper-row"><div class="paper-transport"><div class="paper-record" style="--position:0;--split:0;--grid-x:16px;--grid-y:20px"><button class="paper-record-open" aria-label="Release"><span class="paper-record-face paper-record-front" style="background:#d97825"></span></button></div></div><div style="height:5000px;pointer-events:none"></div></div><aside class="paper-tracklist" style="display:none"><h2>Artist : Release</h2><ol><li><button>Track A1</button></li><li><button>Track B1</button></li></ol></aside></section></div></body></html>`);
      const row=page.locator('.paper-row');
      assert.notEqual(await row.evaluate(node=>getComputedStyle(node).clipPath),'none','closed grid still clips beneath the context heading');
      await row.evaluate(node=>{node.scrollTop=500;});
      await page.locator('.paper-archive').evaluate(node=>{node.classList.add('is-open','is-expanded');node.querySelector('.paper-record').classList.add('is-selected');node.querySelector('aside').style.display='';});
      await page.waitForTimeout(900);
      const cover=page.locator('.paper-record.is-selected');
      if(width<=700) {
        assert.equal(await row.evaluate(node=>getComputedStyle(node).clipPath),'none',`${width}px ${theme} ${playlist?'playlist':'collection'}: expanded cover escapes the grid clipping zone`);
        const bounds=await cover.boundingBox();
        assert(bounds.x>=0&&bounds.x+bounds.width<=width+1&&bounds.y>=84&&bounds.y+bounds.height<=height-80,`the whole square stays on screen: ${JSON.stringify({width,height,bounds,playlist,theme})}`);
        const hit=await cover.evaluate(node=>{
          const rect=node.getBoundingClientRect();
          return [[rect.left+3,rect.top+3],[rect.right-3,rect.top+3],[rect.left+3,rect.bottom-3],[rect.right-3,rect.bottom-3]]
            .every(([x,y])=>node.contains(document.elementFromPoint(x,y)));
        });
        assert(hit,'all four cover corners are painted and clickable, including above the old Collection/genre boundary');
        const tracks=await page.locator('.paper-tracklist').boundingBox();
        assert(tracks.y>=bounds.y+bounds.height+10,'tracks stay below the whole cover');
      } else assert.notEqual(await row.evaluate(node=>getComputedStyle(node).clipPath),'none','desktop geometry is unchanged');
      await page.locator('.paper-archive').evaluate(node=>{node.classList.remove('is-open','is-expanded');node.querySelector('.paper-record').classList.remove('is-selected');node.querySelector('aside').style.display='none';});
      assert.notEqual(await row.evaluate(node=>getComputedStyle(node).clipPath),'none','collapsing restores header clipping');
      assert.equal(await row.evaluate(node=>node.scrollTop),500,'opening and closing preserve the grid scroll position');
      await page.close();
    }
    console.log('PASS browser: mobile Collection/Playlists grid expands the whole cover above the old heading boundary; four corners visible, tracks below, closed clipping and scroll restored; themes, five mobile sizes and desktop verified');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
