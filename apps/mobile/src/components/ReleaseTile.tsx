import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ReleaseCover } from './ReleaseCover';
import { colors, radius, spacing } from '../theme';
import { Release } from '../types';

type ReleaseTileProps = {
  release: Release;
  isAdmin?: boolean;
  onPress?: (release: Release) => void;
};

export const ReleaseTile = memo(function ReleaseTile({ release, isAdmin = false, onPress }: ReleaseTileProps) {
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={() => onPress?.(release)}>
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
});

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
