import { ImageStyle, StyleProp } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { FilterImage } from 'react-native-svg/filter-image';
import { getCoverUrl } from '../lib/api';
import { isReleaseAudioComplete } from '../lib/release-audio';
import type { Release } from '../types';

type ReleaseCoverProps = {
  release: Release;
  isAdmin?: boolean;
  style: StyleProp<ImageStyle>;
  highQuality?: boolean;
  transitionMs?: number;
};

export function ReleaseCover({ release, isAdmin = false, style, highQuality = false, transitionMs }: ReleaseCoverProps) {
  const source = { uri: getCoverUrl(release) };

  // SVG filters also work in this app's legacy architecture; RN's style.filter does not.
  if (isAdmin && !isReleaseAudioComplete(release)) {
    return (
      <FilterImage
        source={source}
        style={style}
        resizeMode="cover"
        filters={[{ name: 'feColorMatrix', type: 'saturate', values: [0] }]}
      />
    );
  }

  return (
    <ExpoImage
      source={source}
      style={style}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={release.id}
      transition={transitionMs ?? (highQuality ? 0 : 90)}
      allowDownscaling={!highQuality}
    />
  );
}
