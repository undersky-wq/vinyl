const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function mount(file, component, storage, initialTheme) {
  let value, initialized = false;
  const effects = [];
  const documentElement = { dataset: { shelfTheme: initialTheme }, style: {} };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/components', file), 'utf8');
  const react = {
    useState(initial) {
      if (!initialized) { value = initial; initialized = true; }
      return [value, next => { value = next; }];
    },
    useEffect(fn) { effects.push(fn); },
  };
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  vm.runInNewContext(compiled.outputText, {
    exports, window: { localStorage: storage, requestAnimationFrame: () => 1, cancelAnimationFrame() {} }, document: { documentElement },
    require: name => name === 'react' ? react : name.startsWith('next/') ? { default: () => null } : require(name),
  });
  const render = () => exports[component]({ lang: 'ru' });
  render();
  effects[0]();
  return { render, documentElement };
}

function buttons(node) {
  if (!node || !node.props) return [];
  if (node.type === 'button') return [node];
  return [node.props.children].flat().flatMap(buttons);
}

const denied = () => { throw Error('Storage unavailable'); };
for (const storage of [{ getItem: denied, setItem: denied }, { getItem: () => 'dark', setItem: denied }]) {
  const theme = mount('shelf-theme-toggle.tsx', 'ShelfThemeToggle', storage, 'dark');
  assert.equal(theme.render().props['aria-pressed'], true);
  theme.render().props.onClick();
  assert.equal(theme.render().props['aria-pressed'], false);
  assert.equal(theme.documentElement.dataset.shelfTheme, 'light');
  assert.equal(theme.documentElement.style.colorScheme, 'light');
  const consent = mount('cookie-consent.tsx', 'CookieConsent', storage);
  const before = consent.render();
  assert.equal(before.props.children[0], null);
  buttons(before)[0].props.onClick();
  assert.equal(consent.render().props.children[1], null);
  assert.equal(consent.render().props.children[0], null);
}
let saved;
const normal = mount('shelf-theme-toggle.tsx', 'ShelfThemeToggle', { getItem: () => 'light', setItem: (_, value) => { saved = value; } });
normal.render().props.onClick();
assert.equal(saved, 'dark');
console.log('PASS: blocked/full storage, theme changes, no analytics without consent, normal persistence');
