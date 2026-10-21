import { StyleSheet, Text } from 'react-native';
import { adaptiveStyles, colors } from '../theme';

export function AnimatedLogo({ lang }: { lang: 'ru' | 'en' }) {
  return <Text numberOfLines={1} style={styles.logo}>{lang === 'ru' ? 'Коллекция винила' : 'Vinyl collection'}</Text>;
}

const styles = adaptiveStyles(StyleSheet.create({
  logo: { flexShrink: 1, fontSize: 16, fontWeight: '700', letterSpacing: -0.4, color: colors.text },
}));
