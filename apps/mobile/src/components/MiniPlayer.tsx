import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Heart, Pause, Play } from 'lucide-react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors, radius, spacing } from '../theme';
import { normalizeDurationLabel } from '../lib/time';
import { PlayerTrack } from '../types';

type MiniPlayerProps = {
  track: PlayerTrack | null;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  isFavorite: boolean;
  onToggle: () => void;
  onFavorite: () => void;
  onOpen: () => void;
};

function formatMs(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '--:--';
  }

  const totalSeconds = Math.floor(value / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function MiniPlayer({
  track,
  isPlaying,
  positionMs,
  durationMs,
  isFavorite,
  onToggle,
  onFavorite,
  onOpen,
}: MiniPlayerProps) {
  const ringSize = 54;
  const ringStroke = 2.4;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCircumference = 2 * Math.PI * ringRadius;

  if (!track) {
    return null;
  }

  const progress = durationMs > 0 ? Math.min(positionMs / durationMs, 1) : 0;
  const ringOffset = ringCircumference * (1 - progress);

  return (
    <Pressable style={styles.shell} onPress={onOpen}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="miniBackground" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#343239" />
              <Stop offset="0.55" stopColor="#494052" />
              <Stop offset="1" stopColor="#554366" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#miniBackground)" />
        </Svg>
      </View>
      <Pressable style={styles.playOuter} onPress={onToggle}>
        <Svg width={ringSize} height={ringSize} style={styles.playProgressRing}>
          <Circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={ringRadius}
            stroke="rgba(255,255,255,0.16)"
            strokeWidth={ringStroke}
            fill="none"
          />
          <Circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={ringRadius}
            stroke={colors.accent}
            strokeWidth={ringStroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${ringCircumference} ${ringCircumference}`}
            strokeDashoffset={ringOffset}
            rotation="-90"
            originX={ringSize / 2}
            originY={ringSize / 2}
          />
        </Svg>
        <View style={styles.play}>
          {isPlaying ? <Pause size={20} color="#111111" /> : <Play size={20} color="#111111" fill="#111111" />}
        </View>
      </Pressable>
      <View style={styles.textBlock}>
        <Text numberOfLines={1} style={styles.title}>
          {track.title}
        </Text>
        <Text numberOfLines={1} style={styles.artist}>
          {track.artist}
        </Text>
      </View>
      <Pressable style={styles.heartButton} onPress={onFavorite}>
        <Heart
          size={17}
          strokeWidth={2.3}
          color={isFavorite ? colors.accent : '#dedee2'}
          fill={isFavorite ? colors.accent : 'none'}
        />
      </Pressable>
      <Text style={styles.time}>{normalizeDurationLabel(track.durationRaw, durationMs / 1000, formatMs(durationMs))}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: 82,
    zIndex: 20,
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 7,
    paddingRight: 13,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(16,16,18,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(180,180,180,0.45)',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.45,
    shadowRadius: 28,
  },
  playOuter: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  playProgressRing: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  play: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  artist: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  title: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  time: {
    color: '#dedee2',
    fontSize: 13,
    fontWeight: '800',
  },
  heartButton: {
    width: 27,
    height: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
