import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

type LoadingStateProps = {
  label?: string;
};

export function LoadingState({ label = 'Loading collection' }: LoadingStateProps) {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spinAnimation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1600,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    spinAnimation.start();
    pulseAnimation.start();

    return () => {
      spinAnimation.stop();
      pulseAnimation.stop();
    };
  }, [pulse, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1.05],
  });
  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.52, 1],
  });

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.discGlow, { opacity, transform: [{ scale }] }]}>
        <Animated.View style={[styles.disc, { transform: [{ rotate }] }]}>
          <View style={styles.grooveOuter} />
          <View style={styles.grooveInner} />
          <View style={styles.label} />
          <View style={styles.needle} />
        </Animated.View>
      </Animated.View>
      <Text style={styles.text}>{label}</Text>
      <View style={styles.dots}>
        <Animated.View style={[styles.dot, { opacity }]} />
        <Animated.View style={[styles.dot, styles.dotAccent]} />
        <Animated.View style={[styles.dot, { opacity }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingTop: 120,
  },
  discGlow: {
    width: 86,
    height: 86,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(181,120,255,0.12)',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 26,
  },
  disc: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  grooveOuter: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  grooveInner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  label: {
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  needle: {
    position: 'absolute',
    top: 9,
    right: 13,
    width: 4,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.accentStrong,
    transform: [{ rotate: '38deg' }],
  },
  text: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.muted,
  },
  dotAccent: {
    backgroundColor: colors.accent,
  },
});
