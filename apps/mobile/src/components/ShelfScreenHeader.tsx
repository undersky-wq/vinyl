import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Moon, Sun } from 'lucide-react-native';
import { adaptiveStyles, colors, type ThemeMode } from '../theme';
import type { LanguageProps } from '../types';

export function ShelfScreenHeader({ lang, onLanguageChange, avatarUrl, theme, onToggleTheme, onOpenProfile, onHome, query, onQueryChange }: LanguageProps & {
  avatarUrl?: string | null; theme: ThemeMode; onToggleTheme: () => void;
  onOpenProfile: () => void; onHome: () => void; query: string; onQueryChange: (query: string) => void;
}) {
  const ru = lang === 'ru';
  return <View style={styles.header}>
    <Pressable onPress={onOpenProfile} accessibilityLabel={ru ? 'Профиль' : 'Profile'} style={styles.avatar}>
      {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} /> : <Text style={styles.initial}>M</Text>}
    </Pressable>
    <View style={styles.body}>
      <View style={styles.brandRow}>
        <Pressable onPress={onHome}><Text style={styles.brand}>{ru ? 'Коллекция винила' : 'Vinyl collection'}</Text></Pressable>
        <Pressable onPress={onToggleTheme} hitSlop={8} accessibilityLabel={ru ? 'Сменить тему' : 'Change theme'}>{theme === 'dark' ? <Sun size={14} color={colors.muted} /> : <Moon size={14} color={colors.muted} />}</Pressable>
        <Pressable onPress={() => onLanguageChange(ru ? 'en' : 'ru')} hitSlop={6}><Text style={styles.language}>{ru ? 'RU' : 'ENG'}</Text></Pressable>
      </View>
      <TextInput value={query} onChangeText={onQueryChange} style={styles.search} placeholder={ru ? 'Поиск' : 'Search'} placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} accessibilityLabel={ru ? 'Поиск треков' : 'Search tracks'} />
    </View>
  </View>;
}

const styles = adaptiveStyles(StyleSheet.create({
  header: { paddingTop: 18, marginHorizontal: '3%', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.background },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.panelSoft, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 23 }, initial: { fontSize: 17, color: colors.text },
  body: { flex: 1, gap: 7 }, brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brand: { color: colors.text, fontSize: 13, fontWeight: '700', letterSpacing: -.35 }, language: { fontSize: 10, color: colors.muted },
  search: { color: colors.text, padding: 0, paddingBottom: 4, fontSize: 13, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
}));
