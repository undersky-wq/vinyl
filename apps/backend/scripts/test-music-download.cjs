const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { Readable, Writable } = require('node:stream');
require('reflect-metadata');
const common = require('@nestjs/common');
const stubs = new Map();
function load(relative, overrides = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true, emitDecoratorMetadata: true, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => {
    if (name in overrides) return overrides[name];
    if (name === 'sharp') return () => {};
    if (name.startsWith('.')) {
      if (!stubs.has(name)) stubs.set(name, new Proxy({}, { get: (_, key) => { const id = `${name}:${String(key)}`; if (!stubs.has(id)) stubs.set(id, class {}); return stubs.get(id); } }));
      return stubs.get(name);
    }
    return require(name);
  }, module, module.exports);
  return module.exports;
}
(async () => {
  const { AuthGuard } = load('modules/auth/auth.guards.ts');
  await assert.rejects(() => new AuthGuard({ getUserFromRequest: async () => null }).canActivate({ switchToHttp: () => ({ getRequest: () => ({}) }) }), common.UnauthorizedException);
  const { ReleasesService } = load('modules/releases/releases.service.ts');
  const { ReleasesController } = load('modules/releases/releases.controller.ts', { '../auth/auth.guards': { AuthGuard, AdminGuard: class {} } });
  assert(Reflect.getMetadata('__guards__', ReleasesController.prototype.downloadMusic).includes(AuthGuard));
  const records = new Set(); let available = true, missing = false, dbFailure = false, queries = 0, stream;
  const service = new ReleasesService({ get: () => 'music-bucket' }, {
    track: { findFirst: async query => {
      queries++; assert.equal(query.where.id, 'track'); assert.equal(query.where.releaseId, 'mix');
      assert.deepEqual(query.where.release.OR, [{ isMix: true }, { isOriginal: true }]);
      return missing ? null : { title: 'Title', release: { artist: 'Artist' }, audioFiles: [{ storageKey: 'original.wav', normalizedStorageKey: 'audio/track.mp3', normalizedMimeType: 'audio/mpeg' }] };
    } },
    $executeRaw: async (sql, release, user) => { assert(sql.join('').includes('ON CONFLICT DO NOTHING')); if (dbFailure) throw Error('db failed'); records.add(`${release}:${user}`); },
  }, {}, { openDownload: async (bucket, key) => { assert.equal(bucket, 'music-bucket'); assert.equal(key, 'audio/track.mp3'); if (!available) throw Error('missing file'); stream = Readable.from(['test audio']); return stream; } }, {});
  await assert.rejects(() => service.openMusicDownload('mix', 'track', ''), common.ForbiddenException);
  assert.equal(queries, 0);
  await service.openMusicDownload('mix', 'track', 'user1', false); assert.equal(records.size, 0); stream.destroy();
  const first = await service.openMusicDownload('mix', 'track', 'user1');
  assert.equal(first.filename, 'Artist - Title.mp3'); first.stream.destroy();
  (await service.openMusicDownload('mix', 'track', 'user1')).stream.destroy(); assert.equal(records.size, 1);
  (await service.openMusicDownload('mix', 'track', 'user2')).stream.destroy(); assert.equal(records.size, 2);
  available = false; await assert.rejects(() => service.openMusicDownload('mix', 'track', 'user3')); assert.equal(records.size, 2);
  available = true; missing = true; await assert.rejects(() => service.openMusicDownload('mix', 'track', 'user3'), common.NotFoundException);
  missing = false; dbFailure = true; await assert.rejects(() => service.openMusicDownload('mix', 'track', 'user3')); assert(stream.destroyed);
  const controller = new ReleasesController({ openMusicDownload: async () => ({ stream: Readable.from(['abc']), filename: 'Artist - Трек.mp3', mimeType: 'audio/mpeg' }) }, {});
  let body = ''; const response = new Writable({ write(chunk, _, done) { body += chunk.toString(); done(); } });
  const headers = {}; response.setHeader = (key, value) => { headers[key] = value; };
  await controller.downloadMusic('mix', 'track', { user: { id: 'user1' }, method: 'GET' }, response);
  assert.equal(body, 'abc'); assert.equal(headers['Cache-Control'], 'private, no-store'); assert(headers['Content-Disposition'].includes("filename*=UTF-8''"));
  const migration = fs.readFileSync(path.join(__dirname, '../prisma/migrations/20261027010000_music_downloads/migration.sql'), 'utf8');
  assert(migration.includes('PRIMARY KEY ("releaseId", "userId")'));
  console.log('PASS: authenticated route, music-only scoped files, streaming headers, HEAD safety, account dedup contract and failed-storage cleanup');
})().catch(error => { console.error(error); process.exitCode = 1; });
