import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing } from 'react-native';

export function ReleaseReveal({ children, enabled, visible, reducedMotion, step }: {
  children: ReactNode; enabled: boolean; visible: boolean; reducedMotion: boolean; step: number;
}) {
  const progress = useRef(new Animated.Value(enabled && !reducedMotion ? 0 : 1)).current;
  useLayoutEffect(() => {
    if (!enabled || reducedMotion) { progress.setValue(1); return; }
    progress.setValue(0);
    if (!visible) return;
    const animation = Animated.timing(progress, {
      toValue: 1, duration: 650, delay: 300 + Math.min(step, 12) * 65,
      easing: Easing.bezier(.16, 1, .3, 1), useNativeDriver: true, isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [enabled, visible, reducedMotion, step, progress]);
  if (!enabled) return <>{children}</>;
  return <Animated.View pointerEvents={visible ? 'auto' : 'none'} style={{ opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }}>{children}</Animated.View>;
}
