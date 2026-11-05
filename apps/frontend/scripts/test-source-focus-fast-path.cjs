const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const source=fs.readFileSync(path.join(__dirname,'../src/components/paper-archive.tsx'),'utf8');
const start=source.indexOf('    const focus = (event: Event) => {');
const handler=source.slice(start,source.indexOf("    window.addEventListener('vinyl:focus-source-track',focus);",start));
const applyStart=source.indexOf('  function applySourceFocus(target: URL)');
const applyContext=source.slice(applyStart,source.indexOf('  useEffect(() => {',applyStart));
const helper=fs.readFileSync(path.join(__dirname,'../src/lib/player-source-navigation.ts'),'utf8');
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  let requests=0;
  await page.route('http://source-focus.test/**',route=>{requests++;return route.fulfill({contentType:'text/html',body:'<section id="stage"><div class="paper-row" style="height:400px;overflow:auto"><div style="height:5000px"></div></div></section>'})});
  await page.goto('http://source-focus.test/?layout=tracks');
  await page.addScriptTag({content:'var exports={};'+compile(helper)});
  await page.addScriptTag({content:compile(`
    const activeStyles=['House'],appliedSearch='',activePlaylist=null,isTrackListInteractive=true,isTrackCollection=false,selected=null;
    const releases=[{id:'release',tracks:[{id:'track'}]}],stage={current:document.getElementById('stage')},listLayout={positions:[1400]},gridBounds={top:100};
    const stopAutoLayout=()=>{window.stopped=true};
    const playlistsLoading=false,handledSourceFocus={current:null},initialRouteApplied={current:false},filterTimer={current:null},activeStylesRef={current:[]};
    window.applied={};
    ${['setFiltering','setPlaylistTransition','setActivePlaylist','setShowPlaylists','setActiveStyles','setSearch','setAppliedSearch','setSelected','setExpanded','setHovered','setStackMode','setStretch','setPendingSourceFocus'].map(name=>`const ${name}=value=>{window.applied.${name}=value;};`).join('\n')}
    ${applyContext}
    ${handler}
    window.addEventListener('vinyl:focus-source-track',focus);
    const row=document.querySelector('.paper-row'),scroll=row.scrollTo.bind(row);
    row.scrollTo=options=>{window.scrollOptions=options;scroll(options)};
  `)});
  const initialRequests=requests;
  assert.equal(await page.evaluate(()=>exports.requestPlayerSourceNavigation('/?layout=tracks&focusTrack=track&focusRelease=release#styles=House')),true);
  assert.deepEqual(await page.evaluate(()=>window.scrollOptions),{top:1300,behavior:'smooth'});
  await page.waitForFunction(()=>document.querySelector('.paper-row').scrollTop>0);
  assert.equal(requests,initialRequests,'same-page source click requires no server round trip');
  assert.equal(await page.evaluate(()=>exports.requestPlayerSourceNavigation('/mixes?layout=tracks&focusTrack=mix')),false,'another page uses normal routing');
  assert.equal(await page.evaluate(()=>exports.requestPlayerSourceNavigation('/?layout=tracks&focusTrack=track&focusRelease=release#styles=Techno')),true);
  assert(page.url().includes('styles=Techno'),'different filters update local route without fetching the page');
  assert.equal(requests,initialRequests);
  const playlistHref='/?layout=tracks&playlist=road-list&focusTrack=track&focusRelease=release';
  assert.equal(await page.evaluate(href=>exports.requestPlayerSourceNavigation(href),playlistHref),true);
  let applied=await page.evaluate(()=>window.applied);
  assert.equal(applied.setActivePlaylist,'road-list');assert.equal(applied.setShowPlaylists,true);
  assert.equal(applied.setStretch,2);assert.deepEqual(applied.setPendingSourceFocus,{trackId:'track',releaseId:'release'});
  await page.evaluate(()=>{window.applied={};});
  assert.equal(await page.evaluate(href=>exports.requestPlayerSourceNavigation(href),playlistHref),true);
  applied=await page.evaluate(()=>window.applied);
  assert.equal(applied.setActivePlaylist,'road-list','repeated identical URL still explicitly selects the playing playlist');
  assert.equal(requests,initialRequests,'playlist selection never requires reloading the shared route');
  console.log('PASS browser: actual archive handler starts smooth scroll immediately with no request, filter changes stay local, cross-page navigation falls back');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
