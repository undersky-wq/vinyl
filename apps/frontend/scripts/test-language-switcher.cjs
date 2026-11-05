const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const React=require('react');
const source=fs.readFileSync(path.join(__dirname,'../src/components/language-switcher.tsx'),'utf8');
for(const initial of ['ru','en']){
 let state=initial,refreshes=0;const events=[];
 const exports={};const document={cookie:'',documentElement:{lang:initial}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
  exports,document,window:{dispatchEvent:e=>events.push(e)},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail}},
  require:name=>name==='react'?{...React,useState:()=>[state,next=>state=next],useEffect:()=>{},useTransition:()=>[false,fn=>fn()]}:name==='next/navigation'?{useRouter:()=>({refresh:()=>refreshes++})}:name==='next/link'?{default:()=>null}:require(name),
 });
 const render=single=>exports.LanguageSwitcher({lang:initial,single});
 let button=render(true).props.children[0];
 assert.equal(button.props.children,initial==='ru'?'ENG':'RU','single button names the destination language');
 button.props.onClick();
 assert.equal(state,initial==='ru'?'en':'ru');assert(document.cookie.includes('site-lang='+state));
 assert.equal(document.documentElement.lang,state);assert.equal(refreshes,1);assert.equal(events[0].detail,state);
 button=render(true).props.children[0];
 assert.equal(button.props.children,initial==='ru'?'RU':'ENG','label changes to the next available language after switching');
 const chips=render(false).props.children[0].props.children;
 assert.equal(chips[0].props['aria-pressed'],state==='ru');assert.equal(chips[1].props['aria-pressed'],state==='en');
}
console.log('PASS: RU/ENG single toggle shows target language, changes cookie/HTML/events, reverse toggle and dual-button selected state update immediately');
