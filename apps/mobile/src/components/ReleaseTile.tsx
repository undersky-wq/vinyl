import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ReleaseCover } from './ReleaseCover';
import { adaptiveStyles, colors } from '../theme';
import { Release } from '../types';

type ReleaseTileProps = {
  release: Release;
  isAdmin?: boolean;
  onPress?: (release: Release) => void;
};

export function ReleaseTile({ release, isAdmin = false, onPress }: ReleaseTileProps) {
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={() => onPress?.(release)} accessibilityRole="button" accessibilityLabel={`${release.artist}, ${release.title}`}>
      <ReleaseCover release={release} isAdmin={isAdmin} style={styles.cover} />
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

const styles = adaptiveStyles(StyleSheet.create({
  card: {
    width: '23.5%',
    gap: 6,
  },
  pressed: {
    opacity: 0.86,
  },
  cover: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 0,
    backgroundColor: colors.panelSoft,
  },
  meta: {
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: 11.5,
    fontWeight: '400',
    lineHeight: 14,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 11.5,
    fontWeight: '400',
    lineHeight: 14,
  },
}));
