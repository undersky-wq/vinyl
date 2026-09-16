import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const source=readFileSync(new URL('../src/lib/api.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let fail=false;
class UploadRequest {
  upload={}; status=200; responseText='{"id":"audio-1"}';
  open(method,url) {assert.equal(method,'POST');assert.equal(url,'/api/audio/upload');}
  send(payload) {
    assert.equal(this.withCredentials,true);
    assert.equal(payload.get('trackId'),'track-1');
    this.upload.onprogress({lengthComputable:true,loaded:60,total:100});
    this.upload.onload();
    if(fail){this.status=500;this.responseText='{"message":"expected failure"}';}
    this.onload();
  }
}
const api={};
new Function('exports','process','window','XMLHttpRequest','FormData',code)(api,{env:{}},{},UploadRequest,FormData);
const progress=[];
assert.deepEqual(await api.uploadTrackAudio('track-1',new File(['audio'],'test.mp3'),value=>progress.push(value)),{id:'audio-1'});
assert.deepEqual(progress,[60,100]);
fail=true;
await assert.rejects(api.uploadTrackAudio('track-1',new File(['audio'],'test.mp3'),()=>{}),/expected failure/);
console.log('PASS: upload progress, credentials, success and server error');
