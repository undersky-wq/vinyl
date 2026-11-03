import type { HomeRelease } from '../types';
import type { PlayerTrack } from '../providers/player-provider';
import { getBackCoverUrl, getSecondFrontCoverUrl, isBackSidePosition, vinylDisc } from './release-images';

export type ReleaseArtwork = Pick<HomeRelease, 'id' | 'coverStorageUrl' | 'coverImageUrl' | 'coverThumbStorageUrl' | 'coverMediumStorageUrl' | 'backCoverUrl' | 'secondCoverUrl' | 'secondBackCoverUrl' | 'images' | 'backCoverThumbUrl' | 'backCoverMediumUrl' | 'secondCoverThumbUrl' | 'secondCoverMediumUrl' | 'secondBackCoverThumbUrl' | 'secondBackCoverMediumUrl'>;

export function releaseArtworkSnapshot(release: ReleaseArtwork): ReleaseArtwork {
  const {id,coverStorageUrl,coverImageUrl,coverThumbStorageUrl,coverMediumStorageUrl,backCoverUrl,secondCoverUrl,secondBackCoverUrl}=release;
  return {id,coverStorageUrl,coverImageUrl,coverThumbStorageUrl,coverMediumStorageUrl,backCoverUrl,secondCoverUrl,secondBackCoverUrl,
    backCoverThumbUrl:release.backCoverThumbUrl,backCoverMediumUrl:release.backCoverMediumUrl,
    secondCoverThumbUrl:release.secondCoverThumbUrl,secondCoverMediumUrl:release.secondCoverMediumUrl,
    secondBackCoverThumbUrl:release.secondBackCoverThumbUrl,secondBackCoverMediumUrl:release.secondBackCoverMediumUrl,
    images:release.images?.filter(image=>image.isBackCover||image.isSecondFrontCover||image.isSecondBackCover)};
}

export function releaseTrackArtwork(track: PlayerTrack, release: ReleaseArtwork): PlayerTrack {
  if (track.releaseId !== release.id) return track;
  const disc = vinylDisc(track.position);
  const second = disc === 2 ? getSecondFrontCoverUrl(release) : '';
  const frontCoverFullUrl = second || release.coverStorageUrl || release.coverImageUrl || release.coverMediumStorageUrl || release.coverThumbStorageUrl || '/icon.png';
  const frontCoverMobileUrl = disc === 2 ? getSecondFrontCoverUrl(release,'thumb') || frontCoverFullUrl : release.coverThumbStorageUrl || release.coverMediumStorageUrl || frontCoverFullUrl;
  const backCoverUrl = getBackCoverUrl(release, disc);
  const backCoverMobileUrl = getBackCoverUrl(release, disc, 'thumb');
  const backCoverMediumUrl = getBackCoverUrl(release, disc, 'medium');
  const back = Boolean(backCoverUrl) && isBackSidePosition(track.position);
  const artwork = {
    frontCoverUrl:frontCoverMobileUrl,frontCoverFullUrl,frontCoverMobileUrl,backCoverUrl,backCoverMobileUrl,backCoverMediumUrl,
    coverUrl:back?backCoverMobileUrl:frontCoverMobileUrl,
    coverFullUrl:back?backCoverUrl:frontCoverFullUrl,
    coverSide:back?'back' as const:'front' as const,
  };
  return (Object.keys(artwork) as Array<keyof typeof artwork>).every(key=>track[key]===artwork[key]) ? track : {...track,...artwork};
}

export function cachedTrackArtwork(track: PlayerTrack, cache: ReadonlyMap<string, ReleaseArtwork>) {
  const release = track.releaseId ? cache.get(track.releaseId) : undefined;
  return release ? releaseTrackArtwork(track, release) : track;
}
