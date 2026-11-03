import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Download } from 'lucide-react-native';
import { Image } from 'expo-image';
import { FeedbackPressable as Pressable } from '../components/FeedbackPressable';
import { getDownloadedTracks } from '../lib/offline-audio';
import { colors, adaptiveStyles } from '../theme';
import { normalizeDurationLabel } from '../lib/time';
import { MINI_PLAYER_MASK_HEIGHT } from '../lib/mini-player-layout';
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
    <View style={styles.headingRow}><Download size={15} color={colors.text} /><Text style={styles.heading}>{ru ? 'Загрузки' : 'Downloads'}</Text><Text style={styles.count}>{tracks.length}</Text></View>
    <Text style={styles.note}>{ru ? 'Музыка на телефоне. Работает без интернета.' : 'Music on this phone. Available offline.'}</Text>
    <TextInput value={query} onChangeText={setQuery} style={styles.search} placeholder={ru ? 'Поиск в загрузках' : 'Search downloads'} placeholderTextColor={colors.muted} accessibilityLabel={ru ? 'Поиск в загрузках' : 'Search downloads'} />
    <FlatList data={visible} keyExtractor={track => track.id} refreshing={loading} onRefresh={() => void load()}
      contentContainerStyle={[styles.list, { paddingBottom: activeTrackId ? MINI_PLAYER_MASK_HEIGHT + 12 : 12 }]}
      ListEmptyComponent={<Text style={styles.empty}>{error ? (ru ? 'Не удалось прочитать загрузки. Потяните вниз, чтобы повторить.' : 'Unable to read downloads. Pull to retry.') : loading ? '' : search ? (ru ? 'Ничего не найдено.' : 'No matching downloads.') : (ru ? 'Сначала скачайте трек или микс кнопкой загрузки в плеере. Затем его можно слушать здесь, даже в авиарежиме.' : 'Download a track or mix in the player first, then listen here, even in airplane mode.')}</Text>}
      renderItem={({ item, index }) => <Pressable style={[styles.row, item.id === activeTrackId && styles.active]} accessibilityRole="button" accessibilityState={{ selected: item.id === activeTrackId }} accessibilityLabel={`${ru ? 'Слушать' : 'Play'}: ${item.artist} — ${item.title}`} onPress={() => onPlayTrack(item, visible)}>
        {item.coverUrl ? <Image source={{ uri: item.coverUrl }} style={styles.cover} contentFit="cover" cachePolicy="memory-disk" recyclingKey={item.id} /> : <View style={[styles.cover, styles.placeholder]}><Download size={18} color={colors.muted} /></View>}
        <Text style={styles.position}>{index + 1}</Text>
        <View style={styles.labels}><Text style={styles.artist} numberOfLines={1}>{item.artist}</Text><Text style={styles.title} numberOfLines={1}>{item.title}</Text></View>
        <Text style={styles.time}>{normalizeDurationLabel(item.durationRaw, item.durationSec, '—')}</Text>
      </Pressable>} />
  </View>;
}

const styles = adaptiveStyles(StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingTop: 16 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginHorizontal: '3%' },
  heading: { color: colors.text, fontSize: 14, fontWeight: '600', letterSpacing: -.4 },
  count: { color: colors.text, fontSize: 9, fontWeight: '500', alignSelf: 'flex-start' },
  note: { color: colors.muted, fontSize: 12, marginHorizontal: '3%', marginTop: 8, marginBottom: 12 },
  search: { color: colors.text, fontSize: 14, paddingVertical: 5, paddingHorizontal: 0, marginHorizontal: '3%', marginBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  list: { paddingHorizontal: '3%', flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 6 },
  active: { borderBottomWidth: 1, borderBottomColor: colors.text },
  cover: { width: 40, height: 40, backgroundColor: colors.panelSoft },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  position: { color: colors.muted, fontSize: 10, minWidth: 16 },
  labels: { flex: 1, minWidth: 0 }, title: { color: colors.text, fontSize: 11 }, artist: { color: colors.text, fontSize: 11, fontWeight: '600' },
  time: { color: colors.muted, fontSize: 10, width: 31, textAlign: 'right', fontVariant: ['tabular-nums'] },
  empty: { color: colors.muted, fontSize: 12, paddingVertical: 24, lineHeight: 18 },
}));
