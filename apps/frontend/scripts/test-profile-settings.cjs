const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
  try {
    for(const width of [390,1440]) {
      const page=await browser.newPage({viewport:{width,height:1000}}), errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.context().addCookies([{name:'vinyl_session',value:'local-admin-ui-test',url:'http://localhost:3100'},{name:'site-lang',value:'en',url:'http://localhost:3100'}]);
      await page.addInitScript(()=>{localStorage.setItem('mityadima-cookie-choice-v1','necessary');localStorage.setItem('mityadima-shelf-theme','light');});
      let profileCalls=0,passwordCalls=0;
      await page.route('**/api/**',async route=>{
        const req=route.request(),path=new URL(req.url()).pathname;
        if(path==='/api/users') return route.fulfill({json:[{id:'test',displayName:'Test User',email:'test@example.invalid',role:'USER',createdAt:'2026-01-01T00:00:00Z'}]});
        if(path==='/api/auth/profile' && req.method()==='PATCH') {
          profileCalls++;const input=req.postDataJSON();assert.equal(input.displayName,'Updated name');
          assert.equal('email' in input,false);
          return route.fulfill({json:{id:'local-ui-admin',role:'ADMIN',email:'admin@example.invalid',displayName:input.displayName,avatarStorageUrl:null}});
        }
        if(path==='/api/auth/password') {
          passwordCalls++;const input=req.postDataJSON();assert.equal(input.code,'123456');assert.equal(input.inviteCode,'fixture-invite');
          return route.fulfill({json:{success:true}});
        }
        return route.continue();
      });
      await page.goto('http://localhost:3100/profile',{waitUntil:'networkidle'});
      assert.equal(await page.locator('input[autocomplete=current-password]').count(),0);
      const form=page.locator('.profile-identity-form');
      await form.locator('input[autocomplete=nickname]').fill('Updated name');
      await form.locator('button[type=submit]').click();
      await page.waitForFunction(()=>document.querySelector('.profile-identity-form [role=status]')?.textContent.includes('Profile saved'));
      assert.equal(profileCalls,1);
      assert.equal(await form.locator('input[autocomplete=email]').getAttribute('readonly'),'');
      assert.equal(await form.locator('input[autocomplete=email]').inputValue(),'admin@example.invalid');
      for(const theme of ['light','dark']) {
        if(await page.locator('html').getAttribute('data-shelf-theme')!==theme) await page.locator('.shelf-theme-toggle').click();
        await page.waitForTimeout(450);
        for(const section of ['Profile','Security','Site design','Maintenance','Content','Users']) {
          await page.locator('.profile-admin-nav').getByRole('button',{name:section,exact:true}).click();
          await page.waitForTimeout(150);
          const bad=await page.locator('.profile-panel').evaluate(root=>{
            const dark=document.documentElement.dataset.shelfTheme==='dark';
            return [...root.querySelectorAll('h1,h2,h3,p,label,strong,input,button,a,span')].filter(el=>{
              if(!el.getClientRects().length || !((el.textContent||'').trim() || el.value) || el.closest('[hidden]')) return false;
              const style=getComputedStyle(el),rgb=style.color.match(/[\d.]+/g)?.slice(0,3).map(Number);
              if(!rgb)return false;const brightness=rgb.reduce((sum,n)=>sum+n,0)/3;
              let background=dark?18:255;
              for(let parent=el;parent;parent=parent.parentElement){
                const channels=getComputedStyle(parent).backgroundColor.match(/[\d.]+/g)?.map(Number);
                if(channels && (channels.length===3 || channels[3]>.5)){background=channels.slice(0,3).reduce((sum,n)=>sum+n,0)/3;break;}
              }
              return Math.abs(brightness-background)<45;
            }).map(el=>`${el.className}: ${el.textContent?.trim().slice(0,50)}`);
          });
          assert.deepEqual(bad,[],`${width}px ${theme} ${section}: invisible text`);
        }
      }
      await page.locator('.profile-admin-nav').getByRole('button',{name:'Profile',exact:true}).click();
      await page.waitForTimeout(800);
      await require('node:fs/promises').mkdir('.local/profile-check',{recursive:true});
      await page.screenshot({path:`.local/profile-check/profile-dark-${width}.png`,fullPage:true});
      await page.locator('.profile-password-link').click();
      await page.waitForURL('**/profile/password');
      const password=page.locator('.profile-password-page .profile-password-form');
      await password.waitFor();
      await page.waitForTimeout(800);
      await page.screenshot({path:`.local/profile-check/password-${width}.png`,fullPage:true});
      for(const theme of ['light','dark']) {
        if(await page.locator('html').getAttribute('data-shelf-theme')!==theme)await page.locator('.shelf-theme-toggle').click();
        await page.waitForTimeout(450);
        const colors=await password.evaluate(form=>({ink:getComputedStyle(form).color,input:getComputedStyle(form.querySelector('input')).color,background:getComputedStyle(document.querySelector('main')).backgroundColor}));
        assert.notEqual(colors.ink,colors.background);assert.notEqual(colors.input,colors.background);
      }
      await password.locator('input').nth(0).fill('old-fixture-password');await password.locator('input').nth(1).fill('new-fixture-password');await password.locator('input').nth(2).fill('new-fixture-password');
      await password.locator('input[autocomplete=one-time-code]').fill('123456');await password.locator('input[autocomplete=off]').fill('fixture-invite');
      await password.locator('button[type=submit]').click();
      await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent.includes('Password changed'));
      assert.equal(passwordCalls,1);
      await page.context().addCookies([{name:'password-test-no-factor',value:'1',url:'http://localhost:3100'}]);
      await page.reload({waitUntil:'networkidle'});
      assert(await page.locator('.profile-password-form button[type=submit]').isDisabled());
      assert(await page.locator('.profile-password-form a[href="/profile?section=security"]').isVisible());
      assert.deepEqual(errors,[]);
      console.log(`PASS ${width}px: all 6 admin tabs in light/dark, profile editing, separate protected password page, enrollment gate; mocked account mutations`);
      await page.close();
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
