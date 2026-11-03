const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const css=[['../src/app/globals.css'],...['record-archive.css','shelf-web.css','shelf-theme.css'].map(f=>['../src/components/'+f])].map(([f])=>fs.readFileSync(path.join(__dirname,f),'utf8')).join('\n');
  for(const theme of ['light','dark']){
   const row=(id)=>`<div class="paper-track-line"><div class="paper-track-actions"><div class="track-playlist-menu"><button id="${id}" class="track-playlist-menu__trigger" data-tooltip="Add to playlist">+</button></div></div></div>`;
   await page.setContent(`<html data-visual-variant="shelf" data-shelf-theme="${theme}"><style>${css}</style><body><section class="paper-archive is-grid is-listing"><article class="paper-list-tracks" style="top:200px">${row('first')}${row('second')}</article></section><div class="player-page__controls" style="position:fixed;left:700px;top:300px"><button id="play" class="player-page__play" data-tooltip="Play">Play</button></div><div class="player-page__secondary-actions" style="position:fixed;left:700px;top:380px"><div class="track-playlist-menu"><button>+</button></div></div></body></html>`);
   await page.locator('#first').hover();
   const archive=await page.locator('#first').evaluate(e=>({row:getComputedStyle(e.closest('.paper-track-line')).zIndex,article:getComputedStyle(e.closest('article')).zIndex,menu:getComputedStyle(document.querySelector('#second').parentElement).zIndex,overflow:getComputedStyle(e.closest('.paper-track-line')).overflow}));
   assert(Number(archive.row)>Number(archive.menu),'hovered row paints over the following playlist menu');
   assert.equal(archive.article,'10001');assert.equal(archive.overflow,'visible');
   await page.locator('#play').hover();
   const player=await page.locator('#play').evaluate(e=>({controls:getComputedStyle(e.parentElement).zIndex,menu:getComputedStyle(document.querySelector('.player-page__secondary-actions .track-playlist-menu')).zIndex,background:getComputedStyle(e,'::after').backgroundColor}));
   assert(Number(player.controls)>Number(player.menu),'Play tooltip paints above secondary playlist icon');
   assert(!player.background.endsWith(', 0)'),'tooltip has an opaque background');
  }
  console.log('PASS: Tracks playlist hints and full-player Play hints paint above following icons in light/dark themes');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
