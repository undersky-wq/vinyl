const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const css=fs.readFileSync(path.resolve(__dirname,'../src/components/harmonic-key-filter.css'),'utf8');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
  try{
    for(const width of [390,1440])for(const theme of ['light','dark']){
      const page=await browser.newPage({viewport:{width,height:800}});
      await page.setContent(`<html data-shelf-theme="${theme}"><style>:root{--shelf-web-ink:${theme==='dark'?'#eee':'#111'}}*:focus{outline:2px solid red}${css}</style><body><svg class="harmonic-filter-wheel" viewBox="0 0 320 320" style="width:320px"><g style="--key-light:#693569;--key-dark:#d67adf"><path role="checkbox" aria-label="C" aria-checked="false" tabindex="0" d="M 120 10 L 200 10 L 185 65 L 135 65 Z"/></g></svg></body></html>`);
      const sector=page.getByRole('checkbox',{name:'C'});
      await sector.click();assert.equal(await sector.evaluate(el=>getComputedStyle(el).outlineStyle),'none','mouse selection must not show a rectangular outline');
      await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
      const keyboard=await sector.evaluate(el=>({outline:getComputedStyle(el).outlineStyle,stroke:getComputedStyle(el).strokeWidth,focused:document.activeElement===el}));
      assert(keyboard.focused);assert.equal(keyboard.outline,'none');assert.equal(keyboard.stroke,'3px','keyboard focus remains visible along the sector shape');
      console.log(`PASS ${width}/${theme}: no rectangular focus outline; keyboard sector highlight retained`);
      await page.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
