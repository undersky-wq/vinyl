import type { HomeRelease, Release, ReleaseCoverVariants } from '../types';

type ReleaseWithImages = Pick<Release | HomeRelease, 'id' | 'images' | 'backCoverUrl' | 'secondCoverUrl' | 'secondBackCoverUrl'> & ReleaseCoverVariants;
export type CoverSize = 'full' | 'thumb' | 'medium';

export function vinylDisc(position: string | null | undefined): 1 | 2 {
  return /^[CD](?:\d|\b)/i.test(position?.trim() || '') ? 2 : 1;
}

export function playingCoverImage(track: { position?: string | null; coverSide?: 'front' | 'back'; coverUrl: string; frontCoverUrl?: string; frontCoverMobileUrl?: string; backCoverUrl?: string; backCoverMobileUrl?: string }) {
  const back = track.coverSide === 'back' || isBackSidePosition(track.position);
  return { src: (back ? track.backCoverMobileUrl || track.backCoverUrl : track.frontCoverMobileUrl || track.frontCoverUrl) || track.coverUrl, mobileSrc: back ? track.backCoverMobileUrl : track.frontCoverMobileUrl };
}

export function getSecondFrontCoverUrl(release: ReleaseWithImages | null | undefined, size: CoverSize = 'full') {
  if (size === 'thumb' && release?.secondCoverThumbUrl) return release.secondCoverThumbUrl;
  if (size === 'medium' && release?.secondCoverMediumUrl) return release.secondCoverMediumUrl;
  return release?.secondCoverUrl || release?.images?.find(image => image.isSecondFrontCover)?.url || '';
}

export function isBackCoverStorageKey(releaseId: string, storageKey: string) {
  return storageKey.startsWith(`covers/manual/${releaseId}/back.`);
}

export function isBackCoverImage(release: ReleaseWithImages, image: NonNullable<ReleaseWithImages['images']>[number]) {
  if (release.images?.some(entry => typeof entry.isBackCover === 'boolean')) return image.isBackCover === true;
  return image.type === 'GALLERY' && isBackCoverStorageKey(release.id, image.storageKey);
}

export function getBackCoverUrl(release: ReleaseWithImages | null | undefined, disc: 1 | 2 = 1, size: CoverSize = 'full') {
  const variant = disc === 2
    ? size === 'thumb' ? release?.secondBackCoverThumbUrl : size === 'medium' ? release?.secondBackCoverMediumUrl : null
    : size === 'thumb' ? release?.backCoverThumbUrl : size === 'medium' ? release?.backCoverMediumUrl : null;
  if (variant) return variant;
  if (disc === 2) return release?.secondBackCoverUrl || release?.images?.find(image => image.isSecondBackCover)?.url || '';
  if (release?.backCoverUrl) return release.backCoverUrl;
  if (!release?.images) return '';
  return release.images.find(
    (image) => isBackCoverImage(release, image),
  )?.url || '';
}

export function getReleaseGalleryImages(release: ReleaseWithImages) {
  return (release.images || []).filter(image => image.type === 'GALLERY'
    && image.url && !isBackCoverImage(release, image));
}

export function getSelectableReleaseImages(release: ReleaseWithImages) {
  const seen = new Set<string>();
  return (release.images || []).filter(image => {
    if (!image.url || seen.has(image.storageKey)) return false;
    seen.add(image.storageKey);
    return true;
  });
}

export function isBackSidePosition(position: string | null | undefined) {
  return /^[BD](?:\d|\b)/i.test(position?.trim() || '');
}
