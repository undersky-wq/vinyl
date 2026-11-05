const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.join(__dirname, '../src');
function load(file, globals, mocks = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, ...globals, require: name => name in mocks ? mocks[name] : name.endsWith('.css') ? {} : require(name) });
  return exports;
}

(async () => {
  const calls = [];
  const api = load('lib/cover-maintenance.ts', { fetch: async (url, options) => {
    calls.push({ url, ...options }); return { ok: true, json: async () => ({ status: 'idle' }) };
  } });
  await api.coverMaintenanceRequest('status');
  await api.coverMaintenanceRequest('check');
  await api.coverMaintenanceRequest('convert');
  assert.deepEqual(calls.map(call => call.method), ['GET', 'POST', 'POST']);
  assert.ok(calls.every(call => call.credentials === 'include' && call.cache === 'no-store'));
  assert.equal(calls[2].url, '/api/releases/covers/maintenance/convert');
  const failedApi = load('lib/cover-maintenance.ts', { fetch: async () => ({ ok: false, status: 403 }) });
  await assert.rejects(() => failedApi.coverMaintenanceRequest('convert'), /403/);

  const state = [];
  let cursor = 0;
  const requested = [];
  const running = { id: 'job', mode: 'check', status: 'running', total: 10, processed: 5, webp: 4, other: 1,
    converted: 0, skipped: 0, failed: 0, stale: 0, withoutStorageKey: 0, bytesBefore: 1000, bytesAfter: 1000, formats: { webp: 4, png: 1 }, errors: [] };
  const { CoverMaintenance } = load('components/cover-maintenance.tsx', {}, {
    react: { ...React, useEffect: () => {}, useState: initial => {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
    } },
    '../lib/cover-maintenance': { coverMaintenanceRequest: async action => { requested.push(action); return running; } },
  });
  function render(lang = 'ru') { cursor = 0; return CoverMaintenance({ lang }); }
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    for (const child of React.Children.toArray(node.props?.children)) {
      const result = find(child, predicate); if (result) return result;
    }
    return null;
  }
  let tree = render();
  assert.equal(requested.length, 0, 'Do not inspect all files automatically on page load');
  assert.doesNotMatch(renderToStaticMarkup(tree), /WebP/);
  find(tree, node => node.type === 'button').props.onClick();
  tree = render();
  assert.match(renderToStaticMarkup(tree), /качество 90/);
  const check = find(tree, node => node.type === 'button' && node.props.children === 'Проверить обложки');
  await check.props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  tree = render();
  assert.deepEqual(requested, ['check']);
  assert.match(renderToStaticMarkup(tree), /5 \/ 10 \(50%\)/);
  assert.equal(find(tree, node => node.type === 'button' && node.props.children === 'Преобразовать в WebP').props.disabled, true);
  state[1] = { ...running, mode: 'convert', status: 'completed', converted: 2, errors: [{ key: 'covers/broken.jpg', message: 'Error' }], failed: 1 };
  const html = renderToStaticMarkup(render());
  assert.match(html, /Обработка завершена/); assert.match(html, /covers\/broken.jpg/);
  assert.match(renderToStaticMarkup(render('en')), /Processing completed/);
  const profile = fs.readFileSync(path.join(root, 'components/profile-screen.tsx'), 'utf8');
  assert.match(profile, /activeUser\.role === 'ADMIN' \? <CoverMaintenance/);
  console.log('PASS: authenticated API methods, no automatic audit, explicit actions, progress, disabled concurrent buttons, results/errors and RU/EN');
})().catch(error => { console.error(error); process.exitCode = 1; });
