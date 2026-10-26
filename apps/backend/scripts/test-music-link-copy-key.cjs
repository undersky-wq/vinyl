const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/modules/releases/music-link-copy-key.ts'), 'utf8');
const context = { exports: {}, require };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const { musicLinkCopyKey } = context.exports;
assert.equal(musicLinkCopyKey('browser-a', 'user-1'), musicLinkCopyKey('browser-b', 'user-1'));
assert.notEqual(musicLinkCopyKey('browser-a', 'user-1'), musicLinkCopyKey('browser-a', 'user-2'));
assert.equal(musicLinkCopyKey('guest-request'), 'guest-request');
assert.match(musicLinkCopyKey('browser-a', 'user-1'), /^[a-f0-9]{36}$/);
console.log('Account-level music link copy key tests passed');
