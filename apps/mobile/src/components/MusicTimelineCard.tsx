import { useEffect, useRef, useState } from 'react';
import { Alert, Image, LayoutAnimation, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Headphones, Heart, MessageCircle, Pause, Play, Share2 } from 'lucide-react-native';
import { getCoverUrl, getReleaseTimelineComments } from '../lib/api';
import { buildPlayableReleaseTracks } from '../lib/release-player-tracks';
import { copyMusicLink, getMusicEngagement, type MusicEngagement } from '../lib/music-engagement';
import { resampleWaveform } from '../lib/waveform-resample';
import { MusicComments, musicTime } from './MusicComments';
import { usePlaybackPosition } from '../lib/playback-position';
import { adaptiveStyles, colors, getActiveThemeMode } from '../theme';
import { archiveWaveformColor } from '../lib/archive-section-colors';
import type { AuthUser, PlayerTrack, Release, TimelineComment } from '../types';

export function MusicTimelineCard({ release, activeTrackId, isPlaying, favoriteIds, onFavoriteTrack, onPlayTrack, onTogglePlayback, queue, currentUser, onPlayAt, lang }: {
  release: Release; activeTrackId?: string | null; isPlaying: boolean; favoriteIds?: Set<string>; currentUser?: AuthUser | null;
  onFavoriteTrack: (id: string) => void; onPlayTrack: (track: PlayerTrack, queue?: PlayerTrack[]) => void; onTogglePlayback: () => void;
  queue?: PlayerTrack[]; onPlayAt?: (track: PlayerTrack, second: number, queue?: PlayerTrack[]) => void; lang: string;
}) {
  const track = buildPlayableReleaseTracks(release)[0];
  const active = activeTrackId === track?.id;
  const positionMs = usePlaybackPosition(track?.id);
  const [comments, setComments] = useState<TimelineComment[]>([]);
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<MusicEngagement>({ favorites: 0, plays: 0, copies: 0 });
  const [width, setWidth] = useState(1);
  const [preview, setPreview] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seconds = track?.durationSec || (track?.durationRaw?.split(':').reduce((sum, value) => sum * 60 + Number(value), 0) || 0);
  const second = preview ?? (active ? positionMs / 1000 : 0);
  const accent = archiveWaveformColor(release.isOriginal ? 'originals' : 'mixes', colors.accent, getActiveThemeMode() === 'dark');
  const latest = useRef({ width, seconds, active, track, queue, onPlayAt });
  latest.current = { width, seconds, active, track, queue, onPlayAt };
  const progress = useRef(0);
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: event => { progress.current = Math.max(0, Math.min(1, event.nativeEvent.locationX / latest.current.width)); setPreview(progress.current * latest.current.seconds); },
    onPanResponderMove: event => { progress.current = Math.max(0, Math.min(1, event.nativeEvent.locationX / latest.current.width)); setPreview(progress.current * latest.current.seconds); },
    onPanResponderRelease: () => { const value = latest.current; if (value.track) value.onPlayAt?.(value.track, progress.current * value.seconds, value.queue); setPreview(null); },
    onPanResponderTerminate: () => setPreview(null),
  })).current;
  useEffect(() => {
    let live = true;
    void getReleaseTimelineComments(release.id).then(value => { if (live) setComments(value); }).catch(() => undefined);
    void getMusicEngagement(release.id).then(value => { if (live) setStats(value); }).catch(() => undefined);
    return () => { live = false; };
  }, [release.id, currentUser?.id, favoriteIds]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!track) return null;
  const liked = favoriteIds?.has(track.id);
  const source = track.waveformData || [];
  const bars = resampleWaveform(source.length ? source : [.08], Math.max(24, Math.floor(width / 4)));
  async function copy() {
    try { const url = await copyMusicLink(release.id); setNotice(`${lang === 'ru' ? 'Ссылка скопирована' : 'Link copied'}\n${url}`); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setNotice(''), 3500); setStats(await getMusicEngagement(release.id)); } catch { Alert.alert(lang === 'ru' ? 'Не удалось скопировать ссылку' : 'Unable to copy link'); }
  }
  return <View style={styles.card}>
    <View style={styles.header}><Image source={{ uri: getCoverUrl(release) }} style={styles.cover} /><Pressable style={styles.play} accessibilityLabel={active && isPlaying ? 'Pause' : 'Play'} onPress={() => active ? onTogglePlayback() : onPlayTrack(track, queue)}>{active && isPlaying ? <Pause size={27} color={colors.background} fill={colors.background} /> : <Play size={27} color={colors.background} fill={colors.background} />}</Pressable>
      <View style={styles.title}><Text style={styles.artist}>{release.artist}</Text><Text style={styles.name}>{release.title}</Text></View><Text style={styles.meta}>{release.year}</Text>
    </View>
    <View style={styles.wave} onLayout={event => setWidth(event.nativeEvent.layout.width)} {...responder.panHandlers}>{bars.map((height, index) => <View key={index} style={{ width: 2, height: height * 64, borderRadius: 1, backgroundColor: index / bars.length <= second / Math.max(1, seconds) ? accent : colors.muted }} />)}</View>
    <View style={styles.markers}>{comments.map(comment => <Pressable key={comment.id} accessibilityLabel={`${comment.user.displayName}: ${comment.text}`} onPress={() => onPlayAt?.(track, comment.second, queue)} style={[styles.marker, { left: Math.max(0, Math.min(width - 28, comment.second / Math.max(1, seconds) * width - 14)) }]}>{comment.user.avatarStorageUrl ? <Image source={{ uri: comment.user.avatarStorageUrl }} style={styles.avatar} /> : <Text style={styles.time}>{comment.user.displayName.slice(0, 1)}</Text>}</Pressable>)}</View>
    <View style={styles.between}><Text style={styles.time}>{musicTime(second)}</Text><Text style={styles.time}>{track.durationRaw || musicTime(seconds)}</Text></View>
    <View style={styles.footer}><Text style={[styles.meta, styles.genres]}>{release.styles.join(' · ')}</Text><View style={styles.actions}>
      <Pressable style={styles.slot} accessibilityLabel="Comments" onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setOpen(!open); }}><MessageCircle size={19} color={colors.text} /><Text style={styles.count}>{comments.length || ''}</Text></Pressable>
      <Pressable style={styles.slot} accessibilityLabel="Favorite" onPress={() => onFavoriteTrack(track.id)}><Heart size={19} color={liked ? '#db3045' : colors.text} fill={liked ? '#db3045' : 'none'} /><Text style={styles.count}>{stats.favorites || ''}</Text></Pressable>
      <View style={styles.slot} accessibilityLabel="Plays"><Headphones size={19} color={colors.text} /><Text style={styles.count}>{stats.plays || ''}</Text></View>
      <Pressable style={styles.slot} accessibilityLabel="Copy link" onPress={() => void copy()}><Share2 size={19} color={colors.text} /><Text style={styles.count}>{stats.copies || ''}</Text></Pressable>
    </View></View>
    {notice ? <Text selectable style={styles.notice}>{notice}</Text> : null}
    {open ? <MusicComments releaseId={release.id} comments={comments} onChange={setComments} currentUser={currentUser} second={second} ru={lang === 'ru'} onSeek={value => onPlayAt?.(track, value, queue)} /> : null}
  </View>;
}
const styles = adaptiveStyles(StyleSheet.create({
  card: { paddingVertical: 22, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, markers: { height: 0, zIndex: 2 }, marker: { position: 'absolute', top: -48, width: 28, height: 28, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.panelSoft, alignItems: 'center', justifyContent: 'center' }, avatar: { width: 28, height: 28, borderRadius: 14 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cover: { width: 72, height: 72 }, play: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' }, title: { flex: 1, gap: 4 },
  artist: { color: colors.text, fontSize: 15, fontWeight: '600' }, name: { color: colors.text, fontSize: 13 }, meta: { color: colors.muted, fontSize: 12 },
  wave: { marginTop: 28, height: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, between: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }, time: { color: colors.muted, fontSize: 10 },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 20, gap: 8 }, genres: { flex: 1 }, actions: { flexDirection: 'row', gap: 2 }, slot: { width: 34, height: 30, flexDirection: 'row', alignItems: 'center', gap: 2 }, count: { width: 13, fontSize: 9, color: colors.text }, notice: { color: colors.text, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
}));
