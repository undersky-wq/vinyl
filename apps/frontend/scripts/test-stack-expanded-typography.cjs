const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
 try{
  const page=await browser.newPage();
  const css=['record-archive.css','shelf-web.css','shelf-theme.css'].map(f=>fs.readFileSync(path.join(__dirname,'../src/components',f),'utf8')).join('\n');
  for(const width of [1024,1440,1920])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:1000});
   const content='<aside class="paper-tracklist"><h2 class="paper-release-heading"><span>Ross From Friends</span></h2><p>The Outsiders <time>2017</time></p><ol><li class="paper-track-line"><button class="paper-track-play"><small>A1</small><span>Track title</span></button><time>5:30</time></li></ol><p class="paper-release-styles">House</p></aside>';
   await page.setContent(`<html data-visual-variant="shelf" data-shelf-theme="${theme}"><style>${css}</style><body><section id="shelf" class="paper-archive is-open is-expanded">${content}</section><section id="stack" class="paper-archive is-stack is-open is-expanded">${content}</section></body></html>`);
   const read=selector=>page.locator(selector).first().evaluate(el=>{
    const props=['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color','animationName','animationDuration','animationDelay'];
    return Object.fromEntries(props.map(p=>[p,getComputedStyle(el)[p]]));
   });
   for(const selector of ['h2','p','small','.paper-track-play','.paper-track-line>time','.paper-release-styles'])assert.deepEqual(await read(`#stack ${selector}`),await read(`#shelf ${selector}`));
   assert.equal(await page.locator('#stack .paper-tracklist').evaluate(e=>getComputedStyle(e).paddingLeft),'20px');
   if(width>=1440)assert.equal(await page.locator('#stack .paper-tracklist').evaluate(e=>getComputedStyle(e).width),await page.locator('#shelf .paper-tracklist').evaluate(e=>getComputedStyle(e).width));
  }
  console.log('PASS: expanded desktop Stack matches Shelf typography, metadata, tracks, genres, reveal animation and column spacing in both themes');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
