const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const exported = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/playback-modes.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exported });
const tracks = ['a', 'b', 'c', 'd'].map(id => ({ id }));
const shuffled = exported.shuffledQueue(tracks, 'c', () => 0);
assert.equal(shuffled[0].id, 'c');
assert.equal(new Set(shuffled.map(track => track.id)).size, 4);
assert.equal(tracks.map(track => track.id).join(), 'a,b,c,d');
assert.equal(exported.playbackRepeatMode(false, false), 'Off');
assert.equal(exported.playbackRepeatMode(false, true), 'Queue');
assert.equal(exported.playbackRepeatMode(true, true), 'Track');
assert.equal(exported.playbackRepeatMode(true, false), 'Track');
const player = fs.readFileSync(path.join(__dirname, '../src/components/FullPlayer.tsx'), 'utf8');
assert.match(player, /selected: isShuffleEnabled/);
assert.match(player, /selected: isRepeatEnabled/);
assert.match(player, /<Repeat1 /);
assert.match(player, /engagement.plays > 0/);
console.log('PASS: native queue modes, single-track repeat, selected controls and nonzero plays count');
