const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
 try{
  for(const width of [390,820,1440]){
   const context=await browser.newContext({viewport:{width,height:900}});
   await context.addCookies([{name:'vinyl_session',value:'local-admin-ui-test',url:'http://localhost:3100'}]);
   const page=await context.newPage();const failures=[];page.on('pageerror',e=>failures.push(e.message));let writes=0;
   const catalog=await (await fetch('http://127.0.0.1:3201/api/releases')).json();
   const releases=Array.isArray(catalog)?catalog:catalog.releases;
   assert(releases?.length,'snapshot catalog');
   const keys=['Am','C','Ebm','D#m',null],bpms=[120,100,130,110,null];
   const items=keys.map((key,i)=>({id:`item-${i}`,sortOrder:i,track:{...releases[i].tracks[0],id:`track-${i}`,title:`Fixture ${i}`,key,bpm:bpms[i],release:releases[i],audioFiles:[]}}));
   const playlist={id:'key-test',name:'Key test',sortOrder:0,items};
   await page.route('**/api/playlists**',async route=>{if(route.request().method()!=='GET'){writes++;return route.fulfill({json:{}});}const path=new URL(route.request().url()).pathname;await route.fulfill({json:path.endsWith('/count')?{count:1}:path.endsWith('/key-test')?playlist:[playlist]});});
   await page.goto('http://localhost:3100/?view=playlists&playlist=key-test&layout=tracks');
   const trigger=page.locator('.harmonic-filter>button');await trigger.waitFor({timeout:120000});
   const rows=page.locator('.paper-list-tracks.is-compact-track');await page.waitForFunction(()=>document.querySelectorAll('.paper-list-tracks.is-compact-track').length===5);
   const order=()=>rows.locator('.paper-track-primary-line em').allTextContents();
   const initial=await order();assert.equal(initial.length,5);
   const gaps=await page.evaluate(w=>{const controls=document.querySelector(w<=700?'.paper-heading':'.paper-layout-controls').getBoundingClientRect(),filters=document.querySelector('.paper-playlist-sort-position').getBoundingClientRect(),track=document.querySelector('.paper-list-tracks.is-compact-track .paper-track-line').getBoundingClientRect();return {above:filters.top-controls.bottom,below:track.top-filters.bottom};},width);
   assert(Math.abs(gaps.above-10)<1,`${width}px controls-to-filter gap: ${JSON.stringify(gaps)}`);assert(Math.abs(gaps.below-10)<1,`${width}px filter-to-track gap: ${JSON.stringify(gaps)}`);
   const bpm=page.locator('.paper-playlist-sort>button').first();
   assert.equal(await bpm.locator('svg').count(),2);assert.equal(await bpm.locator('svg.is-active').count(),0);
   const columns=await page.evaluate(()=>{const center=el=>{const r=el.getBoundingClientRect();return r.x+r.width/2;};return ['bpm','key'].map((field,i)=>({field,header:center(document.querySelectorAll('.paper-playlist-sort-arrow')[i]),row:center(document.querySelector(`.paper-track-${field}`))})).concat({field:'duration',header:center(document.querySelector('.harmonic-filter-icon')),row:center(document.querySelector('.paper-track-line>time'))});});
   for(const col of columns)assert(Math.abs(col.header-col.row)<1,`${width}px ${col.field} aligned: ${JSON.stringify(col)}`);
   const textCenters=await page.evaluate(()=>['bpm','key'].map((field,i)=>{const el=document.querySelector(`.paper-track-${field}`),range=document.createRange();range.selectNodeContents(el);const text=range.getBoundingClientRect(),arrow=document.querySelectorAll('.paper-playlist-sort-arrow')[i].getBoundingClientRect();return {field,text:text.x+text.width/2,arrow:arrow.x+arrow.width/2};}));
   for(const col of textCenters)assert(Math.abs(col.text-col.arrow)<1,`${width}px ${col.field} text centered under arrows: ${JSON.stringify(col)}`);
   const timeCenter=await page.evaluate(()=>{const el=document.querySelector('.paper-track-line>time'),range=document.createRange();range.selectNodeContents(el);const text=range.getBoundingClientRect(),icon=document.querySelector('.harmonic-filter-icon').getBoundingClientRect();return {text:text.x+text.width/2,icon:icon.x+icon.width/2};});
   assert(Math.abs(timeCenter.text-timeCenter.icon)<1,`${width}px time text centered under wheel: ${JSON.stringify(timeCenter)}`);
   assert.equal(await page.getByRole('button',{name:/^(Исходный|Original)$/}).count(),0);
   await bpm.click();await page.waitForTimeout(100);assert.deepEqual(await order(),[initial[2],initial[0],initial[3],initial[1],initial[4]]);
   assert.equal(await bpm.locator('svg.is-active').count(),1);assert.match(await bpm.locator('svg.is-active').getAttribute('class'),/arrow-down/);
   await bpm.click();await page.waitForTimeout(100);assert.deepEqual(await order(),[initial[1],initial[3],initial[0],initial[2],initial[4]]);
   assert.equal(await bpm.locator('svg.is-active').count(),1);assert.match(await bpm.locator('svg.is-active').getAttribute('class'),/arrow-up/);
   await bpm.click();await page.waitForTimeout(100);assert.deepEqual(await order(),initial);
   assert.equal(await bpm.locator('svg.is-active').count(),0);
   await trigger.click();const panel=page.locator('.harmonic-filter-panel');await page.waitForTimeout(350);
   assert.equal(await panel.getAttribute('aria-hidden'),'false');
   const bounds=await panel.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width,`panel within ${width}px: ${JSON.stringify(bounds)}`);
   const heading=await panel.locator('.harmonic-filter-heading strong').boundingBox();
   await page.mouse.move(heading.x+10,heading.y+8);await page.mouse.down();await page.mouse.move(heading.x+10+(width>700?-80:10),heading.y+68,{steps:8});await page.mouse.up();
   const moved=await panel.boundingBox();assert(Math.abs(moved.y-bounds.y-60)<2,'wheel draggable by header');assert(moved.x>=0&&moved.x+moved.width<=width,'drag stays within screen');
   const alias=panel.getByRole('checkbox',{name:'D#m: 2',exact:true});await alias.click();await page.waitForFunction(()=>document.querySelectorAll('.paper-list-tracks.is-compact-track').length===2);
   assert.equal(await alias.getAttribute('aria-checked'),'true');
   assert.equal(await trigger.locator('sup').textContent(),'1');
   const counter=await trigger.locator('sup').boundingBox(),icon=await trigger.locator('svg').boundingBox();
   assert(counter.x>=icon.x+icon.width&&counter.y<icon.y,'wheel count above and right of icon');
   await panel.getByRole('checkbox',{name:'Am: 1',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.paper-list-tracks.is-compact-track').length===3);
   await panel.locator('.harmonic-filter-clear').click();await page.waitForFunction(()=>document.querySelectorAll('.paper-list-tracks.is-compact-track').length===5);
   assert.deepEqual(await order(),initial);
   await alias.focus();await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelectorAll('.paper-list-tracks.is-compact-track').length===2);
   await panel.locator('.harmonic-filter-clear').click();await page.waitForFunction(()=>document.querySelectorAll('.paper-list-tracks.is-compact-track').length===5);
   await page.keyboard.press('Escape');assert.equal(await trigger.getAttribute('aria-expanded'),'false');
   for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.shelfTheme=t,theme);await trigger.click();await page.waitForTimeout(350);await page.screenshot({path:`.local/harmonic-filter-${width}-${theme}.png`});await page.mouse.click(5,5);assert.equal(await trigger.getAttribute('aria-expanded'),'false');}
   await page.evaluate(()=>{document.querySelector('.paper-row').scrollTop=120;});
   await page.waitForTimeout(200);
   const boundary=await page.evaluate(()=>{const toolbar=document.querySelector('.paper-playlist-sort-position'),row=document.querySelector('.paper-row'),rect=toolbar.getBoundingClientRect();return {clip:getComputedStyle(row).clipPath,top:rect.top,bottom:rect.bottom,rowTop:row.getBoundingClientRect().top,overlapping:document.elementsFromPoint(rect.right-125,rect.bottom-2).some(el=>el===row||el.closest('.paper-row'))};});
   assert.match(boundary.clip,/inset\(/);assert.equal(boundary.overlapping,false,`${width}px rows clipped below controls`);
   assert.equal(writes,0,'filter never persists/reorders playlist');assert.deepEqual(failures,[]);
   console.log(`PASS ${width}px: open, multiselect, enharmonic aliases, clear, Escape, outside click, light/dark, no writes`);await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
