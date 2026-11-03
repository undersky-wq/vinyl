const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.join(__dirname,'..');
const compilerOptions={module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX};
const transpile=file=>ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions}).outputText;
const production=(name,dir,file)=>`${JSON.stringify(name)}:function(require,module,exports){${fs.readFileSync(path.join(path.dirname(require.resolve(dir)),'cjs',file),'utf8')}\n}`;
const modules=[
  production('react','react','react.production.js'),
  production('react/jsx-runtime','react','react-jsx-runtime.production.js'),
  production('react-dom','react-dom','react-dom.production.js'),
  production('react-dom/client','react-dom','react-dom-client.production.js'),
  production('scheduler','scheduler','scheduler.production.js'),
  `'../lib/collection-navigator':function(require,module,exports){${transpile('src/lib/collection-navigator.ts')}}`,
  `'./collection-navigator.css':function(){}`,
  `'lucide-react':function(require,module,exports){exports.Play=()=>require('react').createElement('svg',{'aria-hidden':true,width:11,height:11});}`,
  `'./cover-image':function(require,module,exports){exports.CoverImage=props=>require('react').createElement('img',props);}`,
  `'navigator':function(require,module,exports){${transpile('src/components/collection-navigator.tsx')}}`,
].join(',');
const bundle=`(()=>{const modules={${modules}},cache={};function require(id){if(!cache[id]){const module={exports:{}};cache[id]=module;modules[id](require,module,module.exports);}return cache[id].exports;}
  const React=require('react'),{createRoot}=require('react-dom/client'),{CollectionNavigator}=require('navigator');
  const {stackNavigatorState,stackNavigatorTravel}=require('../lib/collection-navigator');
  const positions=Array.from({length:401},(_,i)=>i*24+(i%3)*2);
  const width=innerWidth;let travel=-width/2;window.seeks=[];window.lastRead=null;
  window.moveStack=progress=>{travel=stackNavigatorTravel(positions,width,progress);};
  const root=createRoot(document.querySelector('#app'));window.unmountNavigator=()=>root.unmount();
  const transport={read:()=>window.lastRead=stackNavigatorState(positions,width,travel),seek:(progress,smooth)=>{window.seeks.push({progress,smooth});window.moveStack(progress);}};
  root.render(React.createElement(CollectionNavigator,{releases:positions.map((_,i)=>({id:String(i),artist:'Artist',title:'Release '+i,cover:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'})),positions,getScroller:()=>null,top:200,bottom:80,playingReleaseId:'200',playing:true,ru:false,onRevealOutside:()=>{},transport}));
})();`;

(async()=>{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
  try {
    const css=fs.readFileSync(path.join(root,'src/components/collection-navigator.css'),'utf8');
    for(const width of [320,390,700])for(const theme of ['light','dark']) {
      const page=await browser.newPage({viewport:{width,height:844},hasTouch:true});
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.setContent(`<style>${css}</style><body style="margin:0;--shelf-web-ink:${theme==='dark'?'#fff':'#111'}"><section class="paper-archive is-stack" style="position:fixed;inset:0"><div id="app"></div></section></body>`);
      await page.addScriptTag({content:bundle});
      const slider=page.locator('[role=slider]');
      await slider.waitFor({state:'attached'});
      assert.equal(await slider.getAttribute('aria-valuenow'),'1');
      await page.evaluate(()=>window.moveStack(.5));
      await page.waitForFunction(()=>Number(document.querySelector('[role=slider]').getAttribute('aria-valuenow'))===201);
      assert.equal(await page.locator('.collection-navigator__thumb').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(52, 120, 219)');
      const bounds=await slider.boundingBox();
      const x=bounds.x+bounds.width/2;
      await page.mouse.move(x,bounds.y+bounds.height*.5);
      await page.mouse.down();
      await page.mouse.move(x,bounds.y+bounds.height,{steps:5});
      await page.mouse.up();
      assert.equal(await page.evaluate(()=>window.seeks.at(-1)?.progress),1,JSON.stringify({width,theme,bounds,seeks:await page.evaluate(()=>window.seeks)}));
      await page.waitForFunction(()=>document.querySelector('[role=slider]').getAttribute('aria-valuenow')==='401');
      await slider.press('Home');
      await page.waitForFunction(()=>document.querySelector('[role=slider]').getAttribute('aria-valuenow')==='1');
      assert.equal(await page.locator('.collection-navigator__playing').isVisible(),false);
      assert.equal(await page.locator('.collection-navigator__playing-label').isVisible(),false);
      await page.evaluate(()=>window.moveStack(.9));
      await page.waitForFunction(()=>Number(document.querySelector('[role=slider]').getAttribute('aria-valuenow'))>350);
      await page.evaluate(()=>{window.unmountNavigator();window.readAtUnmount=window.lastRead;window.moveStack(0);});
      await page.waitForTimeout(180);
      assert(await page.evaluate(()=>window.readAtUnmount===window.lastRead),'polling stops on unmount');
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log('PASS: actual Stack navigator updates on swipes/inertia, drag reaches first/last of 401 releases, mobile playing arrow hidden, blue in both themes, cleanup stops polling');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
