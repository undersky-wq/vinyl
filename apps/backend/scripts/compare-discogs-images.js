// Read-only comparison of current Discogs gallery counts and stored gallery slots.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const token = process.env.DISCOGS_USER_TOKEN?.trim();
  if (!token) throw new Error('DISCOGS_USER_TOKEN is missing; no API requests were made.');
  const base = (process.env.DISCOGS_API_BASE_URL || 'https://api.discogs.com').replace(/\/$/, '');
  const releases = await prisma.release.findMany({
    where: { isMix: false }, orderBy: { discogsReleaseId: 'asc' },
    select: { discogsReleaseId: true, title: true, images: {
      where: { type: 'GALLERY' }, select: { storageKey: true },
    } },
  });
  const differences = [];
  const errors = [];
  let matched = 0;
  let expectedTotal = 0;
  let checked = 0;
  for (const release of releases) {
    let detail;
    let failure = 'Request failed';
    for (let attempt = 0; attempt < 3; attempt++) {
      await pause(1500);
      try {
        const response = await fetch(`${base}/releases/${release.discogsReleaseId}`, {
          headers: { Authorization: `Discogs token=${token}`, 'User-Agent': 'vinyl-collection-mvp/0.1' },
          signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) {
          failure = `HTTP ${response.status}`;
          if (response.status === 429) {
            const retry = Number(response.headers.get('retry-after'));
            await pause(Number.isFinite(retry) && retry > 0 ? Math.min(retry * 1000,120000) : 60000);
          } else if (response.status < 500) break;
          continue;
        }
        detail = await response.json();
        break;
      } catch { failure = 'Network error or timeout'; }
    }
    if (!detail || !Array.isArray(detail.images)) {
      errors.push({ discogsId: release.discogsReleaseId, title: release.title,
        issue: detail ? 'API did not return an image list; completeness unknown' : failure });
    } else {
      const expected = detail.images.filter(image => image.type !== 'primary' && (image.uri || image.uri150));
      const keys = new Set(release.images.map(image => image.storageKey));
      const expectedKeys = expected.map((_, index) => `covers/${release.discogsReleaseId}/gallery-${index + 1}.jpg`);
      const missingSlots = expectedKeys.filter(key => !keys.has(key));
      checked++;
      expectedTotal += expected.length;
      if (expected.length === release.images.length && !missingSlots.length) matched++;
      else differences.push({ discogsId: release.discogsReleaseId, title: release.title,
        discogsGalleryImages: expected.length, storedGalleryImages: release.images.length, missingSlots });
    }
    const processed = checked + errors.length;
    if (processed % 20 === 0 || processed === releases.length) {
      console.log(`Checked ${processed}/${releases.length}; differences ${differences.length}; errors ${errors.length}`);
    }
  }
  console.log(JSON.stringify({ releases: releases.length, successfullyCompared: checked,
    matchingGalleryCountsAndSlots: matched, discogsGalleryImages: expectedTotal,
    storedGalleryImages: releases.reduce((sum,release) => sum + release.images.length,0),
    differences, errors,
    note: 'Read-only. Counts/slots are compared, not image content. Discogs galleries may have changed since import; missing API image lists are not treated as empty galleries.',
  }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
