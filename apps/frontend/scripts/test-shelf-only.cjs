const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { retireClassicStyles } = require('./retire-classic-styles.cjs');
const root = path.join(__dirname, '../src');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function load(file, mocks = {}) {
  const exports = {};
  const js = ts.transpileModule(read(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  vm.runInNewContext(js, { exports, URLSearchParams, require: name => {
    if (name in mocks) return mocks[name];
    if (name === 'react') return { ...React, useEffect: () => {} };
    if (name.startsWith('.')) return {};
    return require(name);
  } });
  return exports;
}

async function main() {
  const cookies = { get: () => undefined, toString: () => '' };
  const mockCookies = { cookies: async () => cookies };
  const lang = { normalizeSiteLang: () => 'en' };
  const releases = [{ id: 'one', tracks: [] }];
  function Shelf() {}
  const home = load('app/page.tsx', {
    'next/headers': mockCookies, '../components/home-stage': { HomeStage: Shelf },
    '../lib/language': lang, '../lib/home-data-cache': { getPublicHomeData: (_, fetch) => fetch() },
    '../lib/api': { getHomeReleases: async () => releases },
  });
  assert.equal((await home.default({ searchParams: Promise.resolve({}) })).props.children.type, Shelf);
  const music = load('components/public-music-page.tsx', {
    'next/headers': mockCookies, '../lib/language': lang,
    './paper-archive': { RecordShelfStage: Shelf },
    '../lib/api': { getLibraryReleasesFeed: async () => ({ releases: [], total: 0 }) },
  });
  for (const originals of [false, true]) {
    const result = await music.PublicMusicPage({ originals });
    assert.equal(result.props.children.type, Shelf);
    assert.equal(result.props.children.props.originalsMode, originals);
  }
  const design = load('components/design-variant-switcher.tsx');
  assert.equal(design.DesignVariantProvider({ children: null }).props.value.variant, 'shelf');
  assert.equal(design.DesignVariantSwitcher, undefined);
  for (const file of ['app/page.tsx', 'components/public-music-page.tsx', 'app/favorites/page.tsx']) {
    assert.doesNotMatch(read(file), /import .*\b(?:HomeReleaseGrid|HomeStyleFilters|MixesBrowser|Topbar)\b/);
  }
  assert.match(read('app/layout.tsx'), /data-visual-variant="shelf"/);
  assert.doesNotMatch(read('components/profile-screen.tsx'), /DesignVariantSwitcher/);
  const css = '.mix-card{a:b}.mini-player{c:d}@media(max-width:700px){.mix-card:hover,.auth-form{e:f}}';
  const split = retireClassicStyles(css);
  assert.doesNotMatch(split.current, /mix-card/);
  assert.match(split.current, /mini-player/);
  assert.match(split.current, /@media\(max-width:700px\)\{\.auth-form/);
  assert.match(split.retired, /@media\(max-width:700px\)/);
  assert.doesNotMatch(read('app/layout.tsx'), /retired-classic/);
  console.log('PASS: Shelf-only public routes/provider, no classic switch, shared player/forms CSS preserved');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
