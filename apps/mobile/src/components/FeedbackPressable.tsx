import { Pressable as NativePressable, type PressableProps, StyleSheet } from 'react-native';

// Shared touch feedback. Selection is represented by the label/icon color;
// the soft background only exists while the finger is down.
export function FeedbackPressable({ style, ...props }: PressableProps) {
  return (
    <NativePressable
      {...props}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        state.pressed && !props.disabled && styles.pressed,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  pressed: {
    backgroundColor: 'rgba(128,128,128,0.08)',
    borderRadius: 0,
    opacity: 0.8,
  },
});
