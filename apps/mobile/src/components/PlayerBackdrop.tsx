import { memo, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useCoverPalette } from '../lib/use-cover-palette';

type PlayerBackdropProps = {
  coverUrl?: string;
  active?: boolean;
};

// Keep artwork processing independent of the player's frequent progress updates.
export const PlayerBackdrop = memo(function PlayerBackdrop({ coverUrl, active = true }: PlayerBackdropProps) {
  const palette = useCoverPalette(coverUrl, active);
  const [backgroundColor, setBackgroundColor] = useState(palette[0]);
  const [incomingColor, setIncomingColor] = useState<string | null>(null);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const nextColor = palette[0];
    if (nextColor === backgroundColor) return;

    fade.stopAnimation();
    fade.setValue(0);
    setIncomingColor(nextColor);
    const animation = Animated.timing(fade, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (!finished) return;
      setBackgroundColor(nextColor);
      setIncomingColor(null);
      fade.setValue(0);
    });
    return () => animation.stop();
  }, [backgroundColor, fade, palette]);

  return (
    <View
      style={[styles.background, { backgroundColor }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {incomingColor ? (
        <Animated.View style={[styles.background, { backgroundColor: incomingColor, opacity: fade }]} />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#181818',
    overflow: 'hidden',
  },
});
