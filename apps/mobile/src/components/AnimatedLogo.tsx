import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { colors } from '../theme';

type AnimatedLogoProps = {
  lang: 'ru' | 'en';
};

export function AnimatedLogo({ lang }: AnimatedLogoProps) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 2900,
          useNativeDriver: false,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 2900,
          useNativeDriver: false,
        }),
      ]),
    );

    animation.start();

    return () => animation.stop();
  }, [shimmer]);

  const color = shimmer.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [colors.accent, colors.accentStrong, colors.accent],
  });

  return (
    <Animated.Text numberOfLines={1} style={[styles.logo, { color }]}>
      {lang === 'ru' ? 'Коллекция винила' : 'Vinyl Collection'}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  logo: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.8,
    textShadowColor: 'rgba(181,120,255,0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
});
