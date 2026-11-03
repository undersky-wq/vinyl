type BackCoverImage = { isBackCover?: boolean; isSecondFrontCover?: boolean; isSecondBackCover?: boolean; storageKey: string; url: string; thumbStorageKey?: string | null; mediumStorageKey?: string | null };

export async function signedBackCoverUrl(images: BackCoverImage[] | undefined, sign: (key: string) => Promise<string | null | undefined>, side: 'back' | 'front2' | 'back2' = 'back', size: 'full' | 'thumb' | 'medium' = 'full') {
  const flag = side === 'front2' ? 'isSecondFrontCover' : side === 'back2' ? 'isSecondBackCover' : 'isBackCover';
  const back = images?.find(image => image[flag] === true);
  const key = back && (size === 'thumb' ? back.thumbStorageKey : size === 'medium' ? back.mediumStorageKey : null);
  return back ? (await sign(key || back.storageKey)) || back.url : null;
}

export async function signedSideCoverUrls(images: BackCoverImage[] | undefined, sign: (key: string) => Promise<string | null | undefined>) {
  const [backCoverUrl, backCoverThumbUrl, backCoverMediumUrl, secondCoverUrl, secondCoverThumbUrl, secondCoverMediumUrl, secondBackCoverUrl, secondBackCoverThumbUrl, secondBackCoverMediumUrl] = await Promise.all([
    signedBackCoverUrl(images, sign), signedBackCoverUrl(images, sign, 'back', 'thumb'), signedBackCoverUrl(images, sign, 'back', 'medium'),
    signedBackCoverUrl(images, sign, 'front2'), signedBackCoverUrl(images, sign, 'front2', 'thumb'), signedBackCoverUrl(images, sign, 'front2', 'medium'),
    signedBackCoverUrl(images, sign, 'back2'), signedBackCoverUrl(images, sign, 'back2', 'thumb'), signedBackCoverUrl(images, sign, 'back2', 'medium'),
  ]);
  return { backCoverUrl, backCoverThumbUrl, backCoverMediumUrl, secondCoverUrl, secondCoverThumbUrl, secondCoverMediumUrl, secondBackCoverUrl, secondBackCoverThumbUrl, secondBackCoverMediumUrl };
}
