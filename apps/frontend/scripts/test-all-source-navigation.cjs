const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const read=f=>fs.readFileSync(path.join(__dirname,'../src',f),'utf8');
const source=read('components/paper-archive.tsx');
const start=source.indexOf('    const focus = (event: Event) => {');
const handler=source.slice(start,source.indexOf("    window.addEventListener('vinyl:focus-source-track',focus);",start));
const applyStart=source.indexOf('  function applySourceFocus(target: URL)');
const apply=source.slice(applyStart,source.indexOf('  useEffect(() => {',applyStart));
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const paths={collection:'/',playlists:'/',mixes:'/mixes',originals:'/tracks',favorites:'/favorites'};
const setters=['setFiltering','setPlaylistTransition','setActivePlaylist','setShowPlaylists','setActiveStyles','setSearch','setAppliedSearch','setSelected','setExpanded','setHovered','setStackMode','setStretch','setPendingSourceFocus'];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  let requests=0;
  await page.route('http://source-matrix.test/**',r=>{requests++;return r.fulfill({contentType:'text/html',body:'<section id="root"><div class="paper-row" style="height:400px;overflow:auto"><div style="height:5000px"></div></div></section>'})});
  await page.goto('http://source-matrix.test/');
  await page.addScriptTag({content:'var exports={};'+compile(read('lib/player-source-navigation.ts'))});
  const setup=compile(`(()=>{
    window.cleanupFocus?.();const c=window.case;
    const activeStyles=[],appliedSearch='',activePlaylist=c.section==='playlists'?'other-list':null;
    const isTrackListInteractive=c.mode==='tracks',isTrackCollection=c.section==='playlists'||c.section==='favorites',selected=null;
    const releases=[{id:'release',tracks:[{id:'playing-track'}]}],stage={current:document.getElementById('root')},listLayout={positions:[1400]},gridBounds={top:100};
    const stopAutoLayout=()=>{};
    const playlistsLoading=false,handledSourceFocus={current:null},initialRouteApplied={current:false},filterTimer={current:null},activeStylesRef={current:[]};
    window.applied={};window.scrollOptions=null;
    ${setters.map(name=>`const ${name}=value=>{window.applied.${name}=value;};`).join('\n')}
    ${apply}
    ${handler}
    window.addEventListener('vinyl:focus-source-track',focus);
    window.cleanupFocus=()=>window.removeEventListener('vinyl:focus-source-track',focus);
    const row=document.querySelector('.paper-row');row.scrollTo=options=>{window.scrollOptions=options;};
  })();`);
  let checked=0;
  for(const from of Object.keys(paths))for(const to of Object.keys(paths))for(const mode of ['shelf','stack','grid','tracks']){
    await page.evaluate(({section,path,mode})=>{window.case={section,mode};history.replaceState(null,'',path+'?layout='+mode)}, {section:from,path:paths[from],mode});
    await page.addScriptTag({content:setup});
    const result=await page.evaluate(section=>{
      const track={id:'playing-track',releaseId:'release',playbackSource:{section,name:'Road music',href:'/?playlist=road-list#styles=House,Techno'}};
      const nav=exports.playerSourceNavigation(track,'ru');
      return {...nav,handled:exports.requestPlayerSourceNavigation(nav.href),applied:window.applied,scroll:window.scrollOptions};
    },to);
    assert.equal(new URL(result.href,'http://source-matrix.test').pathname,paths[to]);
    assert.equal(result.handled,paths[from]===paths[to],`${from} to ${to} in ${mode}: same-route interception`);
    if(result.handled){
      if(result.scroll){assert.equal(result.scroll.behavior,'smooth');assert.equal(mode,'tracks');}
      else{
        assert.equal(result.applied.setActivePlaylist,to==='playlists'?'road-list':null);
        assert.equal(result.applied.setStretch,2);
        assert.deepEqual(result.applied.setPendingSourceFocus,{trackId:'playing-track',releaseId:'release'});
        assert.deepEqual(result.applied.setActiveStyles,to==='collection'?['House','Techno']:[]);
      }
      await page.evaluate(()=>{window.applied={};});
      await page.evaluate(href=>exports.requestPlayerSourceNavigation(href),result.href);
      assert.equal(await page.evaluate(()=>Boolean(window.scrollOptions || window.applied.setPendingSourceFocus)),true,'repeated source click is handled');
    }
    checked++;
  }
  assert.equal(requests,1,'same-route handling performs no additional network requests');
  console.log(`PASS browser: ${checked} source/from-section/layout combinations; all five routes, explicit playlist/context selection, filters, Tracks focus, repeated clicks, cross-page fallback`);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
