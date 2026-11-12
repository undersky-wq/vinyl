const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const normalizeLabels = labels => [...new Set((labels || []).map(label => label.name?.trim()).filter(Boolean))];

async function fingerprint(db) {
  const hashes = {};
  for (const table of ['Release', 'Track', 'Image', 'AudioFile', 'CollectionItem']) {
    const expression = table === 'Release' ? "(to_jsonb(t)-'labels')::text" : 'to_jsonb(t)::text';
    const rows = await db.$queryRawUnsafe(`SELECT count(*)::int AS count, md5(COALESCE(string_agg(md5(${expression}), '' ORDER BY id), '')) AS hash FROM "${table}" t`);
    hashes[table] = rows[0];
  }
  return hashes;
}

async function hasLabelsColumn() {
  const rows = await prisma.$queryRaw`SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='Release' AND column_name='labels'`;
  return rows.length > 0;
}

async function prepare(file) {
  if (fs.existsSync(file)) throw new Error('Manifest already exists; refusing to overwrite');
  const token = process.env.DISCOGS_USER_TOKEN;
  const username = process.env.DISCOGS_USERNAME;
  if (!token || !username) throw new Error('Discogs settings are missing');
  const columnExists = await hasLabelsColumn();
  const rows = await prisma.$queryRawUnsafe(`SELECT id, "discogsReleaseId", ${columnExists ? 'labels' : 'ARRAY[]::text[] AS labels'} FROM "Release" ORDER BY id`);
  const baseline = await fingerprint(prisma);
  const wanted = new Set(rows.filter(row => row.discogsReleaseId > 0).map(row => row.discogsReleaseId));
  const found = new Map();
  let lastRequest = 0;
  async function get(path) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await pause(Math.max(0, 1200 - (Date.now() - lastRequest)));
      lastRequest = Date.now();
      const response = await fetch(`https://api.discogs.com${path}`, {
        headers: { Authorization: `Discogs token=${token}`, 'User-Agent': 'Vinyl-Label-Backfill/1.0' },
        redirect: 'error', signal: AbortSignal.timeout(45000),
      });
      if (response.status === 404) return null;
      if (response.status === 429 || response.status >= 500) {
        const retry = Number(response.headers.get('retry-after'));
        await response.body?.cancel();
        await pause(Math.min(120000, Math.max(10000, (Number.isFinite(retry) ? retry : 0) * 1000)));
        continue;
      }
      if (!response.ok) throw new Error(`Discogs returned HTTP ${response.status}`);
      return response.json();
    }
    throw new Error('Discogs retry limit exceeded');
  }
  let page = 1, pages = 1;
  do {
    const body = await get(`/users/${encodeURIComponent(username)}/collection/folders/0/releases?per_page=100&page=${page}`);
    if (!body) throw new Error('Discogs collection is unavailable');
    pages = body.pagination?.pages || 1;
    for (const item of body.releases || []) {
      const release = item.basic_information;
      if (wanted.has(release?.id)) {
        const labels = normalizeLabels(release.labels);
        if (labels.length) found.set(release.id, labels);
      }
    }
    console.log(`Discogs collection page ${page}/${pages}; matched ${found.size}/${wanted.size}`);
  } while (++page <= pages);
  const missing = [];
  for (const id of wanted) {
    if (found.has(id)) continue;
    const release = await get(`/releases/${id}`);
    const labels = normalizeLabels(release?.labels);
    if (labels.length) found.set(id, labels);
    else missing.push(id);
  }
  const changes = rows.filter(row => found.has(row.discogsReleaseId)).map(row => ({
    id: row.id, discogsReleaseId: row.discogsReleaseId, previous: row.labels || [], next: found.get(row.discogsReleaseId),
  })).filter(row => JSON.stringify(row.previous) !== JSON.stringify(row.next));
  const manifest = { version: 1, createdAt: new Date().toISOString(), columnExists, baseline, changes, missing, skippedManual: rows.filter(row => row.discogsReleaseId <= 0).length };
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ status: 'LABELS_PREPARED_NO_DB_CHANGES', releases: rows.length, changes: changes.length, missing, skippedManual: manifest.skippedManual, manifest: file }));
}

async function apply(file) {
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.changes)) throw new Error('Invalid manifest');
  const result = await prisma.$transaction(async db => {
    // Block catalog writers briefly while verifying and updating labels only.
    await db.$executeRawUnsafe('LOCK TABLE "Release", "Track", "Image", "AudioFile", "CollectionItem" IN SHARE ROW EXCLUSIVE MODE');
    if (JSON.stringify(await fingerprint(db)) !== JSON.stringify(manifest.baseline)) throw new Error('Catalog changed since preparation; prepare a new manifest');
    await db.$executeRawUnsafe('ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "labels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]');
    let updated = 0;
    for (const row of manifest.changes) {
      const count = await db.$executeRaw`UPDATE "Release" SET "labels"=${row.next}::text[] WHERE id=${row.id} AND "discogsReleaseId"=${row.discogsReleaseId} AND "labels"=${row.previous}::text[]`;
      if (count !== 1) throw new Error(`Labels changed concurrently for release ${row.id}`);
      updated += count;
    }
    const after = await fingerprint(db);
    if (JSON.stringify(after) !== JSON.stringify(manifest.baseline)) throw new Error('Non-label catalog data changed; rolling back');
    return { updated, fingerprints: after };
  }, { timeout: 120000, maxWait: 15000 });
  console.log(JSON.stringify({ status: 'RELEASE_LABELS_COMPLETE', ...result, otherFieldsUnchanged: true }));
}

const [mode, file] = process.argv.slice(2);
Promise.resolve().then(() => {
  if (!file || !['--prepare', '--apply'].includes(mode)) throw new Error('Usage: node backfill-release-labels.cjs --prepare|--apply manifest.json');
  return mode === '--prepare' ? prepare(file) : apply(file);
}).catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
