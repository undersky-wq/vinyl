const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const geometry={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/collection-navigator.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:geometry});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
 try{
  const page=await browser.newPage();
  const css=['record-archive.css','collection-navigator.css'].map(f=>fs.readFileSync(path.join(__dirname,'../src/components',f),'utf8')).join('\n');
  for(const width of [320,360,390,430,700])for(const mode of ['grid','tracks']){
   await page.setViewportSize({width,height:800});
   const g=geometry.collectionGridGeometry(width,4,6,180,true),right=g.left+4*g.size+18;
   await page.setContent(`<style>body{margin:0}${css}</style><section class="paper-archive is-grid ${mode==='tracks'?'is-listing':''}" style="position:relative;width:100%;height:800px"><div id="grid" style="position:absolute;left:${g.left}px;top:200px;width:${right-g.left}px;height:100px"></div><article class="paper-list-tracks" style="top:200px;height:100px">Text</article><div class="collection-navigator is-visible" style="top:150px;height:500px"><div class="collection-navigator__rail"><div class="collection-navigator__seek"><div class="collection-navigator__thumb" style="top:200px"></div></div></div></div></section>`);
   for(const active of [false,true]){
    if(active)await page.locator('.collection-navigator__seek').hover();else await page.mouse.move(0,0);
    await page.waitForTimeout(250);
    const gaps=await page.evaluate(mode=>{
     const content=document.querySelector(mode==='grid'?'#grid':'.paper-list-tracks').getBoundingClientRect();
     const thumb=document.querySelector('.collection-navigator__thumb').getBoundingClientRect();
     return {inside:thumb.left-content.right,outside:innerWidth-thumb.right};
    },mode);
    assert(Math.abs(gaps.inside-gaps.outside)<.6,`${width}px ${mode} active=${active}: ${JSON.stringify(gaps)}`);
    assert(gaps.inside>0);
   }
  }
  console.log('PASS browser: mobile Grid and Tracks have equal content-to-thumb and thumb-to-screen gaps, idle/active, 320-700px');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
