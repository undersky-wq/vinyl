type ArtworkRelease = {
  coverStorageKey?: string | null; coverStorageUrl?: string | null; coverImageUrl?: string | null;
  coverThumbStorageKey?: string | null; coverThumbStorageUrl?: string | null;
  coverMediumStorageKey?: string | null; coverMediumStorageUrl?: string | null;
  images?: Array<{ storageKey: string; url: string; thumbStorageKey?: string | null; mediumStorageKey?: string | null; isBackCover?: boolean; isSecondFrontCover?: boolean; isSecondBackCover?: boolean }>;
};

export async function signedTrackArtwork(release: ArtworkRelease, position: string | null, sign: (key: string) => Promise<string | null | undefined>) {
  const second = /^[CD](?:\d|\b)/i.test(position?.trim() || '');
  const frontImage = second ? release.images?.find(image => image.isSecondFrontCover) : undefined;
  const backImage = release.images?.find(image => second ? image.isSecondBackCover : image.isBackCover);
  const frontFullKey = frontImage?.storageKey || release.coverStorageKey || release.coverMediumStorageKey;
  const frontThumbKey = frontImage ? frontImage.thumbStorageKey || frontImage.storageKey : release.coverThumbStorageKey || release.coverMediumStorageKey || release.coverStorageKey;
  const fallback = frontImage?.url || release.coverStorageUrl || release.coverImageUrl || release.coverMediumStorageUrl || release.coverThumbStorageUrl || '';
  const frontCoverFullUrl = (frontFullKey ? await sign(frontFullKey) : null) || fallback;
  const frontCoverUrl = (frontThumbKey ? await sign(frontThumbKey) : null) || frontImage?.url || release.coverThumbStorageUrl || release.coverMediumStorageUrl || frontCoverFullUrl;
  const backCoverUrl = backImage ? (await sign(backImage.storageKey)) || backImage.url : '';
  const backCoverMobileUrl = backImage ? (await sign(backImage.thumbStorageKey || backImage.storageKey)) || backCoverUrl : '';
  const backCoverMediumUrl = backImage ? (await sign(backImage.mediumStorageKey || backImage.storageKey)) || backCoverUrl : '';
  const back = Boolean(backCoverUrl) && /^[BD](?:\d|\b)/i.test(position?.trim() || '');
  return {
    frontCoverUrl, frontCoverFullUrl, frontCoverMobileUrl: frontCoverUrl, backCoverUrl, backCoverMobileUrl, backCoverMediumUrl,
    coverUrl: back ? backCoverMobileUrl : frontCoverUrl,
    coverFullUrl: back ? backCoverUrl : frontCoverFullUrl,
    coverSide: back ? 'back' as const : 'front' as const,
  };
}
