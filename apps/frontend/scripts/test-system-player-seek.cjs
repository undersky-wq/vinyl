const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/providers/player-provider.tsx'), 'utf8');
const ast = ts.createSourceFile('player.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const snippets = {};
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'updateMediaSessionPosition') snippets.position = node.getText(ast);
  if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)
      && node.expression.left.getText(ast) === 'mediaSeekRef.current') snippets.seek = node.getText(ast);
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'onSeeked') snippets.finished = `const ${node.getText(ast)};`;
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(snippets.position && snippets.seek && snippets.finished);
const positions = [];
const uiTimes = [];
const uiProgress = [];
const audio = {
  duration: 200, playbackRate: 1, seeking: false, time: 20, target: null,
  get currentTime() { return this.time; },
  set currentTime(value) { this.target = value; this.seeking = true; },
  fastSeek() { throw Error('System seeking must not use approximate fastSeek'); },
  play() { throw Error('Seeking must not restart playback'); },
  pause() { throw Error('Seeking must not pause playback'); },
};
let syncs = 0;
const context = {
  exports: {}, audio, audioRef: { current: audio }, mediaSeekRef: {},
  navigator: { mediaSession: { setPositionState: value => positions.push(value.position) } },
  setCurrentTime: value => uiTimes.push(value), setProgress: value => uiProgress.push(value),
  syncPlaybackState: () => syncs++,
};
const code = `${snippets.position}\n${snippets.seek}\n${snippets.finished}
exports.seek = mediaSeekRef.current;
exports.update = updateMediaSessionPosition;
exports.finished = onSeeked;`;
vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
const { seek, update, finished } = context.exports;

seek(120);
assert.equal(audio.target, 120);
assert.equal(audio.currentTime, 20, 'Simulate an audio element still reporting the previous position');
assert.deepEqual(positions, [120], 'Publish the requested position immediately');
assert.deepEqual(uiTimes, [120]);
assert.deepEqual(uiProgress, [60]);
update(audio);
assert.deepEqual(positions, [120], 'An intermediate refresh must not publish the old position');
seek(30);
seek(160);
update(audio);
assert.deepEqual(positions, [120, 30, 160], 'Rapid seeking must not move the system slider backwards');
audio.time = audio.target;
audio.seeking = false;
finished();
assert.equal(syncs, 1);
assert.deepEqual(positions, [120, 30, 160, 160], 'Confirm the actual position without a React render');
seek(-10);
assert.equal(audio.target, 0);
seek(999);
assert.equal(audio.target, 200);
const count = positions.length;
seek(NaN);
seek(Infinity);
assert.equal(positions.length, count);
audio.duration = NaN;
update(audio, 50);
assert.equal(positions.length, count);
context.audioRef.current = null;
seek(10);
assert.equal(positions.length, count);
assert.match(source, /audio\.addEventListener\('seeked', onSeeked\)/);
assert.match(source, /audio\.removeEventListener\('seeked', onSeeked\)/);
console.log('PASS: exact system seek, no stale position during seeking, direct completion update, rapid seeks and bounds');
