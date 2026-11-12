const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
  try{
    for(const width of [390,1440]){
      const page=await browser.newPage({viewport:{width,height:1000}});
      await page.context().addCookies([{name:'vinyl_session',value:'local-admin-ui-test',url:'http://localhost:3100'}]);
      await page.addInitScript(()=>{localStorage.setItem('vinyl-admin-web-edit-mode','on');localStorage.setItem('mityadima-cookie-choice-v1','necessary');});
      const seed=(await(await page.request.get('http://127.0.0.1:3201/api/releases')).json()).find(row=>!row.isMix&&row.tracks.length);
      const png=Buffer.from((await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=200;const x=c.getContext('2d');for(const [color,left,top]of[['red',0,0],['green',100,0],['yellow',0,100],['blue',100,100]]){x.fillStyle=color;x.fillRect(left,top,100,100);}return c.toDataURL();})).split(',')[1],'base64');
      const release={...seed,genres:[],images:[{id:'front-image',type:'COVER',storageKey:'covers/front.png',url:'/test-cover.png',thumbUrl:'/test-cover.png'},{id:'back-image',type:'GALLERY',isBackCover:true,storageKey:'covers/back.png',url:'/test-cover.png',thumbUrl:'/test-cover.png'}],tracks:seed.tracks.slice(0,1)};
      const requests=[];let copies=0;
      await page.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url()),method=req.method();
        if(url.pathname==='/test-cover.png')return route.fulfill({body:png,contentType:'image/png'});
        if(url.pathname==='/api/users')return route.fulfill({json:Array.from({length:23},(_,i)=>({id:`user-${i}`,displayName:`User ${i}`,email:`user${i}@example.invalid`,role:'USER',createdAt:'2026-01-01T00:00:00Z'}))});
        if(url.pathname==='/api/auth/password'){requests.push('password');return route.fulfill({json:{success:true}});}
        if(url.pathname===`/api/releases/tracks/${release.tracks[0].id}/metadata`){requests.push('track');Object.assign(release.tracks[0],req.postDataJSON());await new Promise(resolve=>setTimeout(resolve,120));return route.fulfill({json:release.tracks[0]});}
        const base=`/api/releases/${release.id}`;
        if(!url.pathname.startsWith(base))return route.continue();
        if(url.pathname.endsWith('/file'))return route.fulfill({body:png,contentType:'image/png'});
        if(url.pathname.endsWith('/copy')){copies++;release.images.push({id:`copy-${copies}`,type:'GALLERY',storageKey:`covers/copy-${copies}.png`,url:'/test-cover.png'});return route.fulfill({json:release});}
        if(url.pathname===`${base}/images`&&method==='POST'){requests.push('upload');release.images.push({id:'uploaded-image',type:'GALLERY',storageKey:'covers/upload.png',url:'/test-cover.png'});return route.fulfill({json:release});}
        if(url.pathname.includes('/images/')&&method==='PATCH'){requests.push('edit');return route.fulfill({json:release});}
        if(url.pathname.includes('/images/')&&method==='DELETE'){release.images=release.images.filter(image=>image.id!==url.pathname.split('/').pop());return route.fulfill({json:release});}
        if(url.pathname.endsWith('/metadata')){requests.push('metadata');Object.assign(release,req.postDataJSON());return route.fulfill({json:release});}
        if(url.pathname.endsWith('/styles'))return route.fulfill({json:release});
        if(url.pathname===base)return route.fulfill({json:release});
        return route.continue();
      });
      await page.goto('http://localhost:3100/?layout=tracks',{waitUntil:'domcontentloaded'});
      await page.locator('.shelf-release-edit-trigger').first().click();
      const editor=page.locator('dialog.shelf-editor'),gallery=editor.locator('.shelf-form-gallery');
      await gallery.waitFor({state:'visible'});
      assert.equal(await gallery.locator('figure').getByRole('button',{name:/Загрузить|Upload/}).count(),0,'No duplicate per-photo upload buttons');
      await gallery.getByRole('button',{name:/^Редактировать$|^Edit$/}).first().click();
      const crop=editor.locator('.square-cover-editor');await crop.waitFor({state:'visible'});
      await crop.getByRole('button',{name:/90.*вправо|90.*right/}).click();
      await page.waitForFunction(()=>{const p=document.querySelector('.square-cover-editor canvas')?.getContext('2d').getImageData(80,80,1,1).data;return p&&p[0]===255&&p[1]===255&&p[2]===0;});
      await crop.getByRole('button',{name:/Применить квадрат|Apply square/}).click();await crop.waitFor({state:'hidden'});
      assert(requests.includes('edit'));
      await gallery.getByRole('button',{name:/Создать копию|Make a copy/}).first().click();
      await page.waitForFunction(()=>document.querySelectorAll('.shelf-form-covers>figure').length===3);
      const chooser=page.waitForEvent('filechooser');await gallery.getByRole('button',{name:/Загрузить ещё обложку|Upload another cover/}).click();
      await(await chooser).setFiles({name:'new.png',mimeType:'image/png',buffer:png});
      await crop.waitFor({state:'visible'});await crop.getByRole('button',{name:/Применить квадрат|Apply square/}).click();await crop.waitFor({state:'hidden'});
      await page.waitForFunction(()=>document.querySelectorAll('.shelf-form-covers>figure').length===4);
      assert(await gallery.getByRole('button',{name:/Загрузить ещё обложку|Upload another cover/}).isVisible());
      page.once('dialog',dialog=>dialog.accept());await gallery.locator('figure').last().getByRole('button',{name:/^Удалить$|^Delete$/}).click();
      await page.waitForFunction(()=>document.querySelectorAll('.shelf-form-covers>figure').length===3);
      const save=editor.locator('.shelf-form-footer button');
      assert(await save.evaluate(node=>node.closest('.shelf-release-form').lastElementChild.contains(node)),'Save is at the very bottom');
      await editor.locator('.shelf-form-metadata input').first().fill('Changed artist');
      await editor.locator('.shelf-form-track-title').first().fill('Changed track');
      await save.click();await page.waitForFunction(()=>document.querySelector('.shelf-form-status')?.textContent.match(/Сохранено|Saved/));
      assert(requests.includes('track')&&requests.includes('metadata'));
      assert(requests.indexOf('track')<requests.indexOf('metadata'),'Bottom Save waits for track blur autosave');
      await page.goto('http://localhost:3100/profile',{waitUntil:'domcontentloaded'});
      assert.equal(await page.locator('.profile-stats').count(),0,'Profile has no collection statistics');
      await page.locator('.profile-admin-nav').getByRole('button',{name:/Пользователи|Users/}).click();
      await page.waitForFunction(()=>document.querySelectorAll('.profile-user-row').length===23);
      await page.locator('.profile-admin-nav').getByRole('button',{name:/^Профиль$|^Profile$/}).click();
      assert.equal(await page.locator('input[autocomplete=current-password]').count(),0,'No password fields on profile');
      await page.locator('.profile-password-link').click();
      await page.waitForURL('**/profile/password');
      const password=page.locator('.profile-password-page .profile-password-form');
      await password.locator('input').nth(0).fill('old-fixture-password');await password.locator('input').nth(1).fill('new-fixture-password');await password.locator('input').nth(2).fill('new-fixture-password');
      await password.locator('input[autocomplete=one-time-code]').fill('123456');await password.locator('input[autocomplete=off]').fill('fixture-invite');
      await password.locator('button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('.profile-password-form [role=status]')?.textContent.match(/Пароль изменён|Password changed/));
      assert(requests.includes('password'));
      console.log(`PASS ${width}px: gallery add/edit/rotate/copy/delete, persistent upload, bottom Save with queued edits; Users opens all rows, Profile has password form and no stats (isolated API mocks)`);
      await page.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
