const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const context = { exports: {}, require: () => ({}) };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/waveform.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const { waveformPixelGrid } = context.exports;
for (const scale of [.5,.67,.8,.9,1,1.1,1.25,1.5,1.8,2,3]) for (const width of [80,181,320,481.37,901,1600]) for (const left of [0,12.35,603.127]) {
  const grid = waveformPixelGrid(width, left, scale);
  let previousEnd;
  for (let i = 0; i < grid.count; i++) {
    const start = (left + grid.start + i * grid.step) * scale;
    const end = start + grid.width * scale;
    assert(Math.abs(start - Math.round(start)) < 1e-7, 'bar starts on a device pixel');
    assert(Math.abs(end - Math.round(end)) < 1e-7, 'bar ends on a device pixel');
    if (previousEnd !== undefined) assert(start - previousEnd >= 1 - 1e-7, 'at least one clear pixel between bars');
    assert(end <= (left + width) * scale + 1e-7, 'bars fit in measured container');
    previousEnd = end;
  }
}
console.log('PASS: uniform device-pixel bars and gaps at 50-300% scale and fractional origins');
