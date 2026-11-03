const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');
let request;
class FakeXHR {
  upload = {};
  constructor() { request = this; }
  open(method, url) { this.method = method; this.url = url; }
  send(body) { this.body = body; }
}
const moduleValue = { exports: {} };
new Function('module', 'exports', 'XMLHttpRequest', ts.transpileModule(source('lib/upload-form-data.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(moduleValue, moduleValue.exports, FakeXHR);
(async () => {
  const values = []; let settled = false;
  const body = {};
  const result = moduleValue.exports.uploadFormData('/api/releases/manual', body, value => values.push(value)).then(value => { settled = true; return value; });
  assert.equal(request.withCredentials, true); assert.equal(request.body, body);
  request.upload.onprogress({ lengthComputable: true, loaded: 1, total: 2 });
  request.upload.onprogress({ lengthComputable: true, loaded: 2, total: 2 });
  request.upload.onload(); await Promise.resolve();
  assert.deepEqual(values, [50,99,100]); assert.equal(settled, false, '100% transferred does not mean server processing succeeded');
  request.status = 201; request.responseText = '{"id":"new-mix"}'; request.onload(); assert.equal((await result).id, 'new-mix');
  const failed = moduleValue.exports.uploadFormData('/upload', body, () => {});
  request.status = 400; request.responseText = '{"message":["Invalid MP3","Too large"]}'; request.onload();
  await assert.rejects(failed, /Invalid MP3, Too large/);
  const network = moduleValue.exports.uploadFormData('/upload', body, () => {}); request.onerror(); await assert.rejects(network, /Connection lost/);
  const timeout = moduleValue.exports.uploadFormData('/upload', body, () => {}); request.ontimeout(); await assert.rejects(timeout, /timed out/);
  const form = source('components/upload-form.tsx');
  assert(form.includes('<option value="mixes">')); assert(form.includes("payload.append('isMix', String(music))"));
  assert(form.includes("payload.append('isOriginal', String(original))"));
  assert(form.includes('aria-busy={isSubmitting}') && form.includes('<progress'));
  assert(form.includes('Boolean(createdReleaseId)'), 'successful submission blocks accidental duplicates');
  const crop = source('components/square-cover-input.tsx');
  assert(crop.includes('setPreviewUrl(previewRef.current)') && crop.includes('src={previewUrl}'));
  assert(crop.includes('URL.revokeObjectURL(previewRef.current)'), 'accepted preview URLs are released');
  console.log('PASS: mix destination, persistent crop preview, upload percentages, processing phase, success and failure states');
})().catch(error => { console.error(error); process.exitCode = 1; });
