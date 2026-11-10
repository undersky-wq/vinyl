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

// Server-rendered markup must choose medium mobile artwork even before
// hydration knows the viewport, and must not request originals for closed rows.
for (const disc of [1,2]) for (const desktopViewport of [false,true]) for (const selected of [false,true]) {
  const html=renderToStaticMarkup(React.createElement(component,{release,disc,flipped:true,eager:selected,priority:false,selected,highQuality:false,desktopViewport}));
  const mobileSources=[...html.matchAll(/<source media="\(max-width:700px\)" srcSet="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(mobileSources,[url(`${disc===1?'a':'c'}-medium`),url(`${disc===1?'b':'d'}-medium`)]);
  assert(!html.includes('-small.svg'), 'No thumbnail downloads or swaps in collection covers');
  assert(!html.includes('paper-record-hires'), 'Opening the track list alone does not request an original');
  if(!desktopViewport){
    const expanded=renderToStaticMarkup(React.createElement(component,{release,disc,flipped:true,eager:true,priority:true,selected:true,highQuality:true,desktopViewport}));
    assert.equal((expanded.match(/class="paper-record-hires"/g)||[]).length,2,'Fully expanded mobile release includes original front and back');
  }
}
const missingVariants={...release,coverMediumStorageUrl:null,backCoverMediumUrl:null,secondCoverMediumUrl:null,secondBackCoverMediumUrl:null};
for(const disc of [1,2]){
  const fallback=renderToStaticMarkup(React.createElement(component,{release:missingVariants,disc,flipped:false,eager:false,priority:false,selected:false,highQuality:false}));
  assert(fallback.includes(url(`${disc===1?'a':'c'}-full`))&&fallback.includes(url(`${disc===1?'b':'d'}-full`)),'Missing variants retain working originals');
}
console.log('PASS markup: uniform medium mobile A/B/C/D covers, SSR, opened/closed rows, full expansion and missing-variant fallback');
if(process.argv.includes('--markup-only'))process.exit(0);

(async()=>{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
  try {
    for(const [width,dpr,size,expected,serverEstimate,compactPreview,deckPreview]of [[320,1,72,'medium'],[390,3,72,'medium'],[390,3,240,'medium'],[390,3,230,'medium',true,true,true],[390,1,81,'medium'],[700,1,320,'medium'],[701,3,72,'full'],[1440,1,214,'full'],[1440,2,420,'full']])for(const disc of [1,2]){
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
      const initialRendition = expected;
      assert.deepEqual(actual,[`/${disc===1?'a':'c'}-${initialRendition}.svg`,`/${disc===1?'b':'d'}-${initialRendition}.svg`], 'All mobile layouts start with medium A/B/C/D covers, including the desktop SSR estimate');
      assert.equal(await page.locator('img').first().getAttribute('decoding'),'async');
      await page.setContent(render(true));
      await page.waitForFunction(()=>[...document.querySelectorAll('img')].every(img=>img.complete&&img.naturalWidth));
      if(width>700) {
        assert.equal(await page.locator('.paper-record-hires').count(),0,'desktop already uses original images without a duplicate overlay');
        assert.deepEqual(await page.locator('img').evaluateAll(nodes=>nodes.map(node=>new URL(node.currentSrc).pathname)),[`/${disc===1?'a':'c'}-full.svg`,`/${disc===1?'b':'d'}-full.svg`]);
      } else if(!serverEstimate) assert.deepEqual(await page.locator('.paper-record-hires').evaluateAll(nodes=>nodes.map(node=>new URL(node.currentSrc).pathname)),[`/${disc===1?'a':'c'}-full.svg`,`/${disc===1?'b':'d'}-full.svg`]);
      await page.close();
    }
    console.log('PASS browser: all mobile layouts start with medium A/B/C/D artwork, including SSR; desktop originals and expanded artwork unchanged');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
