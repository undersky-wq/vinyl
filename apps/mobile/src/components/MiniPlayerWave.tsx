import { memo, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

const PERIOD = 240;
const WAVE_WIDTH = PERIOD * 4;
const WAVE_HEIGHT = 68;

function buildWavePath(center: number, amplitude: number, phase = 0, closeAtBottom = false) {
  const points: string[] = [];
  for (let x = 0; x <= WAVE_WIDTH; x += 8) {
    const main = Math.sin((x / PERIOD) * Math.PI * 2 + phase) * amplitude;
    const detail = Math.sin((x / PERIOD) * Math.PI * 4 + phase + 0.7) * (amplitude * 0.22);
    points.push(`${x === 0 ? 'M' : 'L'} ${x} ${center + main + detail}`);
  }
  if (closeAtBottom) {
    points.push(`L ${WAVE_WIDTH} ${WAVE_HEIGHT}`, `L 0 ${WAVE_HEIGHT}`, 'Z');
  }
  return points.join(' ');
}

const BACK_WAVE_PATH = buildWavePath(39, 8, Math.PI * 0.72, true);
const FRONT_WAVE_PATH = buildWavePath(33, 12, 0, true);
const WAVE_CREST_PATH = buildWavePath(33, 12);

export const MiniPlayerWave = memo(function MiniPlayerWave({ active }: { active: boolean }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const pausedOffsetRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const rememberCurrentOffset = () => {
      animationRef.current?.stop();
      translateX.stopAnimation((value) => {
        if (Number.isFinite(value)) pausedOffsetRef.current = value;
      });
    };

    if (!active) {
      rememberCurrentOffset();
      return;
    }

    const runCycle = (offset: number) => {
      if (cancelled) return;
      const startOffset = offset <= -PERIOD + 0.5
        ? 0
        : Math.max(-PERIOD, Math.min(0, offset));
      const remainingRatio = Math.max(0.01, (-PERIOD - startOffset) / -PERIOD);
      pausedOffsetRef.current = startOffset;
      translateX.setValue(startOffset);

      const animation = Animated.timing(translateX, {
        toValue: -PERIOD,
        duration: Math.round(4200 * remainingRatio),
        easing: Easing.linear,
        useNativeDriver: true,
      });
      animationRef.current = animation;
      animation.start(({ finished }) => {
        if (!finished || cancelled) return;
        pausedOffsetRef.current = 0;
        translateX.setValue(0);
        runCycle(0);
      });
    };

    runCycle(pausedOffsetRef.current);
    return () => {
      cancelled = true;
      rememberCurrentOffset();
    };
  }, [active, translateX]);

  return (
    <View style={styles.clip} pointerEvents="none" accessibilityElementsHidden>
      <Animated.View style={[styles.wave, { transform: [{ translateX }] }]}>
        <Svg width={WAVE_WIDTH} height={WAVE_HEIGHT} viewBox={`0 0 ${WAVE_WIDTH} ${WAVE_HEIGHT}`}>
          <Defs>
            <LinearGradient
              id="miniPlayerWaveFill"
              x1="0"
              y1="0"
              x2="0"
              y2={WAVE_HEIGHT}
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset="0" stopColor="#f0abfc" stopOpacity={0.62} />
              <Stop offset="0.32" stopColor="#c084fc" stopOpacity={0.42} />
              <Stop offset="0.7" stopColor="#7c3aed" stopOpacity={0.2} />
              <Stop offset="1" stopColor="#4c1d95" stopOpacity={0.05} />
            </LinearGradient>
            <LinearGradient
              id="miniPlayerBackWaveFill"
              x1="0"
              y1="0"
              x2="0"
              y2={WAVE_HEIGHT}
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset="0" stopColor="#8b5cf6" stopOpacity={0.3} />
              <Stop offset="1" stopColor="#312e81" stopOpacity={0.03} />
            </LinearGradient>
            <LinearGradient
              id="miniPlayerWaveCrest"
              x1="0"
              y1="0"
              x2={WAVE_WIDTH}
              y2="0"
              gradientUnits="userSpaceOnUse"
            >
              {Array.from({ length: 4 }).flatMap((_, cycle) => [
                <Stop key={`${cycle}-0`} offset={(cycle + 0) / 4} stopColor="#7c3aed" stopOpacity={0.72} />,
                <Stop key={`${cycle}-1`} offset={(cycle + 0.3) / 4} stopColor="#d8b4fe" stopOpacity={0.95} />,
                <Stop key={`${cycle}-2`} offset={(cycle + 0.58) / 4} stopColor="#f0abfc" stopOpacity={1} />,
                <Stop key={`${cycle}-3`} offset={(cycle + 0.8) / 4} stopColor="#a855f7" stopOpacity={0.9} />,
                <Stop key={`${cycle}-4`} offset={(cycle + 1) / 4} stopColor="#7c3aed" stopOpacity={0.72} />,
              ])}
            </LinearGradient>
          </Defs>
          <Path d={BACK_WAVE_PATH} fill="url(#miniPlayerBackWaveFill)" />
          <Path d={FRONT_WAVE_PATH} fill="url(#miniPlayerWaveFill)" />
          <Path d={WAVE_CREST_PATH} fill="none" stroke="url(#miniPlayerWaveCrest)" strokeWidth={9} strokeOpacity={0.16} strokeLinecap="round" />
          <Path d={WAVE_CREST_PATH} fill="none" stroke="url(#miniPlayerWaveCrest)" strokeWidth={2.4} strokeOpacity={0.92} strokeLinecap="round" />
        </Svg>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  clip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  wave: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: WAVE_WIDTH,
    height: WAVE_HEIGHT,
  },
});
