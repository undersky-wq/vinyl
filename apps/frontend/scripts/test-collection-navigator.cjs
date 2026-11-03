const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const result={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/collection-navigator.ts'),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS},
}).outputText,{exports:result});
const {navigatorIndex,releaseScrollTop,clampNavigator,gridNavigatorPositions,collectionGridGeometry,stackNavigatorState,stackNavigatorTravel}=result;
const stackPositions=[0,20,50,65,110];
for(const width of [320,390,700]) {
  for(const [progress,index] of [[0,0],[20/110,1],[.5,2],[1,4]]) {
    const value=stackNavigatorState(stackPositions,width,stackNavigatorTravel(stackPositions,width,progress));
    assert.equal(value.index,index,'stack uses actual irregular sleeve spacing');
    assert(Math.abs(value.progress-progress)<.00001);
  }
  assert.equal(stackNavigatorState([],width,-width/2).maximum,0);
  assert.equal(stackNavigatorState([0],width,0).progress,0);
  assert.equal(stackNavigatorTravel(stackPositions,width,-2),-width/2);
  assert.equal(stackNavigatorTravel(stackPositions,width,2),110-width/2);
}
for(const width of [320,360,390,430,700,701,1440]) {
  const mobile=width<=700, columns=mobile?4:5, gap=mobile?6:20;
  const sleeve=mobile?180:Math.max(180,Math.min(280,width*.18));
  const original=collectionGridGeometry(width,columns,gap,sleeve,false);
  const reserved=collectionGridGeometry(width,columns,gap,sleeve,true);
  if(mobile) {
    assert.equal(original.size-reserved.size,6,'reserve only the 24px seek target across four covers');
    assert(Math.abs(reserved.left-width*.03)<.001,'keep the original left margin');
    const edge=reserved.left+columns*reserved.size+(columns-1)*gap;
    assert(edge<width-24,'covers clear the full seek touch target');
    assert(Math.abs((width-24-edge)-width*.03)<.001,'do not leave an unused playing-marker lane');
  } else assert.deepEqual(reserved,original,'desktop geometry is unchanged');
}
const positions=[112,412,912,1212];
assert.equal(navigatorIndex(positions,0,100,1400),0);
assert.equal(navigatorIndex(positions,350,100,1400),1);
assert.equal(navigatorIndex(positions,850,100,1400),2);
assert.equal(navigatorIndex(positions,1400,100,1400),3);
assert.equal(navigatorIndex([],50,100,1400),0);
assert.equal(releaseScrollTop(positions,2,100,1400),812);
assert.equal(releaseScrollTop(positions,3,100,1000),1000);
assert.equal(clampNavigator(-.3),0);
assert.equal(clampNavigator(1.3),1);
for(const columns of [4,5]) {
  const grid=gridNavigatorPositions(401,columns,100,120);
  assert.equal(grid.length,401);
  assert.equal(grid[0],112);
  assert.equal(grid[columns-1],112);
  assert.equal(grid[columns],232);
  assert.equal(navigatorIndex(grid,0,100,13000),0);
  assert.equal(navigatorIndex(grid,132,100,13000),columns,'a grid row starts at its first release');
  assert.equal(navigatorIndex(grid,13000,100,13000),400,'bottom includes the final partial row');
  assert.equal(releaseScrollTop(grid,columns+2,100,13000),132,'playing marker targets the correct row regardless of its column');
  assert.equal(navigatorIndex(grid,200,100,13000),2*columns,'nearest-row lookup remains stable');
}
assert.equal(gridNavigatorPositions(0,5,100,120).length,0);
const archive=fs.readFileSync(path.join(__dirname,'../src/components/paper-archive.tsx'),'utf8');
assert(archive.includes('stackMode ? viewport.width <= 700 && selected === null : gridMix >= 1'));
assert(archive.includes('positions={stackMode ? stackNavigatorPositions : navigatorPositions}'));
assert(archive.includes('Math.max(0, gridLeft - 52)'),'desktop navigator stays outside the grid');
const source=fs.readFileSync(path.join(__dirname,'../src/components/collection-navigator.tsx'),'utf8');
assert(source.includes('setPointerCapture'));
assert(source.includes("behavior: 'instant'"));
assert(source.includes('onPointerCancel'));
assert(source.includes('aria-valuenow'));
assert(!/playQueue|togglePlayback|seekToPercent/.test(source));
assert(source.includes('src={releases[playingIndex].cover}'));
assert(source.includes('collection-navigator__playing-action'));
assert(!source.includes('className="collection-navigator__preview"'));
const css=fs.readFileSync(path.join(__dirname,'../src/components/collection-navigator.css'),'utf8');
assert(!css.includes('.collection-navigator__rail::before'));
assert(css.includes('right:calc(max(17vw,160px) - 68px)'));
assert(css.includes('left:-18px!important'));
const React=require('react');
const component={};
const scrolls=[];
const scroller={scrollHeight:5000,clientHeight:1000,scrollTo:options=>scrolls.push(options)};
let stateIndex=0,initialPosition={progress:0,index:0,maximum:4000};
vm.runInNewContext(ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022},
}).outputText,{
  exports:component,setTimeout:()=>0,clearTimeout:()=>{},
  require:name=>name==='react'?{
    ...React,useRef:value=>({current:value}),useEffect:()=>{},
    useState:value=>[stateIndex++===0?initialPosition:value,()=>{}],
  }:name==='../lib/collection-navigator'?result:name==='./cover-image'?{CoverImage:()=>null}:name.endsWith('.css')?{}:require(name),
});
const grid=gridNavigatorPositions(11,5,100,120);
const tree=component.CollectionNavigator({
  releases:grid.map((_,index)=>({id:String(index),artist:'Artist',title:`Release ${index}`,cover:'/cover.jpg'})),
  positions:grid,getScroller:()=>scroller,top:100,bottom:80,right:92,playingReleaseId:'7',playing:true,ru:true,onRevealOutside:()=>{},
});
assert.equal(tree.props.style.right,92);
const rail=tree.props.children;
rail.props.ref.current={getBoundingClientRect:()=>({top:100,height:800})};
const [seek,playing]=React.Children.toArray(rail.props.children);
const target={setPointerCapture:()=>{},focus:()=>{}};
seek.props.onPointerDown({button:0,pointerId:1,clientY:500,currentTarget:target,preventDefault:()=>{},stopPropagation:()=>{}});
assert.equal(scrolls.pop().top,2000,'dragging the grid navigator seeks halfway through the real scroll range');
seek.props.onPointerMove({pointerId:1,clientY:900,stopPropagation:()=>{}});
assert.equal(scrolls.pop().top,4000,'pointer capture continues to the bottom');
seek.props.onPointerUp({pointerId:1});
seek.props.onKeyDown({key:'Home',preventDefault:()=>{}});
assert.equal(scrolls.pop().top,0);
seek.props.onKeyDown({key:'End',preventDefault:()=>{}});
assert.equal(scrolls.pop().top,4000);
playing.props.onClick();
const playingJump=scrolls.pop();
assert.equal(playingJump.top,132,'one click on the playing marker scrolls to the release without confirmation');
assert.equal(playingJump.behavior,'smooth');
stateIndex=0;
initialPosition=stackNavigatorState(stackPositions,390,-195);
let stackTravel=-195;
const seeks=[];
const stackTree=component.CollectionNavigator({
  releases:stackPositions.map((_,index)=>({id:String(index),artist:'Artist',title:`Release ${index}`,cover:'/cover.jpg'})),
  positions:stackPositions,getScroller:()=>null,top:200,bottom:80,playingReleaseId:'2',playing:true,ru:true,onRevealOutside:()=>{},
  transport:{read:()=>stackNavigatorState(stackPositions,390,stackTravel),seek:(progress,smooth)=>{seeks.push({progress,smooth});stackTravel=stackNavigatorTravel(stackPositions,390,progress);}},
});
const stackRail=stackTree.props.children;
stackRail.props.ref.current={getBoundingClientRect:()=>({top:200,height:400})};
const [stackSeek,stackPlaying]=React.Children.toArray(stackRail.props.children);
stackSeek.props.onPointerDown({button:0,pointerId:1,clientY:400,currentTarget:target,preventDefault:()=>{},stopPropagation:()=>{}});
assert.equal(seeks.pop().progress,.5);
stackSeek.props.onPointerMove({pointerId:1,clientY:600,stopPropagation:()=>{}});
assert.equal(stackNavigatorState(stackPositions,390,stackTravel).index,4);
stackSeek.props.onPointerUp({pointerId:1});
stackSeek.props.onKeyDown({key:'Home',preventDefault:()=>{}});
assert.equal(stackNavigatorState(stackPositions,390,stackTravel).index,0);
stackPlaying.props.onClick();
const stackJump=seeks.pop();
assert.equal(stackJump.progress,50/110);
assert.equal(stackJump.smooth,true,'stack marker smoothly targets the correct sleeve without changing playback');
console.log('PASS: list and 401-release grid geometry, partial rows, playing markers, edges, keyboard/pointer controls and playback-independent scrolling');

