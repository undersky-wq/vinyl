import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';
import { Heart, ListPlus } from 'lucide-react-native';
import { TrackDownloadButton } from './TrackDownloadButton';
import { buildPlayableReleaseTracks } from '../lib/release-player-tracks';
import { normalizeDurationLabel } from '../lib/time';
import { adaptiveStyles, colors } from '../theme';
import type { PlayerTrack, Release } from '../types';

export function ArchiveTrackList({ release, loading, error, onRetry, lang, activeTrackId, isPlaying, onPlayTrack, onTogglePlayback, playbackQueue, inline = false, compact = false, hideHeading = false, index = 0, favoriteIds, onFavoriteTrack, onPlaylistMenu, showTrackMeta = true, showKey = true }: {
  release: Release; loading: boolean; error: boolean; onRetry: () => void; lang: 'en' | 'ru';
  activeTrackId?: string | null; isPlaying: boolean;
  onPlayTrack: (track: PlayerTrack, queue?: PlayerTrack[]) => void; onTogglePlayback: () => void;
  playbackQueue?: PlayerTrack[];
  inline?: boolean; compact?: boolean; hideHeading?: boolean; index?: number; favoriteIds?: Set<string>;
  onFavoriteTrack?: (id: string) => void; onPlaylistMenu?: (id: string) => void;
  showTrackMeta?: boolean; showKey?: boolean;
}) {
  const queue = buildPlayableReleaseTracks(release);
  const content = <View style={[styles.details, inline && styles.inline, inline && compact && styles.compactContent]}>
    {!compact && !hideHeading && <><Text style={styles.artist}>{release.artist}</Text>
    <View style={styles.meta}><Text style={styles.title}>{release.title}</Text><Text style={styles.year}>{release.year}</Text></View></>}
    {loading && !release.tracks.length ? <Text style={styles.message}>{lang === 'ru' ? 'Загрузка треков...' : 'Loading tracks...'}</Text> : null}
    {error ? <Pressable onPress={onRetry}><Text style={styles.message}>{lang === 'ru' ? 'Повторить загрузку' : 'Retry loading'}</Text></Pressable> : null}
    {release.tracks.map(track => {
      const playable = queue.find(item => item.id === track.id);
      const active = track.id === activeTrackId;
      return <View key={track.id} style={[styles.row, active && styles.active]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${active && isPlaying ? 'Pause' : 'Play'}: ${track.title}`} disabled={!playable} style={[styles.play, !playable && styles.disabled]} onPress={() => {
          if (!playable) return;
          if (active) onTogglePlayback(); else onPlayTrack(playable, playbackQueue || queue);
        }}><Text style={styles.position}>{compact ? index + 1 : track.position || ''}</Text><View style={styles.trackText}>{compact && <Text numberOfLines={1} style={styles.trackArtist}>{track.artists?.join(', ') || release.artist}</Text>}<Text numberOfLines={compact ? 1 : 2} style={styles.track}>{track.title}</Text></View></Pressable>
        {showTrackMeta && !release.isMix && <Text accessibilityLabel="BPM" style={styles.bpm}>{track.bpm == null ? '-' : Math.round(track.bpm)}</Text>}
        {showTrackMeta && showKey && !release.isMix && <Text accessibilityLabel={lang === 'ru' ? 'Тональность' : 'Key'} style={styles.key}>{track.key || '-'}</Text>}
        {onFavoriteTrack && <Pressable accessibilityRole="button" accessibilityLabel={lang === 'ru' ? 'Избранное' : 'Favorite'} accessibilityState={{ selected: favoriteIds?.has(track.id) || false }} style={styles.action} onPress={() => onFavoriteTrack(track.id)}><Heart size={15} color={favoriteIds?.has(track.id) ? '#db3045' : colors.muted} fill={favoriteIds?.has(track.id) ? '#db3045' : 'transparent'} strokeWidth={1.5} /></Pressable>}
        {onPlaylistMenu && <Pressable accessibilityRole="button" accessibilityLabel={lang === 'ru' ? 'Добавить в плейлист' : 'Add to playlist'} style={styles.action} onPress={() => onPlaylistMenu(track.id)}><ListPlus size={15} color={colors.muted} strokeWidth={1.5} /></Pressable>}
        {playable && !inline ? <TrackDownloadButton track={playable} /> : null}
        <Text style={styles.time}>{normalizeDurationLabel(track.durationRaw, track.durationSec, '-')}</Text>
      </View>;
    })}
    {!loading && !error && !release.tracks.length ? <Text style={styles.message}>{lang === 'ru' ? 'Треклист недоступен' : 'Tracklist unavailable'}</Text> : null}
    {!compact && <Text style={styles.genres}>{release.styles.join(' · ')}</Text>}
    </View>;
  return inline ? content : <ScrollView style={styles.panel} nestedScrollEnabled showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>{content}</ScrollView>;
}

const styles = adaptiveStyles(StyleSheet.create({
  panel: { flex: 1 }, content: { paddingBottom: 12 },
  details: { borderLeftWidth: 1, borderLeftColor: colors.text, paddingLeft: 13 },
  inline: { borderLeftWidth: 0, paddingLeft: 0, minWidth: 0 }, compactContent: { flex: 1 },
  artist: { color: colors.text, fontWeight: '600', fontSize: 17, marginBottom: 6 }, meta: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  title: { flex: 1, color: colors.text, fontSize: 13 }, year: { color: colors.text, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 38 }, active: { borderBottomWidth: 1, borderBottomColor: colors.text },
  play: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38 }, disabled: { opacity: .4 },
  position: { color: colors.muted, fontSize: 10, minWidth: 16 }, trackText: { flex: 1, minWidth: 0 }, trackArtist: { color: colors.text, fontSize: 11, fontWeight: '600' }, track: { color: colors.text, fontSize: 11 }, time: { color: colors.muted, fontSize: 10, width: 31, textAlign: 'right' },
  bpm: { color: colors.muted, fontSize: 10, width: 25, textAlign: 'right' }, key: { color: colors.muted, fontSize: 10, width: 25, textAlign: 'right' }, action: { width: 24, minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  message: { color: colors.muted, fontSize: 12, paddingVertical: 12 }, genres: { color: colors.muted, fontSize: 12, marginTop: 14 },
}));
