// Node-only layout regression checks; native Android rendering still needs a device check.
// Run from the repository root: node scripts/test-player-backdrop.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../apps/mobile/node_modules/typescript');

const filename = path.resolve(__dirname, '../apps/mobile/src/components/PlayerBackdrop.tsx');
const source = fs.readFileSync(filename, 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: filename,
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
});

const palette = ['#275da8', '#204778', '#172b4f'];
let paletteEnabled;
const fill = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 };
const jsx = (type, props, key) => ({ type, props, key });
const mocks = {
  '../lib/use-cover-palette': { useCoverPalette: (_url, enabled) => { paletteEnabled = enabled; return palette; } },
  react: {
    memo: (component) => component,
    useState: (initial) => [initial, () => {}],
    useRef: (current) => ({ current }),
    useEffect: (effect) => effect(),
  },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': {
    Animated: {
      View: 'Animated.View',
      Value: class {
        stopAnimation() {}
        setValue() {}
      },
      timing: () => ({ start() {}, stop() {} }),
    },
    View: 'View',
    StyleSheet: { absoluteFillObject: fill, create: (styles) => styles },
  },
};
const loaded = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputText)(
  (name) => { assert.ok(mocks[name], `Unexpected import: ${name}`); return mocks[name]; },
  loaded, loaded.exports,
);
const render = loaded.exports.PlayerBackdrop;

function find(tree, type) {
  if (!tree || typeof tree !== 'object') return null;
  if (tree.type === type) return tree;
  const children = tree.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = find(child, type);
    if (found) return found;
  }
  return null;
}

const props = { coverUrl: 'https://example.test/cover.webp' };
const tree = render(props);
assert.equal(tree.props.pointerEvents, 'none');
assert.equal(paletteEnabled, true);
assert.equal(find(tree, 'Image'), null, 'Player background must not render a blurred image');
assert.equal(tree.props.style[1].backgroundColor, palette[0]);
assert.equal(find(tree, 'LinearGradient'), null, 'Full player must not render a gradient');
assert.match(source, /duration:\s*800/, 'Track color transition should last 800 ms');
assert.match(source, /useNativeDriver:\s*true/, 'Color crossfade should stay off the JS rendering path');
render({ ...props, active: false });
assert.equal(paletteEnabled, false, 'Hidden full player should not extract artwork colors');
console.log('PASS: solid full-player background, no blur/gradient, native 800 ms color crossfade.');