if(process.env.NAVIGATOR_LAYOUT_BROWSER==='1') (async()=>{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
  try {
    const styles=['record-archive.css','shelf-web.css','shelf-theme.css','collection-navigator.css']
      .map(file=>fs.readFileSync(path.join(__dirname,'../src/components',file),'utf8')).join('\n');
    for(const width of [320,360,390,430,700,1440])for(const theme of ['light','dark'])for(const mode of ['grid','tracks']) {
      const page=await browser.newPage({viewport:{width,height:844},reducedMotion:'reduce',hasTouch:width<=700});
      const mobile=width<=700,columns=mobile?4:5,gap=mobile?6:20;
      const geometry=collectionGridGeometry(width,columns,gap,180,true);
      const covers=Array.from({length:columns},(_,i)=>`<div class="paper-record" style="--position:0;--split:0;--grid-x:${geometry.left+i*(geometry.size+gap)}px;--grid-y:280px;--list-y:280px"><span class="paper-record-face"></span></div>`).join('');
      await page.setContent(`<html data-visual-variant="shelf" data-shelf-theme="${theme}"><style>${styles}</style><body><div class="page-shell--home"><section class="home-stage--shelf paper-archive is-grid${mode==='tracks'?' is-listing':''}" style="--travel:0px;--spread:0px;--grid-mix:1;--list-mix:${mode==='tracks'?1:0};--grid-size:${geometry.size}px;--list-size:72px;--grid-top:200px;--grid-bottom:80px"><div class="paper-row">${covers}${mode==='tracks'?'<article class="paper-list-tracks" style="top:280px"><h2>Release</h2><div class="paper-track-line">Track</div></article>':''}</div><nav class="collection-navigator is-visible" style="top:220px;bottom:80px"><div class="collection-navigator__rail"><div class="collection-navigator__seek"><span class="collection-navigator__thumb" style="top:20%"></span></div><button class="collection-navigator__playing" style="top:20%">▶</button></div></nav></section></div></body></html>`);
      await page.locator('.collection-navigator__playing').evaluate(node=>{
        const label=document.createElement('span');
        label.className='collection-navigator__playing-label';
        label.textContent='Go to release';
        node.append(label);
      });
      const idleColor=await page.locator('.collection-navigator__thumb').evaluate(node=>getComputedStyle(node).backgroundColor);
      if(mobile) {
        assert.equal(idleColor,'rgb(52, 120, 219)',`${width}px ${theme} ${mode}: mobile thumb is blue without touching it`);
        const bounds=await page.evaluate(()=>{
          const rect=selector=>document.querySelector(selector).getBoundingClientRect();
          const seek=rect('.collection-navigator__seek');
          return {seek:seek.left,cover:Math.max(...[...document.querySelectorAll('.paper-record')].map(node=>node.getBoundingClientRect().right)),content:document.querySelector('.paper-list-tracks')?.getBoundingClientRect().right};
        });
        assert(bounds.cover+4<bounds.seek,`${width}px ${theme} ${mode}: covers clear the seek target`);
        if(mode==='grid')assert(Math.abs(bounds.seek-bounds.cover-width*.03)<.1,'grid uses the old arrow space, leaving only the regular page margin');
        if(mode==='tracks')assert(bounds.content+4<bounds.seek,`${width}px: track actions also clear the seek target`);
        if(mode==='tracks')assert(Math.abs(bounds.seek-bounds.content-width*.03)<.1,'track content uses the old arrow space too');
        await page.locator('.collection-navigator__seek').hover();
        assert.equal(await page.locator('.collection-navigator__thumb').evaluate(node=>getComputedStyle(node).width),'7px');
        assert.equal(await page.locator('.collection-navigator__thumb').evaluate(node=>getComputedStyle(node).backgroundColor),idleColor,'hover keeps the same blue');
        assert.equal(await page.locator('.collection-navigator__playing').isVisible(),false,'mobile playing arrow is hidden');
        assert.equal(await page.locator('.collection-navigator__playing-label').isVisible(),false,'mobile tooltip stays hidden');
      } else assert.notEqual(idleColor,'rgb(52, 120, 219)','desktop idle color stays theme-dependent');
      if(!mobile) {
        await page.locator('.collection-navigator__playing').hover();
        assert.equal(await page.locator('.collection-navigator__playing-label').isVisible(),true,'desktop hover keeps its release tooltip');
      }
      await page.close();
    }
    console.log('PASS: real CSS mobile grid/list covers and track actions clear navigator, playing arrow hidden in both themes; desktop unchanged');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
