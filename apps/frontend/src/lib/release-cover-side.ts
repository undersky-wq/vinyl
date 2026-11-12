import type { HomeRelease } from '../types';
import type { PlayerTrack } from '../providers/player-provider';
import { getBackCoverUrl, isBackSidePosition, vinylDisc } from './release-images';

type CoverRelease = Pick<HomeRelease, 'id' | 'images' | 'backCoverUrl' | 'secondCoverUrl' | 'secondBackCoverUrl'> & {
  tracks: Array<{ id: string; position?: string | null }>;
};
type PlayingTrack = Pick<PlayerTrack, 'id' | 'releaseId' | 'position'> | null;
export type CoverSideOverride = { playbackKey: string; back: boolean; placeholder?: boolean };
export type CoverSideOverrides = Record<string, CoverSideOverride>;

export function trackRowCoverSide(release: CoverRelease) {
  return Boolean(getBackCoverUrl(release, vinylDisc(release.tracks[0]?.position))) && isBackSidePosition(release.tracks[0]?.position);
}

export function releaseCoverSide(release: CoverRelease, playing: PlayingTrack, override?: CoverSideOverride, compact = false) {
  const active = release.tracks.find(track => track.id === playing?.id)
    || (!compact && playing?.releaseId === release.id ? playing : undefined);
  const position = active?.position ?? (active?.id === playing?.id ? playing?.position : undefined);
  const playbackKey = active ? `${active.id}:${position || ''}` : '';
  const ownPosition = position ?? (compact ? release.tracks[0]?.position : undefined);
  const disc = vinylDisc(ownPosition);
  const automaticBack = isBackSidePosition(ownPosition);
  return {
    playbackKey,
    disc,
    back: override?.playbackKey === playbackKey
      ? override.back && (Boolean(getBackCoverUrl(release, disc)) || Boolean(override.placeholder))
      : Boolean(getBackCoverUrl(release, disc)) && automaticBack,
  };
}

export function toggleReleaseCoverSide(overrides: CoverSideOverrides, release: CoverRelease, playing: PlayingTrack, compact = false, allowPlaceholder = false): CoverSideOverrides {
  const side = releaseCoverSide(release, playing, overrides[release.id], compact);
  return { ...overrides, [release.id]: { playbackKey: side.playbackKey, back: !side.back, ...(allowPlaceholder ? { placeholder: true } : {}) } };
}

export function collapseReleaseCoverSide(overrides: CoverSideOverrides, release: CoverRelease, playing: PlayingTrack, isPlaying: boolean, compact = false): CoverSideOverrides {
  const side = releaseCoverSide(release, playing, overrides[release.id], compact);
  if ((isPlaying && side.playbackKey) || !side.back) return overrides;
  // A paused track is still selected in the player, so clearing the override alone would restore its B side.
  return { ...overrides, [release.id]: { playbackKey: side.playbackKey, back: false } };
}
