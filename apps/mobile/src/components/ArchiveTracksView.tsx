import { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { ArchiveTrackList } from './ArchiveTrackList';
import { getCoverUrl, getRelease } from '../lib/api';
import { archiveItemKey } from '../lib/playlist-archive';
import { adaptiveStyles, colors } from '../theme';
import type { LanguageProps, PlayerTrack, Release } from '../types';

type Props = LanguageProps & {
  releases: Release[]; compact: boolean; initialIndex: number;
  activeTrackId?: string | null; isPlaying: boolean; queue?: PlayerTrack[];
  favoriteIds?: Set<string>; showTrackMeta: boolean; showKey: boolean;
  onPlayTrack: (track: PlayerTrack, queue?: PlayerTrack[]) => void; onTogglePlayback: () => void;
  onFavoriteTrack: (id: string) => void; onPlaylistMenu: (id: string) => void;
  onLoadMore: () => void; onAnchor: (index: number) => void;
};

function TrackGroup({ release, index, ...props }: Omit<Props, 'releases' | 'initialIndex' | 'onLoadMore' | 'onAnchor'> & { release: Release; index: number }) {
  const [detail, setDetail] = useState(release);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setDetail(release); setError(false);
    if (props.compact || release.isMix) { setLoading(false); return; }
    setLoading(true);
    void getRelease(release.id).then(value => { if (!cancelled) setDetail(value); }).catch(() => { if (!cancelled) setError(true); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [release, props.compact, retry]);
  return <View style={props.compact ? styles.compact : styles.group}>
    {props.compact ? <Image source={{ uri: getCoverUrl(detail) }} style={styles.smallCover} contentFit="cover" cachePolicy="memory-disk" recyclingKey={archiveItemKey(release, true)} /> : <View style={styles.heading}>
      <Image source={{ uri: getCoverUrl(detail) }} style={styles.cover} contentFit="cover" cachePolicy="memory-disk" recyclingKey={release.id} />
      <View style={styles.headingText}><Text style={styles.artist}>{detail.artist}</Text><Text style={styles.title}>{detail.title}</Text><Text style={styles.year}>{detail.year}</Text></View>
    </View>}
    <ArchiveTrackList {...props} release={detail} inline hideHeading index={index} loading={loading} error={error} onRetry={() => setRetry(value => value + 1)} playbackQueue={props.queue} />
  </View>;
}

export function ArchiveTracksView({ releases, initialIndex, onLoadMore, onAnchor, ...props }: Props) {
  const list = useRef<FlatList<Release>>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10 }).current;
  const anchor = useRef(Math.max(0, Math.min(releases.length - 1, Math.round(initialIndex))));
  const onVisible = useRef(({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
    const index = viewableItems.find(item => item.index !== null)?.index;
    if (index != null) anchor.current = index;
  }).current;
  return <FlatList ref={list} style={styles.list} contentContainerStyle={styles.content} data={releases}
    keyExtractor={release => archiveItemKey(release, props.compact)} renderItem={({ item, index }) => <TrackGroup {...props} release={item} index={index} />}
    initialNumToRender={4} maxToRenderPerBatch={4} windowSize={5} initialScrollIndex={releases.length ? anchor.current : undefined}
    onScrollToIndexFailed={({ index, averageItemLength }) => list.current?.scrollToOffset({ offset: index * averageItemLength, animated: false })}
    onViewableItemsChanged={onVisible} viewabilityConfig={viewabilityConfig}
    onMomentumScrollEnd={() => onAnchor(anchor.current)} onScrollEndDrag={() => onAnchor(anchor.current)}
    onEndReached={onLoadMore} onEndReachedThreshold={.4} />;
}

const styles = adaptiveStyles(StyleSheet.create({
  list: { ...StyleSheet.absoluteFillObject, top: 126, bottom: 78 }, content: { paddingHorizontal: '3%', paddingBottom: 20 },
  group: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  compact: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  smallCover: { width: 40, height: 40, backgroundColor: colors.panelSoft }, cover: { width: 72, height: 72, backgroundColor: colors.panelSoft },
  heading: { flexDirection: 'row', gap: 12, marginBottom: 8 }, headingText: { flex: 1, justifyContent: 'center', gap: 4 },
  artist: { color: colors.text, fontSize: 13, fontWeight: '600' }, title: { color: colors.text, fontSize: 12 }, year: { color: colors.muted, fontSize: 10 },
}));
