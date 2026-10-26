const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const state = [];
let slot = 0, effects = [], resize;
const sandbox = { exports: {}, window: { matchMedia: () => ({ matches: true }) },
  ResizeObserver: class { constructor(callback) { resize = callback; } observe() {} disconnect() {} },
  require: () => ({
    useState(initial) { const index = slot++; if (!(index in state)) state[index] = initial; return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next; }]; },
    useMemo: fn => fn(), useEffect: fn => { effects.push(fn); },
  }),
};
const code = ts.transpileModule(fs.readFileSync('src/lib/waveform.ts','utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
vm.runInNewContext(code,sandbox);
function render() {
  slot = 0; effects = [];
  const result = sandbox.exports.useResponsiveWaveform([.2,.8,.4], { minBars:48,maxBars:400,pixelsPerBar:4 });
  effects.forEach(fn => fn());
  return result;
}
const closed = render();
closed.ref({getBoundingClientRect:()=>({width:320})});
render();
assert.equal(render().barCount,80,'Opening a previously absent player must measure the mounted waveform');
resize([{contentRect:{width:480}}]);
assert.equal(render().barCount,120,'Resizing must update bar count');
render().ref(null);
render();
console.log('PASS: delayed player mount and responsive waveform sizing');
