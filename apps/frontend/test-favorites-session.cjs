const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

class FavoriteUpdateError extends Error {
  constructor(status) { super('failed'); this.status = status; }
}
let ids = [];
let forcedPrompt = false;
let signedOut = false;
let calls = 0;
let finish;
const pending = new Set();
const auth = {
  user: { id: 'test' },
  requireAuth(force) { if (force) forcedPrompt = true; return !force; },
  setUser(user) { signedOut = user === null; },
};
const source = fs.readFileSync('src/providers/favorites-provider.tsx', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const sandbox = {
  exports: {},
  require(name) {
    if (name === 'react') return {
      createContext: () => ({ Provider: 'provider' }),
      useContext: () => null,
      useEffect: () => {},
      useMemo: fn => fn(),
      useRef: () => ({ current: pending }),
      useState: () => [ids, update => { ids = typeof update === 'function' ? update(ids) : update; }],
    };
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
    if (name === './auth-provider') return { useAuth: () => auth };
    if (name === '../lib/api') return {
      FavoriteUpdateError,
      getFavorites: async () => [],
      toggleFavoriteTrack: () => { calls++; return new Promise((resolve, reject) => { finish = { resolve, reject }; }); },
    };
    throw new Error(name);
  },
};
vm.runInNewContext(compiled, sandbox);
async function main() {
  const value = sandbox.exports.FavoritesProvider({ children: null }).props.value;
  const request = value.toggleFavorite('track');
  assert.equal(ids.includes('track'), true);
  await value.toggleFavorite('track');
  assert.equal(calls, 1, 'Repeated tap must not send a second toggle');
  finish.reject(new FavoriteUpdateError(401));
  await request;
  assert.equal(ids.includes('track'), false);
  assert.equal(signedOut, true);
  assert.equal(forcedPrompt, true, 'Expired session must open sign-in prompt');
  assert.equal(pending.size, 0);
  const retry = value.toggleFavorite('track');
  finish.resolve({ active: true });
  await retry;
  assert.equal(ids.includes('track'), true);
  assert.equal(pending.size, 0);
  console.log('PASS: expired-session prompt, optimistic rollback, duplicate tap protection, successful save');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
