import { useEffect, useRef, useState } from 'react';
import { Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { Heart, House, Library, ListMusic } from 'lucide-react-native';
import { MiniPlayer } from './src/components/MiniPlayer';
import { FullPlayer } from './src/components/FullPlayer';
import { HomeScreen } from './src/screens/HomeScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { PlaylistsScreen } from './src/screens/PlaylistsScreen';
import { FavoritesScreen } from './src/screens/FavoritesScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ReleaseDetailScreen } from './src/screens/ReleaseDetailScreen';
import { getCurrentUser, getFavorites, toggleFavoriteTrack } from './src/lib/api';
import { resolveOfflineTrack } from './src/lib/offline-audio';
import { colors, radius, spacing } from './src/theme';
import { AuthUser, PlayerTrack, Release, TabKey } from './src/types';

const tabs: Array<{ key: TabKey; label: string; Icon: typeof House }> = [
  { key: 'home', label: 'Home', Icon: House },
  { key: 'library', label: 'Library', Icon: Library },
  { key: 'playlists', label: 'Playlists', Icon: ListMusic },
  { key: 'favorites', label: 'Likes', Icon: Heart },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [currentTrack, setCurrentTrack] = useState<PlayerTrack | null>(null);
  const [queue, setQueue] = useState<PlayerTrack[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  const [isShuffleEnabled, setIsShuffleEnabled] = useState(false);
  const [isRepeatEnabled, setIsRepeatEnabled] = useState(false);
  const [activeRelease, setActiveRelease] = useState<Release | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  async function playTrack(track: PlayerTrack, nextQueue?: PlayerTrack[]) {
    const preparedTrack = await resolveOfflineTrack(track);
    setCurrentTrack(preparedTrack);
    setQueue(nextQueue?.length ? nextQueue : [track]);
    setIsPlaying(true);
  }

  async function setTrackForPlayback(track: PlayerTrack) {
    setCurrentTrack(await resolveOfflineTrack(track));
    setIsPlaying(true);
  }

  function playByOffset(offset: 1 | -1) {
    if (!currentTrack || queue.length === 0) {
      return;
    }

    if (isShuffleEnabled && offset === 1) {
      const candidates = queue.filter((track) => track.id !== currentTrack.id);
      const nextTrack = candidates[Math.floor(Math.random() * candidates.length)] || currentTrack;
      void setTrackForPlayback(nextTrack);
      return;
    }

    const index = Math.max(0, queue.findIndex((track) => track.id === currentTrack.id));
    const nextIndex = index + offset;

    if (nextIndex < 0 || nextIndex >= queue.length) {
      if (isRepeatEnabled) {
        void setTrackForPlayback(queue[offset === 1 ? 0 : queue.length - 1]);
      }
      return;
    }

    void setTrackForPlayback(queue[nextIndex]);
  }

  async function seekToRatio(ratio: number) {
    const sound = soundRef.current;
    if (!sound || durationMs <= 0) {
      return;
    }

    await sound.setPositionAsync(Math.max(0, Math.min(durationMs, Math.round(durationMs * ratio))));
  }

  useEffect(() => {
    void Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
    });
  }, []);

  useEffect(() => {
    async function loadSession() {
      try {
        const [nextFavorites, nextUser] = await Promise.all([getFavorites(), getCurrentUser()]);
        setFavoriteIds(new Set(nextFavorites));
        setCurrentUser(nextUser);
      } catch {
        setFavoriteIds(new Set());
        setCurrentUser(null);
      }
    }

    void loadSession();
  }, []);

  async function handleFavorite(trackId: string) {
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });

    try {
      const result = await toggleFavoriteTrack(trackId);
      setFavoriteIds((current) => {
        const next = new Set(current);
        if (result.active) {
          next.add(trackId);
        } else {
          next.delete(trackId);
        }
        return next;
      });
    } catch {
      try {
        setFavoriteIds(new Set(await getFavorites()));
      } catch {
        // Keep the optimistic UI if the refresh also fails.
      }
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadTrack() {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      setPositionMs(0);
      setDurationMs(currentTrack?.durationSec ? currentTrack.durationSec * 1000 : 0);

      if (!currentTrack?.audioUrl) {
        return;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: currentTrack.localAudioUrl || currentTrack.audioUrl },
        { shouldPlay: true, progressUpdateIntervalMillis: 350 },
        (status: AVPlaybackStatus) => {
          if (!status.isLoaded) {
            return;
          }

          setIsPlaying(status.isPlaying);
          setPositionMs(status.positionMillis);
          setDurationMs(status.durationMillis || (currentTrack.durationSec ? currentTrack.durationSec * 1000 : 0));
        },
      );

      if (cancelled) {
        await sound.unloadAsync();
        return;
      }

      soundRef.current = sound;
    }

    void loadTrack();

    return () => {
      cancelled = true;
    };
  }, [currentTrack]);

  useEffect(() => {
    async function syncPlayback() {
      const sound = soundRef.current;
      if (!sound) {
        return;
      }

      if (isPlaying) {
        await sound.playAsync();
      } else {
        await sound.pauseAsync();
      }
    }

    void syncPlayback();
  }, [isPlaying]);

  useEffect(() => {
    if (positionMs > 0 && durationMs > 0 && positionMs >= durationMs - 450) {
      if (isRepeatEnabled) {
        void seekToRatio(0);
        setIsPlaying(true);
      } else {
        playByOffset(1);
      }
    }
  }, [positionMs, durationMs, isRepeatEnabled]);

  useEffect(() => {
    return () => {
      void soundRef.current?.unloadAsync();
    };
  }, []);

  function renderScreen() {
    if (activeRelease) {
      return (
        <ReleaseDetailScreen
          initialRelease={activeRelease}
          activeTrackId={currentTrack?.id || null}
          isPlaying={isPlaying}
          onBack={() => setActiveRelease(null)}
          onPlayTrack={playTrack}
          onTogglePlayback={() => setIsPlaying((current) => !current)}
        />
      );
    }

    if (activeTab === 'home') {
      return (
        <HomeScreen
          avatarUrl={currentUser?.avatarStorageUrl}
          onOpenProfile={() => setActiveTab('profile')}
          onOpenRelease={setActiveRelease}
        />
      );
    }

    if (activeTab === 'library') {
      return (
        <LibraryScreen
          activeTrackId={currentTrack?.id || null}
          avatarUrl={currentUser?.avatarStorageUrl}
          onPlayTrack={playTrack}
          onOpenProfile={() => setActiveTab('profile')}
        />
      );
    }

    if (activeTab === 'playlists') {
      return (
        <PlaylistsScreen
          avatarUrl={currentUser?.avatarStorageUrl}
          onPlayTrack={playTrack}
          onOpenProfile={() => setActiveTab('profile')}
        />
      );
    }

    if (activeTab === 'favorites') {
      return (
        <FavoritesScreen
          avatarUrl={currentUser?.avatarStorageUrl}
          onPlayTrack={playTrack}
          onOpenProfile={() => setActiveTab('profile')}
        />
      );
    }

    return <ProfileScreen />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.root}>
        {renderScreen()}

        <MiniPlayer
          track={currentTrack}
          isPlaying={isPlaying}
          positionMs={positionMs}
          durationMs={durationMs}
          isFavorite={currentTrack ? favoriteIds.has(currentTrack.id) : false}
          onFavorite={() => {
            if (currentTrack) {
              void handleFavorite(currentTrack.id);
            }
          }}
          onToggle={() => setIsPlaying((current) => !current)}
          onOpen={() => setIsFullPlayerOpen(true)}
          onSeek={seekToRatio}
        />

        <FullPlayer
          track={currentTrack}
          visible={isFullPlayerOpen}
          isPlaying={isPlaying}
          positionMs={positionMs}
          durationMs={durationMs}
          isFavorite={currentTrack ? favoriteIds.has(currentTrack.id) : false}
          onClose={() => setIsFullPlayerOpen(false)}
          onToggle={() => setIsPlaying((current) => !current)}
          onFavorite={() => {
            if (currentTrack) {
              void handleFavorite(currentTrack.id);
            }
          }}
          queue={queue}
          isShuffleEnabled={isShuffleEnabled}
          isRepeatEnabled={isRepeatEnabled}
          onPrevious={() => playByOffset(-1)}
          onNext={() => playByOffset(1)}
          onSeek={seekToRatio}
          onSelectQueueTrack={(track) => playTrack(track, queue)}
          onToggleShuffle={() => setIsShuffleEnabled((current) => !current)}
          onToggleRepeat={() => setIsRepeatEnabled((current) => !current)}
        />

        <View style={styles.tabbar}>
          {tabs.map((tab) => {
            const active = tab.key === activeTab;
            const Icon = tab.Icon;

            return (
              <Pressable
                key={tab.key}
                style={[styles.tab, active && styles.tabActiveBackground]}
                onPress={() => {
                  setActiveRelease(null);
                  setActiveTab(tab.key);
                }}
                accessibilityRole="button"
              >
                <Icon
                  size={23}
                  strokeWidth={2.2}
                  color={active ? colors.accent : colors.muted}
                />
                <Text style={[styles.tabLabel, active && styles.tabActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabbar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.sm,
    zIndex: 30,
    height: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 9,
    borderRadius: 20,
    backgroundColor: colors.panel,
  },
  tab: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: 16,
  },
  tabLabel: {
    display: 'none',
  },
  tabActiveBackground: {
    backgroundColor: 'rgba(181, 120, 255, 0.13)',
  },
  tabActive: {
    color: colors.accent,
  },
});
