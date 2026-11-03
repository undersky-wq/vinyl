const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.join(__dirname,'..');
const options={module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX};
const transpile=file=>ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:options}).outputText;

async function testApi() {
  const exported={},events=[],calls=[];
  let success=true;
  vm.runInNewContext(transpile('src/lib/api.ts'),{
    exports:exported,require:()=>({}),Event,window:{dispatchEvent:event=>events.push(event.type)},
    fetch:async(url,init)=>{
      calls.push({url,init});
      return {ok:success,status:success?200:400,text:async()=>JSON.stringify(url.endsWith('/count')?{count:12}:{id:'new-playlist'})};
    },
  });
  assert.equal(await exported.getPlaylistCount(),12);
  assert.equal(calls[0].url,'/api/playlists/count');
  assert.equal(calls[0].init.credentials,'include');
  assert.equal(calls[0].init.cache,'no-store');
  assert.equal((await exported.createPlaylist({name:'New'})).id,'new-playlist');
  assert.deepEqual(events,['vinyl:playlists-changed']);
  success=false;
  await assert.rejects(()=>exported.createPlaylist({name:'Failed'}));
  assert.equal(events.length,1,'failed creation must not announce a changed count');
}

async function testBrowser() {
  const production=(name,dir,file)=>`${JSON.stringify(name)}:function(require,module,exports){${fs.readFileSync(path.join(path.dirname(require.resolve(dir)),'cjs',file),'utf8')}\n}`;
  const modules=[
    production('react','react','react.production.js'),
    production('react-dom','react-dom','react-dom.production.js'),
    production('react-dom/client','react-dom','react-dom-client.production.js'),
    production('scheduler','scheduler','scheduler.production.js'),
    `'../lib/api':function(require,module,exports){exports.getPlaylistCount=()=>new Promise((resolve,reject)=>window.countRequests.push({resolve,reject}));exports.getLibraryReleasesFeed=()=>new Promise(()=>{});}`,
    `'../providers/auth-provider':function(require,module,exports){exports.useAuth=()=>({user:window.user});}`,
    `'../providers/favorites-provider':function(require,module,exports){exports.useFavorites=()=>({favoriteTrackIds:[]});}`,
    `'counts':function(require,module,exports){${transpile('src/components/use-collection-counts.ts')}}`,
  ].join(',');
  const bundle=`(()=>{const modules={${modules}},cache={};function require(id){if(!cache[id]){const module={exports:{}};cache[id]=module;modules[id](require,module,module.exports);}return cache[id].exports;}
    const React=require('react'),{createRoot}=require('react-dom/client'),{useCollectionCounts}=require('counts');
    window.user={id:'first'};window.countRequests=[];
    const root=createRoot(document.querySelector('#app'));
    function App(){const counts=useCollectionCounts();window.lastCounts=counts;return React.createElement('nav',{},'Playlists ',React.createElement('sup',{},String(counts.playlists)));}
    window.renderUser=user=>{window.user=user;root.render(React.createElement(App));};
    window.renderUser(window.user);window.unmountCounts=()=>root.unmount();})();`;
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
  try {
    for(const width of [390,1440]) {
      const page=await browser.newPage({viewport:{width,height:844}});
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.setContent('<div id="app"></div>');
      await page.addScriptTag({content:bundle});
      await page.waitForFunction(()=>window.countRequests.length===1);
      await page.evaluate(()=>window.countRequests[0].resolve(12));
      await page.waitForFunction(()=>document.querySelector('sup').textContent==='12');
      assert.equal(await page.evaluate(()=>window.lastCounts.mixes),'—','slow library feeds do not block the playlist count');
      await page.evaluate(()=>window.dispatchEvent(new Event('vinyl:playlists-changed')));
      await page.waitForFunction(()=>window.countRequests.length===2);
      assert.equal(await page.locator('sup').textContent(),'12','keep known count during revalidation');
      await page.evaluate(()=>window.dispatchEvent(new Event('vinyl:playlists-changed')));
      await page.waitForFunction(()=>window.countRequests.length===3);
      await page.evaluate(()=>window.countRequests[2].resolve(13));
      await page.waitForFunction(()=>document.querySelector('sup').textContent==='13');
      await page.evaluate(()=>window.countRequests[1].resolve(12));
      await page.waitForTimeout(25);
      assert.equal(await page.locator('sup').textContent(),'13','stale requests cannot overwrite a newer count');
      await page.evaluate(()=>window.dispatchEvent(new Event('vinyl:playlists-changed')));
      await page.waitForFunction(()=>window.countRequests.length===4);
      await page.evaluate(()=>window.countRequests[3].reject(new Error('offline')));
      await page.waitForTimeout(25);
      assert.equal(await page.locator('sup').textContent(),'13','a temporary failure keeps the last confirmed count');
      await page.evaluate(()=>{window.dispatchEvent(new Event('vinyl:playlists-changed'));window.renderUser({id:'second'});});
      await page.waitForFunction(()=>window.countRequests.length===6);
      assert.equal(await page.locator('sup').textContent(),'—','never show another account count');
      await page.evaluate(()=>window.countRequests[4].resolve(99));
      await page.waitForTimeout(25);
      assert.equal(await page.locator('sup').textContent(),'—','old-account responses are ignored');
      await page.evaluate(()=>window.countRequests[5].resolve(0));
      await page.waitForFunction(()=>document.querySelector('sup').textContent==='0');
      await page.evaluate(()=>window.renderUser(null));
      await page.waitForFunction(()=>document.querySelector('sup').textContent==='0');
      await page.evaluate(()=>window.dispatchEvent(new Event('vinyl:playlists-changed')));
      await page.waitForTimeout(25);
      assert.equal(await page.evaluate(()=>window.countRequests.length),6,'guests do not request a private count');
      await page.evaluate(()=>window.unmountCounts());
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log('PASS browser: page count loads without playlists/tracks or other counters, creation refresh, race protection, account changes, empty and guest states, mobile/desktop');
  } finally {await browser.close();}
}

(async()=>{
  await testApi();
  console.log('PASS: lightweight authenticated no-cache count request and successful-create notification');
  if(process.env.PLAYLIST_PAGE_COUNT_BROWSER==='1')await testBrowser();
})().catch(error=>{console.error(error);process.exitCode=1;});
