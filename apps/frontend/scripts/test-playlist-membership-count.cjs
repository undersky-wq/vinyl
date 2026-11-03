const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const root=path.join(__dirname,'..');
function load(file,mock=require){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:mock});return exports;}
const {playlistMembershipCounts}=load('src/lib/playlist-membership.ts');
const item=id=>({track:{id}});
const playlists=[{id:'first',items:[item('one'),item('many'),item('many')]},{id:'second',items:[item('many')]},{id:'third',items:[item('many')]}];
let counts=playlistMembershipCounts(playlists);
assert.equal(counts.get('one'),1);assert.equal(counts.get('many'),3);assert.equal(counts.get('none'),undefined);
assert.equal(playlistMembershipCounts([...playlists,playlists[0]]).get('many'),3,'count distinct playlists, not duplicate entries');
const {TrackPlaylistMenu}=load('src/components/track-actions.tsx',name=>{
  if(name.endsWith('.css'))return {};
  if(name==='react')return {...React,useState:value=>[value,()=>{}],useEffect:()=>{},useLayoutEffect:()=>{},useRef:value=>({current:value})};
  if(name==='../providers/playlists-provider')return {usePlaylists:()=>({playlists,getTrackPlaylistCount:id=>counts.get(id)||0})};
  if(name==='../providers/auth-provider')return {useAuth:()=>({requireAuth:()=>true})};
  if(name==='../providers/favorites-provider'||name==='../lib/playlist-popup-position')return {};
  return require(name);
});
for(const [id,expected] of [['none',0],['one',0],['many',3]]){
  const html=renderToStaticMarkup(TrackPlaylistMenu({trackId:id,lang:'ru'}));
  assert.equal(html.includes('track-playlist-menu__count'),expected>1);
  if(expected>1)assert(html.includes('>3</span>'));
}
counts=playlistMembershipCounts([playlists[0]]);
assert(!renderToStaticMarkup(TrackPlaylistMenu({trackId:'many',lang:'ru'})).includes('track-playlist-menu__count'),'badge disappears after removal from all but one playlist');
console.log('PASS: distinct playlist count; hide at 0/1, show at 2+, update after removal; common site-wide trigger');
if(process.env.PLAYLIST_COUNT_BROWSER==='1')(async()=>{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
  try{
    const page=await browser.newPage();
    const css=['src/app/globals.css','src/components/record-archive.css','src/components/shelf-web.css','src/components/shelf-theme.css','src/components/track-action-colors.css','src/components/playlist-count.css'].map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n');
    for(const width of [390,1440])for(const theme of ['light','dark'])for(const player of [false,true])for(const playing of [false,true]){
      await page.setViewportSize({width,height:1000});
      const positions=[];
      for(const count of [1,2,12]){
        counts=new Map([['many',count]]);
        const button=renderToStaticMarkup(TrackPlaylistMenu({trackId:'many',lang:'ru'}));
        await page.setContent(`<html data-visual-variant="shelf" data-shelf-theme="${theme}"><head><style>${css}</style></head><body><div class="${player?'player-page':'paper-archive'}"><div class="${player?'player-page__secondary-actions':'paper-track-line'}${playing?' is-playing':''}" style="position:relative;top:200px;left:100px"><div class="paper-track-actions">${button}</div></div></div></body></html>`);
        const position=await page.locator('.track-playlist-menu__trigger svg').boundingBox();
        positions.push(position);
        if(count>1){
          const counter=page.locator('.track-playlist-menu__count');
          const badge=await counter.boundingBox();
          assert(badge.x>=position.x+position.width-1,'badge stays at the right corner');assert(badge.y<position.y,'badge starts above the icon');
          for(const state of ['idle','hover','focus']){
            if(state==='hover')await page.locator('.track-playlist-menu__trigger').hover();
            if(state==='focus')await page.locator('.track-playlist-menu__trigger').focus();
            const color=await counter.evaluate(element=>getComputedStyle(element).color);
            assert.equal(color,'rgb(39, 135, 77)',`${width}/${theme}/${player?'player':'list'}/${playing?'playing':'idle'}/${state}: badge stays green`);
            assert.equal(color,await page.locator('.track-playlist-menu__trigger svg').evaluate(element=>getComputedStyle(element).color),'badge matches the saved playlist icon');
          }
        }
      }
      assert.deepEqual(positions[1],positions[0],'count does not shift or resize the icon');
      assert.deepEqual(positions[2],positions[0],'two digits do not shift the icon');
    }
    console.log('PASS browser: fixed upper-right badge and matching green icon/count in playing and idle rows, full player, hover/focus, mobile/desktop and both themes');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
