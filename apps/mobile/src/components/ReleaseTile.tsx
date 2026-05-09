import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { getCoverUrl } from '../lib/api';
import { colors, radius, spacing } from '../theme';
import { Release } from '../types';

type ReleaseTileProps = {
  release: Release;
  onPress?: (release: Release) => void;
};

export function ReleaseTile({ release, onPress }: ReleaseTileProps) {
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={() => onPress?.(release)}>
      <Image source={{ uri: getCoverUrl(release) }} style={styles.cover} />
      <View style={styles.meta}>
        <Text numberOfLines={1} style={styles.title}>
          {release.title}
        </Text>
        <Text numberOfLines={1} style={styles.subtitle}>
          {release.artist}
          {release.year ? ` • ${release.year}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '23.5%',
    gap: 6,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.96 }],
  },
  cover: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.panelSoft,
  },
  meta: {
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: 11.5,
    fontWeight: '800',
    lineHeight: 14,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 11.5,
    fontWeight: '700',
    lineHeight: 14,
  },
});
