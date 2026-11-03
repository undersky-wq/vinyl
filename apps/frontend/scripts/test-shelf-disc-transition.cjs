const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.join(__dirname,'..');
function productionModule(name,file){
  return `${JSON.stringify(name)}:function(require,module,exports){\n${fs.readFileSync(file,'utf8')}\n}`;
}
const react=path.dirname(require.resolve('react'));
const dom=path.dirname(require.resolve('react-dom'));
const scheduler=path.dirname(require.resolve('scheduler'));
const component=ts.transpileModule(fs.readFileSync(path.join(root,'src/components/shelf-disc-transition.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const modules=[
  productionModule('react',path.join(react,'cjs/react.production.js')),
  productionModule('react/jsx-runtime',path.join(react,'cjs/react-jsx-runtime.production.js')),
  productionModule('react-dom',path.join(dom,'cjs/react-dom.production.js')),
  productionModule('react-dom/client',path.join(dom,'cjs/react-dom-client.production.js')),
  productionModule('scheduler',path.join(scheduler,'cjs/scheduler.production.js')),
  `'./shelf-disc-transition.css':function(){}`,
  `'component':function(require,module,exports){${component}}`,
].join(',');
const bundle=`(()=>{const modules={${modules}},cache={};function require(id){if(!cache[id]){const module={exports:{}};cache[id]=module;modules[id](require,module,module.exports);}return cache[id].exports;}
  const React=require('react'),{createRoot}=require('react-dom/client'),{ShelfDiscTransition}=require('component');
  const root=createRoot(document.querySelector('#app'));
  window.showDisc=(disc,flipped)=>{
    const front=disc===1?'a':'c',back=disc===1?'b':'d',url=name=>'http://disc-cover.test/'+name+'.svg';
    const faces=[React.createElement('span',{key:'front',className:'paper-record-face paper-record-front'},React.createElement('img',{src:url(front)})),React.createElement('span',{key:'back',className:'paper-record-face paper-record-back'},React.createElement('img',{src:url(back)}))];
    const cover=React.createElement(ShelfDiscTransition,{disc,flipped,sources:[url(front),url(back)],children:faces});
    const card=React.createElement('div',{className:'paper-record'+(flipped?' is-flipped':''),style:{position:'relative',width:280,height:280,left:40,top:80,transform:'none'}},cover);
    root.render(React.createElement('section',{className:'paper-archive has-motion'},card));
  };})();`;

(async()=>{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
  try{
    const css=['record-archive.css','shelf-theme.css','shelf-disc-transition.css'].map(file=>fs.readFileSync(path.join(root,'src/components',file),'utf8')).join('\n');
    for(const width of [390,1440])for(const theme of ['light','dark']){
      const page=await browser.newPage({viewport:{width,height:700}});
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      let releaseC;const gate=new Promise(resolve=>{releaseC=resolve;});let requestedC=false;
      await page.route('http://disc-cover.test/**',async route=>{
        const letter=new URL(route.request().url()).pathname[1];
        if(letter==='c'){requestedC=true;await gate;}
        const color={a:'#cc2222',b:'#2244cc',c:'#22aa44',d:'#cc9922'}[letter];
        await route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280"><rect width="280" height="280" fill="${color}"/><text x="120" y="150" font-size="36">${letter.toUpperCase()}</text></svg>`});
      });
      await page.setContent(`<html data-visual-variant="shelf" data-shelf-theme="${theme}"><head><style>${css}</style></head><body><div id="app"></div></body></html>`);
      await page.addScriptTag({content:bundle});
      assert(await page.evaluate(()=>typeof window.showDisc==='function'),errors.join('\n'));
      await page.evaluate(()=>window.showDisc(1,true));
      await page.locator('.shelf-disc-layer[data-disc="1"][data-back="true"]').waitFor();
      await page.waitForFunction(()=>Array.from(document.images).every(image=>image.complete&&image.naturalWidth));
      await page.evaluate(()=>window.showDisc(2,false));
      for(let i=0;i<30&&!requestedC;i++)await page.waitForTimeout(10);
      assert(requestedC,'second disc is preloaded');
      await page.waitForTimeout(100);
      assert.equal(await page.locator('.shelf-disc-layer').count(),1,'old disc remains until C is decoded');
      assert.equal(await page.locator('.shelf-disc-layer').getAttribute('data-back'),'true','B never flips to A while C loads');
      const oldFaces=await faceDirections(page,'.shelf-disc-layer');
      assert(oldFaces.front<0&&oldFaces.back>0,'B is still the visible face despite the outer is-flipped class changing');
      await page.evaluate(()=>window.showDisc(1,true));
      releaseC();await page.waitForTimeout(100);
      assert.equal(await page.locator('.shelf-disc-layer').getAttribute('data-disc'),'1','a cancelled disc load cannot commit later');
      await page.evaluate(()=>window.showDisc(2,false));
      await page.locator('.shelf-disc-layer.is-entering[data-disc="2"]').waitFor();
      assert.equal(await page.locator('.is-outgoing').getAttribute('data-back'),'true');
      const outgoing=await faceDirections(page,'.is-outgoing');
      assert(outgoing.front<0&&outgoing.back>0,'outgoing B stays frozen during the crossfade');
      assert.equal(await page.locator('.is-entering').evaluate(element=>getComputedStyle(element).animationName),'shelf-disc-enter');
      assert(await page.locator('.is-entering .paper-record-front img').evaluate(image=>image.complete&&image.naturalWidth>0));
      await page.locator('.is-outgoing').waitFor({state:'detached'});
      await page.evaluate(()=>window.showDisc(1,false));
      await page.locator('.shelf-disc-transition.is-reverse .is-entering[data-disc="1"]').waitFor();
      assert.equal(await page.locator('.is-entering').evaluate(element=>getComputedStyle(element).animationName),'shelf-disc-enter','C to A animates as well');
      await page.locator('.is-outgoing').waitFor({state:'detached'});
      await page.evaluate(()=>window.showDisc(1,true));
      await page.locator('.shelf-disc-layer[data-back="true"]').waitFor();
      assert.equal(await page.locator('.is-entering,.is-outgoing').count(),0,'A/B keeps the ordinary flip instead of a disc replacement');
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.evaluate(()=>window.showDisc(2,false));
      await page.locator('.shelf-disc-layer[data-disc="2"]').waitFor();
      assert.equal(await page.locator('.is-entering,.is-outgoing').count(),0,'reduced motion switches without layered animations');
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log('PASS browser: delayed B-to-C never exposes A; decoded images animate between discs in both directions; same-disc flips, cancelled loads, themes, widths and reduced motion verified');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

function faceDirections(page,selector){return page.locator(selector).evaluate(element=>({front:new DOMMatrixReadOnly(getComputedStyle(element.querySelector('.paper-record-front')).transform).m11,back:new DOMMatrixReadOnly(getComputedStyle(element.querySelector('.paper-record-back')).transform).m11}));}
