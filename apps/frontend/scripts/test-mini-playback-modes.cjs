const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
 try{
  const page=await browser.newPage();
  const css=['app/globals.css',...['record-archive.css','shelf-web.css','shelf-theme.css'].map(f=>'components/'+f)].map(f=>fs.readFileSync(path.join(__dirname,'../src',f),'utf8')).join('\n');
  for(const theme of ['light','dark'])for(const width of [390,1440]){
   await page.setViewportSize({width,height:900});
   await page.setContent(`<html data-visual-variant="shelf" data-shelf-theme="${theme}"><style>${css}</style><body><section class="paper-archive"></section><div class="mini-player"><div class="mini-player__controls"><button class="player-icon-button mini-player__mode mini-player__shuffle" aria-pressed="false">Shuffle</button><button class="player-main-button">Play</button><button class="player-icon-button mini-player__mode mini-player__repeat" aria-pressed="true">Repeat</button></div></div></body></html>`);
   const values=await page.locator('.mini-player__mode').evaluateAll(es=>es.map(e=>({display:getComputedStyle(e).display,color:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor,radius:getComputedStyle(e).borderRadius,dot:getComputedStyle(e,'::before').content})));
   if(width<=700)for(const value of values)assert.equal(value.display,'none');
   else{
    for(const value of values){assert.notEqual(value.display,'none');assert.equal(value.bg,'rgba(0, 0, 0, 0)');assert.equal(value.radius,'0px');}
    assert.notEqual(values[0].color,values[1].color);assert.equal(values[1].dot,'""');assert.equal(values[0].dot,'none');
   }
  }
  console.log('PASS: desktop mini-player shuffle/repeat visible, borderless, theme-aware active indicator; mobile controls unchanged');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
