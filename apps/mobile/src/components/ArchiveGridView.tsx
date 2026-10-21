import { memo, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { ReleaseCover } from './ReleaseCover';
import { archiveGridMetrics, clampPosition } from '../lib/archive-geometry';
import { archiveItemKey } from '../lib/playlist-archive';
import type { Release } from '../types';

type Props = {
  releases: Release[]; width: number; initialPosition: number; trackCollection: boolean; isAdmin: boolean;
  onSelect: (index: number, position: number) => void; onAnchor: (position: number) => void; onLoadMore: () => void;
};

const GridTile = memo(function GridTile({ release, index, size, isAdmin, onSelect }: {
  release: Release; index: number; size: number; isAdmin: boolean; onSelect: (index: number, screenY: number) => void;
}) {
  const tile = useRef<View>(null);
  return <Pressable ref={tile} accessibilityRole="button" accessibilityLabel={`${release.artist} : ${release.title}`} onPress={() => tile.current?.measureInWindow((_x, y) => onSelect(index, y))} style={{ width: size, height: size }}>
    <ReleaseCover release={release} isAdmin={isAdmin} style={styles.cover} />
  </Pressable>;
});

export function ArchiveGridView({ releases, width, initialPosition, trackCollection, isAdmin, onSelect, onAnchor, onLoadMore }: Props) {
  const list = useRef<FlatList<Release>>(null);
  const viewport = useRef<View>(null);
  const metrics = archiveGridMetrics(width);
  const position = useRef(initialPosition);
  const restored = useRef(false);
  function remember(event: NativeSyntheticEvent<NativeScrollEvent>) {
    position.current = clampPosition(Math.max(0, event.nativeEvent.contentOffset.y) / metrics.step * metrics.columns, releases.length);
  }
  function select(index: number, screenY: number) {
    // Measure the tapped row so a fast flick cannot leave its opening origin one scroll event behind.
    viewport.current?.measureInWindow((_x, y) => {
      const offset = 12 + Math.floor(index / metrics.columns) * metrics.step - (screenY - y);
      position.current = clampPosition(offset / metrics.step * metrics.columns, releases.length);
      onSelect(index, position.current);
    });
  }
  return <View ref={viewport} style={styles.list}><FlatList ref={list} style={styles.scroller} contentContainerStyle={{ paddingHorizontal: metrics.side, paddingTop: 12, paddingBottom: 20 }}
    data={releases} numColumns={4} columnWrapperStyle={styles.row} keyExtractor={release => archiveItemKey(release, trackCollection)}
    renderItem={({ item, index }) => <GridTile release={item} index={index} size={metrics.size} isAdmin={isAdmin} onSelect={select} />}
    getItemLayout={(_data, row) => ({ index: row, length: metrics.step, offset: row * metrics.step })}
    initialScrollIndex={releases.length ? Math.floor(clampPosition(initialPosition, releases.length) / metrics.columns) : undefined}
    onContentSizeChange={() => {
      if (restored.current || !releases.length) return;
      restored.current = true;
      list.current?.scrollToOffset({ offset: initialPosition / metrics.columns * metrics.step, animated: false });
    }}
    initialNumToRender={24} maxToRenderPerBatch={12} windowSize={5}
    scrollEventThrottle={64} onScroll={remember}
    onScrollEndDrag={event => { remember(event); onAnchor(position.current); }}
    onMomentumScrollEnd={event => { remember(event); onAnchor(position.current); }}
    onEndReached={onLoadMore} onEndReachedThreshold={.5} /></View>;
}

const styles = StyleSheet.create({
  list: { ...StyleSheet.absoluteFillObject, top: 126, bottom: 78 },
  scroller: { flex: 1 },
  row: { gap: 10, paddingBottom: 10 }, cover: { width: '100%', height: '100%', borderRadius: 0 },
});
