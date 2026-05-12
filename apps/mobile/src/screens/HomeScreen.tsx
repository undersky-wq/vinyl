import { useEffect, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { AnimatedLogo } from '../components/AnimatedLogo';
import { ReleaseTile } from '../components/ReleaseTile';
import { getHomeReleases, getReleaseStyles } from '../lib/api';
import { colors, radius, spacing } from '../theme';
import { Release } from '../types';

type HomeScreenProps = {
  onOpenProfile: () => void;
  onOpenRelease: (release: Release) => void;
  avatarUrl?: string | null;
};

const PAGE_SIZE = 32;

export function HomeScreen({ onOpenProfile, onOpenRelease, avatarUrl }: HomeScreenProps) {
  const [releases, setReleases] = useState<Release[]>([]);
  const [stylesList, setStylesList] = useState<Array<{ name: string; count: number }>>([]);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [hasAudioOnly, setHasAudioOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [isStylesExpanded, setIsStylesExpanded] = useState(false);
  const [lang, setLang] = useState<'ru' | 'en'>('en');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setIsLoading(true);
    setError('');

    try {
      const [nextReleases, nextStyles] = await Promise.all([
        getHomeReleases(PAGE_SIZE, 0, { styles: selectedStyles, hasAudio: hasAudioOnly }),
        getReleaseStyles(),
      ]);
      setReleases(nextReleases);
      setStylesList(nextStyles);
      setHasMore(nextReleases.length === PAGE_SIZE);
    } catch {
      setError('Не удалось загрузить коллекцию.');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadMore() {
    if (isLoading || isLoadingMore || !hasMore) {
      return;
    }

    setIsLoadingMore(true);

    try {
      const nextReleases = await getHomeReleases(PAGE_SIZE, releases.length, {
        styles: selectedStyles,
        hasAudio: hasAudioOnly,
      });
      setReleases((current) => {
        const known = new Set(current.map((release) => release.id));
        const unique = nextReleases.filter((release) => !known.has(release.id));

        return [...current, ...unique];
      });
      setHasMore(nextReleases.length === PAGE_SIZE);
    } catch {
      setError('Не удалось догрузить релизы.');
    } finally {
      setIsLoadingMore(false);
    }
  }

  useEffect(() => {
    void load();
  }, [hasAudioOnly, selectedStyles.join('|')]);

  const visibleStyles = isStylesExpanded ? stylesList : stylesList.slice(0, 4);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredReleases = releases.filter((release) => {
    const matchesStyle =
      selectedStyles.length === 0 || selectedStyles.some((style) => release.styles.includes(style));
    const matchesAudio = !hasAudioOnly || release.tracks.some((track) => track.audioFiles.some((file) => file.storageUrl));
    const matchesSearch =
      !normalizedQuery ||
      release.title.toLocaleLowerCase().includes(normalizedQuery) ||
      release.artist.toLocaleLowerCase().includes(normalizedQuery);

    return matchesStyle && matchesAudio && matchesSearch;
  });

  return (
    <View style={styles.screen}>
      <View style={styles.headerShell}>
        <View style={styles.headerTop}>
          <AnimatedLogo lang={lang} />
          <View style={styles.headerRight}>
            <View style={styles.language}>
              <Pressable onPress={() => setLang('ru')}>
                <Text style={[styles.languageText, lang === 'ru' && styles.languageActive]}>
                  {lang === 'ru' ? 'РУ' : 'RU'}
                </Text>
              </Pressable>
              <Pressable onPress={() => setLang('en')}>
                <Text style={[styles.languageText, lang === 'en' && styles.languageActive]}>
                  {lang === 'ru' ? 'АНГ' : 'ENG'}
                </Text>
              </Pressable>
            </View>
            <Pressable style={styles.avatar} onPress={onOpenProfile}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>M</Text>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.search}>
          <Search size={18} color={colors.muted} strokeWidth={2.2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={lang === 'ru' ? 'Поиск треков...' : 'Search tracks...'}
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>

      <FlatList
        data={filteredReleases}
        keyExtractor={(item) => item.id}
        numColumns={4}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.scrollingHeader}>
            <View style={[styles.chips, isStylesExpanded && styles.chipsExpanded]}>
              <Pressable
                style={[styles.chip, selectedStyles.length === 0 && !hasAudioOnly && styles.chipActive]}
                onPress={() => {
                  setSelectedStyles([]);
                  setHasAudioOnly(false);
                }}
              >
                <Text style={[styles.chipText, selectedStyles.length === 0 && !hasAudioOnly && styles.chipTextActive]}>
                  {lang === 'ru' ? 'Все' : 'All'}
                </Text>
              </Pressable>

              <Pressable
                style={[styles.chip, hasAudioOnly && styles.chipActive]}
                onPress={() => setHasAudioOnly((current) => !current)}
              >
                <Text style={[styles.chipText, hasAudioOnly && styles.chipTextActive]}>
                  {lang === 'ru' ? 'Есть аудио' : 'Has audio'}
                </Text>
              </Pressable>

              {visibleStyles.map((item) => {
                const active = selectedStyles.includes(item.name);

                return (
                  <Pressable
                    key={item.name}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() =>
                      setSelectedStyles((current) =>
                        current.includes(item.name)
                          ? current.filter((style) => style !== item.name)
                          : [...current, item.name],
                      )
                    }
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.name}</Text>
                  </Pressable>
                );
              })}
              {stylesList.length > 4 ? (
                <Pressable style={styles.chip} onPress={() => setIsStylesExpanded((current) => !current)}>
                  <Text style={styles.chipText}>...</Text>
                </Pressable>
              ) : null}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        }
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} tintColor={colors.accent} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.45}
        progressViewOffset={(StatusBar.currentHeight || 0) + 96}
        renderItem={({ item }) => (
          <ReleaseTile
            release={item}
            onPress={onOpenRelease}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerShell: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    top: Math.max((StatusBar.currentHeight || 0) - 3, 0),
    zIndex: 10,
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 9,
    gap: 9,
    borderRadius: 24,
    backgroundColor: 'rgba(24,24,24,0.96)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.55,
    shadowRadius: 30,
  },
  headerTop: {
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  language: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  languageText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
  },
  languageActive: {
    color: colors.text,
  },
  avatar: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.panelSoft,
  },
  avatarText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: radius.pill,
  },
  scrollingHeader: {
    gap: 14,
    paddingBottom: 18,
  },
  search: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
    borderRadius: 22,
    backgroundColor: colors.panelSoft,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    padding: 0,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    overflow: 'hidden',
    maxHeight: 91,
  },
  chipsExpanded: {
    maxHeight: 1000,
  },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
  },
  chipActive: {
    backgroundColor: 'rgba(181,120,255,0.14)',
  },
  chipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.accent,
  },
  error: {
    paddingHorizontal: spacing.md,
    color: colors.accentStrong,
    fontWeight: '700',
  },
  list: {
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingTop: (StatusBar.currentHeight || 0) + 132,
    paddingBottom: 172,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
});
