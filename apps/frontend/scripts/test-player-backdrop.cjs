const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.join(__dirname,'../src');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'lib/player-backdrop.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsObject});
const {isDesktopPlayerBackdrop}=exportsObject;
const panel={},control={};
assert(isDesktopPlayerBackdrop({target:panel,currentTarget:panel},1440));
assert(!isDesktopPlayerBackdrop({target:control,currentTarget:panel},1440),'interactive children do not dismiss');
assert(!isDesktopPlayerBackdrop({target:panel,currentTarget:panel},390),'mobile behavior stays unchanged');
assert(!isDesktopPlayerBackdrop({target:panel,currentTarget:panel},700));
for(const file of ['components/mini-player.tsx','components/player-page-client.tsx'])assert(fs.readFileSync(path.join(root,file),'utf8').includes('isDesktopPlayerBackdrop(event,window.innerWidth)'));
(async()=>{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
  try{
    const page=await browser.newPage();
    for(const width of [390,1440]){
      await page.setViewportSize({width,height:844});
      await page.setContent('<section id="panel" style="width:300px;height:300px"><button id="control">Play</button><input aria-label="comment" /><div id="wave" role="slider" style="height:40px">Waveform</div></section>');
      await page.evaluate(fn=>{const close=eval(`(${fn})`);window.closedCount=0;document.querySelector('#panel').addEventListener('click',event=>{if(close(event,innerWidth))window.closedCount++;});},isDesktopPlayerBackdrop.toString());
      for(const target of ['#control','input','#wave'])await page.locator(target).click();
      assert.equal(await page.evaluate(()=>window.closedCount),0);
      await page.locator('#panel').click({position:{x:280,y:280}});
      assert.equal(await page.evaluate(()=>window.closedCount),width>700?1:0);
    }
    console.log('PASS browser: desktop empty background dismisses; buttons, input, waveform and mobile stay active');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
