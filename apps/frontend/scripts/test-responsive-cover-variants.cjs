const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const root=path.join(__dirname,'../src');
function compile(source,context={}) {
  const exports={};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require,...context});
  return exports;
}
const images=compile(fs.readFileSync(path.join(root,'lib/release-images.ts'),'utf8'));
const sources=compile(fs.readFileSync(path.join(root,'lib/cover-sources.ts'),'utf8'));
const source=fs.readFileSync(path.join(root,'components/paper-archive.tsx'),'utf8');
const component=compile(source.slice(source.indexOf('const coverFull'),source.indexOf('function normalizeStyleSelection'))+'\nexports.ShelfCoverImage=ShelfCoverImage;',{
  ...images,...sources,window:{matchMedia:()=>({matches:false})},
  useState:React.useState,useEffect:React.useEffect,decodeCover:()=>Promise.resolve(true),
  ShelfDiscTransition:({children})=>React.createElement(React.Fragment,null,children),retryCoverImage:()=>false,
}).ShelfCoverImage;
const url=name=>`http://cover-variants.test/${name}.svg`;
const release={id:'double',coverStorageUrl:url('a-full'),coverThumbStorageUrl:url('a-small'),coverMediumStorageUrl:url('a-medium'),
  backCoverUrl:url('b-full'),backCoverThumbUrl:url('b-small'),backCoverMediumUrl:url('b-medium'),
  secondCoverUrl:url('c-full'),secondCoverThumbUrl:url('c-small'),secondCoverMediumUrl:url('c-medium'),
  secondBackCoverUrl:url('d-full'),secondBackCoverThumbUrl:url('d-small'),secondBackCoverMediumUrl:url('d-medium')};
assert.equal(images.getBackCoverUrl(release,2,'thumb'),url('d-small'));
assert.equal(images.getSecondFrontCoverUrl(release,'medium'),url('c-medium'));
assert.equal(images.playingCoverImage({position:'D1',coverUrl:url('d-full'),backCoverUrl:url('d-full'),backCoverMobileUrl:url('d-small')}).src,url('d-small'));

(async()=>{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
  try {
    for(const [width,dpr,size,expected,serverEstimate,compactPreview,deckPreview]of [[390,3,230,'medium',true,true,true],[390,3,240,'medium',false,false,true],[390,1,230,'medium',false,true,true],[390,3,230,'small',true,true],[390,3,240,'small',false,true],[390,3,320,'small',false,true],[1440,2,320,'full',false,true,true],[390,3,230,'small',true],[390,3,81,'small'],[390,3,72,'small'],[390,3,240,'medium'],[700,1,320,'small'],[701,3,72,'full'],[1440,1,214,'full'],[1440,1,320,'full'],[1440,2,214,'full'],[1440,1,420,'full']])for(const disc of [1,2]){
      const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:dpr});
      await page.route('http://cover-variants.test/**',route=>{
        const size=route.request().url().includes('small')?320:route.request().url().includes('medium')?900:1400;
        return route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="red"/></svg>`});
      });
      const render=highQuality=>{
        const html=renderToStaticMarkup(React.createElement(component,{release,disc,compactPreview,deckPreview,flipped:true,eager:true,priority:false,selected:highQuality,highQuality,displaySize:size,desktopViewport:serverEstimate||width>700}));
        return `<style>.paper-record-front,.paper-record-back{position:relative;display:block;width:${size}px;height:${size}px}img{width:100%;height:100%;object-fit:cover}.paper-record-hires{position:absolute;inset:0}</style>${html}`;
      };
      await page.setContent(render(false));
      await page.waitForFunction(()=>[...document.querySelectorAll('img')].every(img=>img.complete&&img.naturalWidth));
      const actual=await page.locator('img').evaluateAll(nodes=>nodes.map(node=>new URL(node.currentSrc).pathname));
      const initialRendition = expected === 'medium' && !deckPreview ? 'small' : expected;
      assert.deepEqual(actual,[`/${disc===1?'a':'c'}-${initialRendition}.svg`,`/${disc===1?'b':'d'}-${initialRendition}.svg`], 'Mobile decks start with medium A/B/C/D covers, including the desktop SSR estimate');
      assert.equal(await page.locator('img').first().getAttribute('decoding'),'async');
      await page.setContent(render(true));
      await page.waitForFunction(()=>[...document.querySelectorAll('img')].every(img=>img.complete&&img.naturalWidth));
      if(width>700) {
        assert.equal(await page.locator('.paper-record-hires').count(),0,'desktop already uses original images without a duplicate overlay');
        assert.deepEqual(await page.locator('img').evaluateAll(nodes=>nodes.map(node=>new URL(node.currentSrc).pathname)),[`/${disc===1?'a':'c'}-full.svg`,`/${disc===1?'b':'d'}-full.svg`]);
      } else if(!serverEstimate) assert.deepEqual(await page.locator('.paper-record-hires').evaluateAll(nodes=>nodes.map(node=>new URL(node.currentSrc).pathname)),[`/${disc===1?'a':'c'}-full.svg`,`/${disc===1?'b':'d'}-full.svg`]);
      await page.close();
    }
    console.log('PASS browser: mobile Shelf/Stack start with medium A/B/C/D artwork, including SSR; other layouts retain responsive sources; desktop originals and expanded artwork unchanged');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
