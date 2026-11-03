const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/components/shelf-mix-track.tsx'), 'utf8');
const handler = source.match(/const outside = \(event: PointerEvent\) => \{[\s\S]*?\n    \};/);
assert(handler, 'outside handler exists');
assert(source.includes('ref={waveformInteractionRef} className="paper-mix-wave"'), 'waveform and its markers share the protected region');
const compiled = ts.transpileModule(handler[0], { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
class FakeNode {}
const panel = new FakeNode(), toggle = new FakeNode(), waveform = new FakeNode(), marker = new FakeNode(), elsewhere = new FakeNode();
let closed = 0, notified = 0, desktop = true;
const outside = new Function('Node', 'window', 'commentsPanelRef', 'commentsToggleRef', 'waveformInteractionRef', 'setCommentsOpen', 'onCommentsOpenChange', 'comments', `${compiled}; return outside;`)(
  FakeNode, { matchMedia: () => ({ matches: desktop }) },
  { current: { contains: node => node === panel } },
  { current: { contains: node => node === toggle } },
  { current: { contains: node => node === waveform || node === marker } },
  value => { assert.equal(value, false); closed++; },
  (value, count) => { assert.equal(value, false); assert.equal(count, 3); notified++; }, [1, 2, 3],
);
for (const target of [panel, toggle, waveform, marker, null]) outside({ target });
assert.equal(closed, 0, 'waveform scrubbing and markers keep comments open');
outside({ target: elsewhere });
assert.equal(closed, 1); assert.equal(notified, 1);
desktop = false; outside({ target: elsewhere });
assert.equal(closed, 1, 'mobile outside behavior unchanged');
console.log('PASS: waveform/markers preserve comments, desktop outside closes, mobile unchanged');
