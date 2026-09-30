import type { HomeRelease, Release } from '../types';

type ReleaseWithImages = Pick<Release | HomeRelease, 'id' | 'images' | 'backCoverUrl'>;

export function isBackCoverStorageKey(releaseId: string, storageKey: string) {
  return storageKey.startsWith(`covers/manual/${releaseId}/back.`);
}

export function getBackCoverUrl(release: ReleaseWithImages | null | undefined) {
  if (release?.backCoverUrl) return release.backCoverUrl;
  if (!release?.images) return '';
  return release.images.find(
    (image) => image.type === 'GALLERY' && isBackCoverStorageKey(release.id, image.storageKey),
  )?.url || '';
}
