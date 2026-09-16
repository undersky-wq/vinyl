// Read-only audit: database image references versus local files.
const { PrismaClient } = require('@prisma/client');
const { stat } = require('node:fs/promises');
const path = require('node:path');
const prisma = new PrismaClient();

async function main() {
  if ((process.env.STORAGE_DRIVER || 'local').toLowerCase() !== 'local') {
    throw new Error('This audit checks local storage only. STORAGE_DRIVER is not local.');
  }
  const root = path.resolve(process.env.LOCAL_STORAGE_PATH || '/data/storage');
  const releases = await prisma.release.findMany({
    where: { isMix: false },
    select: {
      id: true, title: true, coverStorageKey: true,
      coverThumbStorageKey: true, coverMediumStorageKey: true,
      images: { select: { type: true, storageKey: true } },
    },
  });
  const checked = new Map();
  const missing = [];
  let galleries = 0;
  let withGallery = 0;
  let noPrimary = 0;
  for (const release of releases) {
    const gallery = release.images.filter(image => image.type === 'GALLERY');
    galleries += gallery.length;
    if (gallery.length) withGallery++;
    if (!release.coverStorageKey) noPrimary++;
    const keys = new Set([
      release.coverStorageKey, release.coverThumbStorageKey,
      release.coverMediumStorageKey, ...release.images.map(image => image.storageKey),
    ].filter(Boolean));
    for (const key of keys) {
      if (!checked.has(key)) {
        const target = path.resolve(root, key);
        let issue = null;
        if (!target.startsWith(root + path.sep)) issue = 'Invalid storage key';
        else {
          try {
            const info = await stat(target);
            if (!info.isFile() || info.size === 0) issue = 'Empty or non-file object';
          } catch (error) {
            issue = error.code === 'ENOENT' ? 'Missing file' : `Cannot inspect file: ${error.code}`;
          }
        }
        checked.set(key, issue);
      }
      if (checked.get(key)) missing.push({ release: release.title, id: release.id, key, issue: checked.get(key) });
    }
  }
  console.log(JSON.stringify({
    releases: releases.length,
    releasesWithGallery: withGallery,
    releasesWithoutGallery: releases.length - withGallery,
    galleryImagesInDatabase: galleries,
    releasesWithoutPrimaryStorageKey: noPrimary,
    uniqueImageFilesChecked: checked.size,
    missingOrUnreadableUniqueFiles: [...checked.values()].filter(Boolean).length,
    missing,
    note: 'No gallery does not necessarily mean an error. Images absent from the database require a separate comparison with Discogs.',
  }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
