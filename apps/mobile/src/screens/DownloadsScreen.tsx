import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Download, Play } from 'lucide-react-native';
import { FeedbackPressable as Pressable } from '../components/FeedbackPressable';
import { getDownloadedTracks } from '../lib/offline-audio';
import { colors, spacing, shelfStyles } from '../theme';
import type { AppLanguage, PlayerTrack } from '../types';

export function DownloadsScreen({ lang, activeTrackId, onPlayTrack }: {
  lang: AppLanguage;
  activeTrackId: string | null;
  onPlayTrack: (track: PlayerTrack, queue: PlayerTrack[]) => void;
}) {
  const [tracks, setTracks] = useState<PlayerTrack[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const ru = lang === 'ru';
  async function load() {
    setLoading(true);
    try { setTracks(await getDownloadedTracks()); setError(false); }
    catch { setError(true); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const search = query.trim().toLocaleLowerCase();
  const visible = tracks.filter(track => `${track.artist} ${track.title}`.toLocaleLowerCase().includes(search));
  return <View style={styles.root}>
    <Text style={styles.heading}>{ru ? 'Загрузки' : 'Downloads'} <Text style={styles.count}>{tracks.length}</Text></Text>
    <Text style={styles.note}>{ru ? 'Музыка на телефоне. Работает без интернета.' : 'Music on this phone. Available offline.'}</Text>
    <TextInput value={query} onChangeText={setQuery} style={styles.search} placeholder={ru ? 'Поиск в загрузках' : 'Search downloads'} placeholderTextColor={colors.muted} accessibilityLabel={ru ? 'Поиск в загрузках' : 'Search downloads'} />
    <FlatList data={visible} keyExtractor={track => track.id} refreshing={loading} onRefresh={() => void load()}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={styles.empty}>{error ? (ru ? 'Не удалось прочитать загрузки. Потяните вниз, чтобы повторить.' : 'Unable to read downloads. Pull to retry.') : loading ? '' : search ? (ru ? 'Ничего не найдено.' : 'No matching downloads.') : (ru ? 'Сначала скачайте трек или микс кнопкой загрузки в плеере. Затем его можно слушать здесь, даже в авиарежиме.' : 'Download a track or mix in the player first, then listen here, even in airplane mode.')}</Text>}
      renderItem={({ item }) => <Pressable style={styles.row} accessibilityRole="button" accessibilityLabel={`${ru ? 'Слушать' : 'Play'}: ${item.artist} — ${item.title}`} onPress={() => onPlayTrack(item, visible)}>
        {item.id === activeTrackId ? <Play size={21} color={colors.accent} /> : <Download size={21} color={colors.muted} />}
        <View style={styles.labels}><Text style={styles.title} numberOfLines={2}>{item.title}</Text><Text style={styles.artist} numberOfLines={1}>{item.artist}</Text></View>
      </Pressable>} />
  </View>;
}

const styles = shelfStyles(StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingTop: spacing.lg },
  heading: { color: colors.text, fontSize: 28, fontWeight: '700', marginHorizontal: spacing.lg },
  count: { color: colors.muted, fontSize: 16 },
  note: { color: colors.muted, marginHorizontal: spacing.lg, marginTop: 8, marginBottom: 20 },
  search: { color: colors.text, padding: 12, marginHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 180, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  labels: { flex: 1 }, title: { color: colors.text, fontSize: 16 }, artist: { color: colors.muted, fontSize: 14, marginTop: 4 },
  empty: { color: colors.muted, paddingVertical: 36, lineHeight: 22 },
}));
