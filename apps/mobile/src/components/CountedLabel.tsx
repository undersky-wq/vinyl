import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

export function CountedLabel({ label, count, style }: {
  label: string; count?: number | string; style?: StyleProp<TextStyle>;
}) {
  return <View style={styles.row}>
    <Text style={[style, styles.label]}>{label}</Text>
    {count !== undefined ? <Text style={[style, styles.count]}>{count}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 3, flexShrink: 1 },
  label: { flexShrink: 1 },
  count: { fontSize: 9, lineHeight: 12, fontWeight: '500', letterSpacing: 0, includeFontPadding: false, marginTop: -2 },
});
