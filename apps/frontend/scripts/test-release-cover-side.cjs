const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
function load(name, dependencies = {}) {
  const exports = {};
  const file = path.join(__dirname, '../src/lib', `${name}.ts`);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText,{exports,require:module=>dependencies[module]});
  return exports;
}
const images=load('release-images');
const {releaseCoverSide,toggleReleaseCoverSide,collapseReleaseCoverSide,trackRowCoverSide}=load('release-cover-side',{'./release-images':images});
const release={id:'record',backCoverUrl:'/back.jpg',tracks:[{id:'a',position:'A1'},{id:'b',position:'B1'},{id:'b2',position:'B2'}]};
const a={id:'a',releaseId:'record',position:'A1'};
const b={id:'b',releaseId:'record',position:'B1'};
assert.equal(releaseCoverSide(release,b).back,true);
for(const stage of ['folded','first-reveal','full-tracklist','collapsed-again']) {
  assert.equal(releaseCoverSide({...release},b).back,true,`${stage}: B playback never flashes to the front`);
}
const original=Object.freeze({});
let overrides=toggleReleaseCoverSide(original,release,b);
assert.equal(Object.keys(original).length,0,'do not mutate previous React state');
assert.equal(releaseCoverSide(release,b,overrides.record).back,false,'manual B-to-A wins over automatic B playback');
for(const stage of ['tracks','first-reveal','full-tracklist']) {
  assert.equal(releaseCoverSide(release,b,overrides.record).back,false,`${stage}: the same manual side drives artwork and button`);
}
overrides=toggleReleaseCoverSide(overrides,release,b);
assert.equal(releaseCoverSide(release,b,overrides.record).back,true,'B can be restored with the next press');
overrides=toggleReleaseCoverSide({},release,a);
assert.equal(releaseCoverSide(release,a,overrides.record).back,true,'A-to-B still works');
assert.equal(releaseCoverSide(release,b,overrides.record).back,true,'the next track follows its own side');
assert.equal(releaseCoverSide(release,a,{playbackKey:'b:B1',back:true}).back,false);
assert.equal(releaseCoverSide(release,{id:'b2',releaseId:'record',position:'B2'},{playbackKey:'b:B1',back:false}).back,true);
assert.equal(releaseCoverSide({...release,tracks:[]},b).back,true,'a playing B track is recognized while its release details load');
assert.equal(releaseCoverSide({...release,tracks:[{id:'a',position:'A1'}]},b,undefined,true).back,false,'compact A artwork stays tied to its own track');
assert.equal(releaseCoverSide({...release,tracks:[{id:'b',position:'B1'}]},a,undefined,true).back,true,'compact B artwork stays tied to its own track');
assert.equal(releaseCoverSide({...release,backCoverUrl:null},b,{playbackKey:'b:B1',back:true}).back,false,'missing back artwork never reveals an empty face');
const withoutBack = {...release,backCoverUrl:null};
const placeholder = toggleReleaseCoverSide({},withoutBack,null,false,true);
assert.equal(releaseCoverSide(withoutBack,null,placeholder.record).back,true,'collection Tracks can explicitly turn to the B placeholder');
assert.equal(releaseCoverSide(withoutBack,null,toggleReleaseCoverSide(placeholder,withoutBack,null,false,true).record).back,false,'placeholder can turn back to A');
assert.equal(releaseCoverSide(withoutBack,b,placeholder.record).back,false,'new playback does not inherit another track placeholder override');
assert.equal(releaseCoverSide(release,null).back,false);
const idle=toggleReleaseCoverSide({},release,null);
assert.equal(releaseCoverSide(release,null,idle.record).back,true,'manual previews also work when nothing is playing');
const collapsedIdle=collapseReleaseCoverSide(idle,release,null,false);
assert.equal(releaseCoverSide(release,null,collapsedIdle.record).back,false,'closing an idle manual B preview returns it to A');
assert.equal(releaseCoverSide(release,null,idle.record).back,true,'collapse does not mutate the previous state');
const collapsedPaused=collapseReleaseCoverSide({},release,b,false);
assert.equal(releaseCoverSide(release,b,collapsedPaused.record).back,false,'closing a paused B track returns its cover to A too');
assert.equal(releaseCoverSide(release,{...b,id:'b2',position:'B2'},collapsedPaused.record).back,true,'new playback still selects its own side after an idle collapse');
assert.strictEqual(collapseReleaseCoverSide(idle,release,b,true),idle,'closing the playing release preserves its side');
const manualFront=toggleReleaseCoverSide({},release,b);
assert.strictEqual(collapseReleaseCoverSide(manualFront,release,b,true),manualFront,'an active manual A override is preserved as well');
const elsewhere={id:'other-track',releaseId:'other-record',position:'B1'};
const collapsedElsewhere=collapseReleaseCoverSide(idle,release,elsewhere,true);
assert.equal(releaseCoverSide(release,elsewhere,collapsedElsewhere.record).back,false,'another release playing does not prevent resetting the viewed release');
assert.strictEqual(collapseReleaseCoverSide(original,release,null,false),original,'already-front artwork needs no state update');
assert.equal(releaseCoverSide({...release,tracks:[release.tracks[1]]},null,collapseReleaseCoverSide({}, {...release,tracks:[release.tracks[1]]},null,false,true).record,true).back,false,'compact B previews also reset on close');
for(const position of ['B','B1','B2',' b3 ']) {
  assert.equal(trackRowCoverSide({...release,tracks:[{id:'own',position}]}),true,`${position}: a compact row always uses its own back side`);
}
for(const position of ['A','A1','A2',null,undefined,'']) {
  assert.equal(trackRowCoverSide({...release,tracks:[{id:'own',position}]}),false);
}
assert.equal(trackRowCoverSide({...release,backCoverUrl:null,tracks:[b]}),false,'missing back art falls back to the front');
assert.equal(trackRowCoverSide({...release,tracks:[]}),false);
const rows=[{...release,tracks:[a]},{...release,tracks:[b]},{...release,tracks:[{...b,id:'b2',position:'B2'}]}];
assert.deepEqual(rows.map(trackRowCoverSide),[false,true,true],'A and B rows from the same release stay independent');
const double={...release,secondCoverUrl:'/c.jpg',secondBackCoverUrl:'/d.jpg',tracks:[...release.tracks,{id:'c',position:'C1'},{id:'d',position:'D2'}]};
const c={id:'c',releaseId:'record',position:'C1'};
const d={id:'d',releaseId:'record',position:'D2'};
assert.equal(releaseCoverSide(double,c).disc,2);
assert.equal(releaseCoverSide(double,c).back,false);
assert.equal(releaseCoverSide(double,d).disc,2);
assert.equal(releaseCoverSide(double,d).back,true);
assert.equal(images.getBackCoverUrl(double,2),'/d.jpg');
assert.equal(images.getSecondFrontCoverUrl(double),'/c.jpg');
assert.equal(trackRowCoverSide({...double,tracks:[c]}),false);
assert.equal(trackRowCoverSide({...double,tracks:[d]}),true);
assert.equal(releaseCoverSide(double,d,toggleReleaseCoverSide({},double,d).record).back,false,'D can flip to C without changing discs');
assert.equal(releaseCoverSide({...double,secondBackCoverUrl:null},d).back,false,'missing D never shows B of the first disc');
assert.equal(releaseCoverSide(double,null).disc,1,'idle full releases still start with the first vinyl');
assert.equal(images.getSecondFrontCoverUrl({...double,secondCoverUrl:null,images:[{isSecondFrontCover:true,url:'/gallery-c'}]}),'/gallery-c');
const source=fs.readFileSync(path.join(__dirname,'../src/components/paper-archive.tsx'),'utf8').replace(/\r\n/g,'\n');
assert(source.includes('isTrackCollection && isTrackListInteractive\n        ? trackRowCoverSide(r)'),'track rows ignore playback and shared manual overrides');
assert(source.includes('tracks: favoritesMode ? r.tracks : releaseDetails[r.id].tracks'),'loading release details preserves each favorite track identity');
assert(source.includes('previous.id !== release?.id'),'reset only when the selected release closes or changes, not on a pause or first reveal');
assert(source.includes('collapseReleaseCoverSide(overrides, previous, currentTrack, isPlaying, isTrackCollection)'),'every selection close uses the playback-aware reset');
assert(!source.includes('setIsCoverFlipped(false)'));
assert(!source.includes('flippedListCovers.has'));
assert(source.includes('const recordSide = releaseCoverSide(r, currentTrack, coverSideOverrides[r.id], isTrackCollection);'));
assert(/<ShelfCoverImage[\s\S]*?\brelease=\{r\} disc=\{disc\}/.test(source),'cover receives the release and active disc even when responsive props precede them');
assert(source.includes('aria-pressed={side.back}'));
assert.equal((source.match(/toggleReleaseCoverSide\(previous/g)||[]).length,2,'both flip controls use the same effective-side toggle');
console.log('PASS: idle and paused covers return to A on collapse; playing sides, manual toggles, new playback, compact covers and delayed metadata stay correct');
if(process.env.COVER_SIDE_BROWSER==='1') (async()=>{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
  try {
    const page=await browser.newPage();
    const css=['record-archive.css','shelf-theme.css'].map(file=>fs.readFileSync(path.join(__dirname,'../src/components',file),'utf8')).join('\n');
    for(const width of [390,1440])for(const theme of ['light','dark']) {
      await page.setViewportSize({width,height:1000});
      const markup=rows.map((row,index)=>`<div class="paper-record${trackRowCoverSide(row)?' is-flipped':''}" style="--list-y:${120+index*52}px"><button class="paper-record-open"><span class="paper-record-face paper-record-front">A</span><span class="paper-record-face paper-record-back">B</span></button></div>`).join('');
      await page.setContent(`<html data-visual-variant="shelf" data-shelf-theme="${theme}"><head><style>${css}</style></head><body><section class="paper-archive is-grid is-listing is-playlist" style="--grid-mix:1;--list-mix:1;--list-size:40px;--list-left:8vw"><div class="paper-row"><div class="paper-transport">${markup}</div></div></section></body></html>`);
      const faces=await page.locator('.paper-record').evaluateAll(cards=>cards.map(card=>{
        const facing=selector=>new DOMMatrixReadOnly(getComputedStyle(card.querySelector(selector)).transform).m11>0;
        return [facing('.paper-record-front'),facing('.paper-record-back')];
      }));
      assert.deepEqual(faces,[[true,false],[false,true],[false,true]],`${width}/${theme}: correct A/B face in compact rows`);
    }
    console.log('PASS browser: A1/B1/B2 compact artwork faces at mobile and desktop widths in both themes');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
