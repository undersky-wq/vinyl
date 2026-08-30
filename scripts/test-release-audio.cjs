// Run from the repository root: node scripts/test-release-audio.cjs
// Uses the mobile workspace's TypeScript install. No server, database or network required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../apps/mobile/node_modules/typescript');
const root = path.resolve(__dirname, '..');

function evaluate(source, filename, mocks = {}) {
  const result = ts.transpileModule(source, {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      experimentalDecorators: true,
      esModuleInterop: true,
    },
  });
  assert.equal((result.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0, filename);
  const module = { exports: {} };
  const jsx = (type, props) => ({ type, props });
  const mockRequire = (name) => name === 'react/jsx-runtime'
    ? { jsx, jsxs: jsx }
    : mocks[name] || {};
  new Function('require', 'module', 'exports', result.outputText)(mockRequire, module, module.exports);
  return module.exports;
}

function load(filename, mocks = {}) {
  return evaluate(fs.readFileSync(path.join(root, filename), 'utf8'), filename, mocks);
}

const web = load('apps/frontend/src/lib/release-audio.ts');
const mobile = load('apps/mobile/src/lib/release-audio.ts');
const audio = { id: 'audio', storageKey: 'audio/track.mp3', storageUrl: null };
const uploaded = { id: 'track', title: 'Track', audioFiles: [audio] };
const missing = { id: 'missing', title: 'Missing', audioFiles: [] };
const cases = [
  [{ tracks: [] }, false],
  [{ tracks: [missing] }, false],
  [{ tracks: [uploaded, missing] }, false],
  [{ tracks: [uploaded] }, true],
  [{ tracks: [uploaded, uploaded] }, true],
  [{ tracks: [uploaded], audioComplete: false }, false],
  [{ tracks: [], audioComplete: true }, true],
];
for (const [release, expected] of cases) {
  assert.equal(web.isReleaseAudioComplete(release), expected);
  assert.equal(mobile.isReleaseAudioComplete(release), expected);
}

function find(tree, type) {
  if (!tree || typeof tree !== 'object') return null;
  if (tree.type === type) return tree;
  const children = tree.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const match = find(child, type);
    if (match) return match;
  }
  return null;
}

const { ReleaseCover } = load('apps/mobile/src/components/ReleaseCover.tsx', {
  'react-native': { Image: 'Image' },
  'react-native-svg/filter-image': { FilterImage: 'FilterImage' },
  '../lib/api': { getCoverUrl: () => 'unchanged-cover.webp' },
  '../lib/release-audio': mobile,
});
let user;
const { ReleaseCard } = load('apps/frontend/src/components/release-card.tsx', {
  'next/link': { default: 'Link' },
  'lucide-react': { Play: 'Play' },
  './cover-artwork': { CoverArtwork: 'CoverArtwork' },
  '../providers/auth-provider': { useAuth: () => ({ user, requireAuth() {} }) },
  '../providers/player-provider': { usePlayerActions: () => ({ playQueue() {} }) },
});
for (const role of [undefined, 'USER', 'ADMIN']) {
  user = role ? { role } : null;
  for (const complete of [false, true]) {
    const release = { id: 'release', title: 'Release', tracks: [], audioComplete: complete };
    const shouldGray = role === 'ADMIN' && !complete;
    const cover = ReleaseCover({ release, isAdmin: role === 'ADMIN', style: { width: 72, height: 72 } });
    assert.equal(cover.type, shouldGray ? 'FilterImage' : 'Image');
    assert.equal(cover.props.source.uri, 'unchanged-cover.webp');
    if (shouldGray) assert.deepEqual(cover.props.filters, [{ name: 'feColorMatrix', type: 'saturate', values: [0] }]);
    assert.equal(find(ReleaseCard({ release }), 'CoverArtwork').props.grayscale, shouldGray);
  }
}

// Check home mapping before it drops tracks without playable URLs (including guest responses).
const apiFile = fs.readFileSync(path.join(root, 'apps/frontend/src/lib/api.ts'), 'utf8');
const parsedApi = ts.createSourceFile('api.ts', apiFile, ts.ScriptTarget.Latest, true);
const mapNode = parsedApi.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'mapHomeRelease');
assert.ok(mapNode);
const { mapHomeRelease } = evaluate(`${mapNode.getText(parsedApi)}\nexports.mapHomeRelease = mapHomeRelease;`, 'mapping.ts');
assert.equal(mapHomeRelease({ tracks: [uploaded, missing] }).audioComplete, false);
assert.equal(mapHomeRelease({ tracks: [uploaded] }).audioComplete, true);
assert.equal(mapHomeRelease({ tracks: [uploaded], audioComplete: false }).audioComplete, false);

// Back navigation keeps both scroll/list state and the latest completion status after upload/delete.
const storage = new Map();
global.window = { sessionStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) } };
web.rememberReleaseAudioStatus('release', true);
assert.equal(web.restoreReleaseAudioStatuses([{ id: 'release', audioComplete: false }])[0].audioComplete, true);
web.rememberReleaseAudioStatus('release', false);
assert.equal(web.restoreReleaseAudioStatuses([{ id: 'release', audioComplete: true }])[0].audioComplete, false);
window.sessionStorage.getItem = () => '{broken';
assert.equal(web.restoreReleaseAudioStatuses([{ id: 'release', audioComplete: true }])[0].audioComplete, true);
delete global.window;

async function testBackend() {
  const { ReleasesService } = load('apps/backend/src/modules/releases/releases.service.ts', {
    '@nestjs/common': { Injectable: () => (target) => target },
  });
  let missingCount = 1;
  let libraryQuery;
  const prisma = {
    release: {
      count: async () => 1,
      findMany: async (query) => {
        if (!query.include) return [];
        libraryQuery = query;
        return [{ id: 'release', tracks: [uploaded], _count: { tracks: missingCount } }];
      },
    },
    track: { count: async () => 1 },
  };
  const service = new ReleasesService({ get: () => undefined }, prisma, {}, { getSignedObjectUrl: async () => '/audio.mp3' }, {});
  for (const [release, expected] of cases) {
    const result = await service.signReleaseUrls(release, false);
    assert.equal(result.audioComplete, expected);
  }
  let feed = await service.findLibraryFeed({ key: 'Am' });
  assert.equal(feed.releases[0].audioComplete, false);
  assert.deepEqual(libraryQuery.include._count.select.tracks.where, { audioFiles: { none: {} } });
  assert.ok(libraryQuery.include.tracks.where.key); // List is filtered, completeness is not.
  assert.equal('_count' in feed.releases[0], false);
  missingCount = 0;
  feed = await service.findLibraryFeed({});
  assert.equal(feed.releases[0].audioComplete, true);
}

testBackend().then(() => {
  console.log('PASS: completeness, admin-only web/APK rendering, guest URLs, home mapping, upload/delete cache, filtered library count.');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
