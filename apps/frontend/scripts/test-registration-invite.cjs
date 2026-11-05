const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const source = fs.readFileSync(path.join(__dirname,'../src/components/auth-screen.tsx'),'utf8');
const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const tick = () => new Promise(resolve=>setImmediate(resolve));

function fixture(initialInviteRequired, mode='register') {
  const states=[];let cursor=0,effect,cleanup,calls=0,settings={registrationInviteRequired:initialInviteRequired};
  const events=new Map();const registered=[];const document={hidden:false};
  const listeners={addEventListener:(type,handler)=>events.set(type,handler),removeEventListener:(type,handler)=>{if(events.get(type)===handler)events.delete(type);}};
  const exports={};
  vm.runInNewContext(compiled,{
    exports,document:Object.assign(document,listeners),window:listeners,
    FormData:class{constructor(form){this.values=form.values;}get(name){return this.values[name]??null;}},
    require:name=>name==='react'?{...React,useState:initial=>{const index=cursor++;if(!(index in states))states[index]=initial;return[states[index],next=>states[index]=typeof next==='function'?next(states[index]):next];},useEffect:fn=>effect=fn}
      :name==='next/navigation'?{useRouter:()=>({push(){},refresh(){}})}
      :name==='../providers/auth-provider'?{useAuth:()=>({setUser(){}})}
      :name==='../lib/api'?{getSiteSettings:async()=>{calls++;if(settings instanceof Error)throw settings;return settings;},registerUser:async payload=>{registered.push(payload);return{id:'test'};},loginUser:async()=>({id:'test'})}
      :require(name),
  });
  return {
    render(){cursor=0;return exports.AuthScreen({lang:'ru',mode,initialInviteRequired});},
    async effect(){cleanup?.();cleanup=effect();await tick();},
    async focus(){await events.get('focus')?.();await tick();},
    setSettings(value){settings=value;},
    cleanup(){cleanup?.();},
    get calls(){return calls;},registered,document,
  };
}
function all(node,predicate){if(!React.isValidElement(node))return[];return[...(predicate(node)?[node]:[]),...React.Children.toArray(node.props.children).flatMap(child=>all(child,predicate))];}
const invite=tree=>all(tree,node=>node.type==='input'&&node.props.name==='inviteCode');
const submit=tree=>all(tree,node=>node.type==='button'&&node.props.type==='submit')[0];

(async()=>{
  for(const enabled of [false,true]){
    const test=fixture(enabled);let tree=test.render();
    assert.equal(invite(tree).length,enabled?1:0,'server-rendered flag prevents a spurious invite field');
    if(enabled)assert.equal(invite(tree)[0].props.required,true);
    await test.effect();tree=test.render();assert.equal(submit(tree).props.disabled,false);
    test.setSettings({registrationInviteRequired:!enabled});await test.focus();tree=test.render();
    assert.equal(invite(tree).length,enabled?0:1,'returning to the tab refreshes the admin setting');
    test.cleanup();
  }
  const unknown=fixture(null);let tree=unknown.render();assert.equal(submit(tree).props.disabled,true);
  unknown.setSettings({registrationInviteRequired:true});await unknown.effect();tree=unknown.render();assert.equal(invite(tree).length,1);unknown.cleanup();

  const free=fixture(false);free.render();await free.effect();tree=free.render();
  await all(tree,node=>node.type==='form')[0].props.onSubmit({preventDefault(){},currentTarget:{values:{email:'test@example.invalid',password:'test-only-password',displayName:'Test',privacyConsent:'on',inviteCode:'stale-hidden-value'}}});
  assert.equal(free.registered.length,1);assert.equal(free.registered[0].inviteCode,undefined);assert.equal(free.registered[0].privacyConsent,true);free.cleanup();

  const failed=fixture(false);failed.setSettings(new Error('offline'));failed.render();await failed.effect();tree=failed.render();
  assert.equal(submit(tree).props.disabled,true);assert.equal(all(tree,node=>node.props.role==='alert').length,1);
  failed.setSettings({registrationInviteRequired:false});await failed.focus();tree=failed.render();assert.equal(submit(tree).props.disabled,false);failed.cleanup();

  const login=fixture(true,'login');tree=login.render();await login.effect();assert.equal(login.calls,0);assert.equal(invite(tree).length,0);assert.equal(submit(tree).props.disabled,false);
  all(tree,node=>node.type==='button'&&node.props.className==='auth-mode-switch')[0].props.onClick();
  login.render();await login.effect();tree=login.render();assert.equal(invite(tree).length,1,'switching from login to registration loads the invite requirement');login.cleanup();
  console.log('PASS: invite off/on, required field, focus refresh, login-to-register, hidden code omitted, unavailable-settings guard and consent preserved (mock form; no accounts created)');
})().catch(error=>{console.error(error);process.exitCode=1;});
