const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
for(const file of ['components/archive-page-header.css','components/record-archive.css','components/paper-sections.css','components/shelf-theme.css','app/profile/profile.css']){
  const css=fs.readFileSync(path.join(__dirname,'../src',file),'utf8');
  const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([,selector])=>selector.includes('.language-switch-button')&&selector.includes(':hover'));
  assert(rules.length>0,file);
  for(const [,selector,body] of rules){
    assert(!/border-bottom-color\s*:\s*currentColor|text-decoration\s*:\s*underline/.test(body),`${file}: mouse hover must not underline language text`);
  }
  assert(css.includes('.language-switch-button:focus-visible'),'keyboard focus indication remains in '+file);
}
console.log('PASS: RU/ENG mouse hover has no underline in main, secondary and admin headers in both themes; keyboard focus retained');
