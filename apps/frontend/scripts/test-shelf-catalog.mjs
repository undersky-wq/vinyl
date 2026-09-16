import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const files = [
  '../src/components/paper-archive.tsx', '../src/app/page.tsx',
  '../src/components/home-release-grid.tsx', '../src/lib/api.ts', '../src/types/index.ts',
  '../../backend/src/modules/releases/releases.service.ts',
  '../../backend/src/modules/releases/dto/query-releases.dto.ts',
  '../src/components/shelf-release-editor.tsx', '../src/components/profile-screen.tsx',
  '../src/components/admin-edit-mode-sync.tsx', '../src/components/mini-player.tsx',
  '../src/components/shelf-mix-track.tsx', '../../backend/src/modules/releases/releases.controller.ts',
  '../src/lib/shelf-mobile-layout.ts',
  '../src/components/collection-transitions.tsx', '../src/app/layout.tsx',
  '../src/components/shelf-release-form.tsx','../src/components/track-upload-button.tsx',
  '../src/components/release-detail.tsx','../src/components/home-stage.tsx',
  '../src/components/player-page-client.tsx','../src/lib/use-player-artwork.ts',
  '../src/providers/player-provider.tsx',
  '../src/middleware.ts',
  '../src/app/robots.ts',
  '../src/lib/server-site-settings.ts',
  '../src/components/shelf-mix-detail.tsx','../src/app/releases/[id]/page.tsx',
];
for (const file of files) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const result = ts.transpileModule(source, {
    fileName: file, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, experimentalDecorators: true },
  });
  assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, file);
}
const backend = readFileSync(new URL(files[5], import.meta.url), 'utf8');
const catalog = backend.split("if (query.catalog === 'true') {")[1].split('const releases = summaryOnly')[0];
assert.ok(catalog.includes('tracks: []'));
assert.ok(catalog.includes('tracksLoaded: false'));
assert.ok(!catalog.includes('waveformData'));
assert.ok(!catalog.includes('storageUrl: true'), 'catalog does not select audio URLs');
const page = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8');
assert.ok(page.includes("shelfQuery.set('catalog', 'true')"));
assert.ok(page.includes("siteSettings.siteDesign === 'shelf'"), 'Shelf is separated from the classic catalogue on the server');
const frontendApi = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
assert.ok(frontendApi.includes('bpm: track.bpm ?? null'), 'Shelf track mapping preserves BPM');
assert.ok(frontendApi.includes('key: track.key ?? null'), 'Shelf track mapping preserves musical key');
const middleware = readFileSync(new URL('../src/middleware.ts', import.meta.url), 'utf8');
assert.ok(middleware.includes('rawStyles.length > 1'), 'repeated style parameters are rejected before SSR');
assert.ok(middleware.includes('MAX_SELECTED_STYLES'), 'style selection is bounded');
const shelf = readFileSync(new URL('../src/components/paper-archive.tsx', import.meta.url), 'utf8');
assert.ok(shelf.includes('r.coverThumbStorageUrl || r.coverMediumStorageUrl'), 'Shelf previews prefer 320px artwork');
assert.ok(shelf.includes('priorityCoverStart'), 'visible centre covers receive loading priority');
console.log('PASS: changed TypeScript syntax; catalog omits waveform and audio payload');
