import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { Activity, ChevronLeft, Database, LogOut, RefreshCcw, Shield, SlidersHorizontal, UploadCloud, Users } from 'lucide-react-native';
import { AnimatedLogo } from '../components/AnimatedLogo';
import {
  AudioJobStatus,
  getAudioNormalizeBackfillStatus,
  getAudioWaveformBackfillStatus,
  getAuthSettings,
  getCurrentUser,
  getProfileStats,
  getUsers,
  login,
  logout,
  postDiscogsSync,
  register,
  startAudioNormalizeBackfill,
  startAudioWaveformBackfill,
  updateAuthSettings,
} from '../lib/api';
import { colors, radius, spacing } from '../theme';
import { LanguageProps } from '../types';
import { AuthUser, ProfileStats, UserProfile } from '../types';

type ProfileScreenProps = LanguageProps & {
  onAuthChange?: (user: AuthUser | null) => void;
  showTrackMeta?: boolean;
  onShowTrackMetaChange?: (value: boolean) => void;
};

type ProfileView = 'main' | 'users';

function getInitial(name?: string | null) {
  return (name || 'M').trim().slice(0, 1).toUpperCase() || 'M';
}

function formatDate(value?: string | null) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function getPercent(status: AudioJobStatus | null) {
  if (!status || status.total <= 0) {
    return status?.status === 'running' ? 1 : 0;
  }

  return Math.min(100, Math.round((status.processed / status.total) * 100));
}

export function ProfileScreen({ lang, onLanguageChange: setLang, onAuthChange, showTrackMeta = true, onShowTrackMetaChange }: ProfileScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [view, setView] = useState<ProfileView>('main');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [waveformStatus, setWaveformStatus] = useState<AudioJobStatus | null>(null);
  const [normalizeStatus, setNormalizeStatus] = useState<AudioJobStatus | null>(null);
  const [isRegistrationInviteRequired, setIsRegistrationInviteRequired] = useState(false);
  const waveformTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const normalizeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRu = lang === 'ru';
  const isRegister = mode === 'register';
  const isAdmin = user?.role === 'ADMIN';
  const waveformPercent = getPercent(waveformStatus);
  const normalizePercent = getPercent(normalizeStatus);

  const labels = useMemo(
    () => ({
      title: isRu ? 'Профиль' : 'Profile',
      settings: isRu ? 'Настройки' : 'Settings',
      users: isRu ? 'Пользователи' : 'Users',
      usersTitle: isRu ? 'Зарегистрированные' : 'Registered users',
      roleAdmin: isRu ? 'Администратор' : 'Administrator',
      roleUser: isRu ? 'Пользователь' : 'Member',
      releases: isRu ? 'Релизы' : 'Releases',
      tracks: isRu ? 'Треки' : 'Tracks',
      playlists: isRu ? 'Плейлисты' : 'Playlists',
      upload: isRu ? 'Upload на сайте' : 'Upload on web',
      uploadHint: isRu ? 'Загрузка релизов пока удобнее в web-версии.' : 'Release upload is still easier in the web version.',
      sync: isRu ? 'Sync Discogs' : 'Sync Discogs',
      waveform: isRu ? 'Пересчитать waveform' : 'Backfill waveform',
      prepare: isRu ? 'Подготовить MP3' : 'Prepare MP3',
      trackMeta: isRu ? 'BPM / Key в треках' : 'BPM / Key in tracks',
      trackMetaHint: isRu
        ? 'Показывать на страницах Playlists и Likes.'
        : 'Show on Playlists and Likes pages.',
      registrationInvite: isRu ? 'Пароль регистрации' : 'Registration invite',
      registrationInviteHint: isRu
        ? 'Требовать код для обычных новых пользователей.'
        : 'Require a code for regular new users.',
      logout: isRu ? 'Выйти' : 'Log out',
      signIn: isRu ? 'Вход' : 'Sign in',
      register: isRu ? 'Регистрация' : 'Create account',
      displayName: isRu ? 'имя' : 'display name',
      password: isRu ? 'пароль' : 'password',
      submitLogin: isRu ? 'Войти' : 'Sign in',
      submitRegister: isRu ? 'Зарегистрироваться' : 'Register',
      toLogin: isRu ? 'Уже есть аккаунт? Войти' : 'Already have an account? Sign in',
      toRegister: isRu ? 'Нет аккаунта? Зарегистрироваться' : 'No account? Create one',
    }),
    [isRu],
  );

  function applyUser(nextUser: AuthUser | null) {
    setUser(nextUser);
    onAuthChange?.(nextUser);
  }

  async function loadProfile(nextUser?: AuthUser | null) {
    const activeUser = nextUser === undefined ? user : nextUser;

    if (!activeUser) {
      setStats(null);
      setUsers([]);
      return;
    }

    try {
      const [nextStats, nextUsers] = await Promise.all([
        getProfileStats().catch(() => null),
        activeUser.role === 'ADMIN' ? getUsers().catch(() => []) : Promise.resolve([]),
      ]);

      setStats(nextStats);
      setUsers(nextUsers);
      if (activeUser.role === 'ADMIN') {
        const nextSettings = await getAuthSettings().catch(() => null);
        if (nextSettings) {
          setIsRegistrationInviteRequired(nextSettings.registrationInviteRequired);
        }
      }
    } catch {
      setStats(null);
      setUsers([]);
    }
  }

  async function loadUser() {
    setIsLoading(true);
    setMessage('');

    try {
      const nextUser = await getCurrentUser();
      applyUser(nextUser);
      await loadProfile(nextUser);
    } catch {
      applyUser(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit() {
    setIsLoading(true);
    setMessage('');

    try {
      const nextUser = isRegister
        ? await register({
            email: email.trim(),
            password,
            displayName: displayName.trim(),
            inviteCode: inviteCode.trim() || undefined,
          })
        : await login(email.trim(), password);

      applyUser(nextUser);
      await loadProfile(nextUser);
      setPassword('');
      setInviteCode('');
    } catch {
      setMessage(
        isRegister
          ? isRu
            ? 'Не удалось зарегистрироваться. Проверь поля.'
            : 'Could not register. Check the fields.'
          : isRu
            ? 'Не удалось войти. Проверь почту и пароль.'
            : 'Could not sign in. Check email and password.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    setIsLoading(true);
    setMessage('');

    try {
      await logout();
      applyUser(null);
      setPassword('');
      setView('main');
      setStats(null);
      setUsers([]);
    } catch {
      setMessage(isRu ? 'Не удалось выйти.' : 'Could not log out.');
    } finally {
      setIsLoading(false);
    }
  }

  async function runDiscogsSync() {
    setBusyAction('discogs');
    setMessage(isRu ? 'Синхронизация Discogs запущена...' : 'Discogs sync started...');

    try {
      await postDiscogsSync();
      setMessage(isRu ? 'Discogs sync завершён.' : 'Discogs sync completed.');
      await loadProfile(user);
    } catch {
      setMessage(isRu ? 'Discogs sync не удался.' : 'Discogs sync failed.');
    } finally {
      setBusyAction(null);
    }
  }

  async function runAudioJob(
    kind: 'waveform' | 'normalize',
    start: () => Promise<AudioJobStatus>,
    poll: () => Promise<AudioJobStatus>,
  ) {
    const timerRef = kind === 'waveform' ? waveformTimerRef : normalizeTimerRef;
    const setStatus = kind === 'waveform' ? setWaveformStatus : setNormalizeStatus;

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    setBusyAction(kind);

    try {
      const initial = await start();
      setStatus(initial);

      if (initial.status === 'completed') {
        setMessage(kind === 'waveform' ? 'Waveform готов.' : 'MP3 подготовлены.');
        setBusyAction(null);
        return;
      }

      timerRef.current = setInterval(() => {
        poll()
          .then((nextStatus) => {
            setStatus(nextStatus);
            if (nextStatus.status === 'completed' || nextStatus.status === 'failed') {
              if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
              }
              setBusyAction(null);
              setMessage(nextStatus.status === 'completed' ? 'Готово.' : nextStatus.error || 'Ошибка обработки.');
            }
          })
          .catch(() => {
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            setBusyAction(null);
            setMessage('Ошибка обработки.');
          });
      }, 1200);
    } catch {
      setBusyAction(null);
      setMessage(kind === 'waveform' ? 'Waveform не удалось пересчитать.' : 'MP3 не удалось подготовить.');
    }
  }

  async function toggleRegistrationInvite() {
    if (busyAction) {
      return;
    }

    const nextValue = !isRegistrationInviteRequired;
    setIsRegistrationInviteRequired(nextValue);
    setBusyAction('registrationInvite');
    setMessage('');

    try {
      const nextSettings = await updateAuthSettings({
        registrationInviteRequired: nextValue,
      });
      setIsRegistrationInviteRequired(nextSettings.registrationInviteRequired);
      setMessage(
        nextSettings.registrationInviteRequired
          ? isRu
            ? 'Пароль регистрации включён.'
            : 'Registration invite enabled.'
          : isRu
            ? 'Пароль регистрации выключен.'
            : 'Registration invite disabled.',
      );
    } catch {
      setIsRegistrationInviteRequired(!nextValue);
      setMessage(isRu ? 'Не удалось сохранить настройку.' : 'Failed to save setting.');
    } finally {
      setBusyAction(null);
    }
  }

  useEffect(() => {
    void loadUser();

    return () => {
      if (waveformTimerRef.current) {
        clearInterval(waveformTimerRef.current);
      }
      if (normalizeTimerRef.current) {
        clearInterval(normalizeTimerRef.current);
      }
    };
  }, []);

  if (user && view === 'users') {
    return (
      <View style={styles.screen}>
        <View style={styles.headerShell}>
          <View style={styles.headerTop}>
            <Pressable style={styles.backButton} onPress={() => setView('main')}>
              <ChevronLeft size={22} color={colors.text} strokeWidth={2.6} />
            </Pressable>
            <Text style={styles.headerTitle}>{labels.usersTitle}</Text>
            <Text style={styles.usersCount}>{users.length}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.usersContent} showsVerticalScrollIndicator={false}>
          {users.map((item) => (
            <View key={item.id} style={styles.userRow}>
              {item.avatarStorageUrl ? (
                <Image source={{ uri: item.avatarStorageUrl }} style={styles.userAvatar} />
              ) : (
                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarText}>{getInitial(item.displayName)}</Text>
                </View>
              )}

              <View style={styles.userMain}>
                <View style={styles.userNameRow}>
                  <Text numberOfLines={1} style={styles.userName}>{item.displayName}</Text>
                  <Text style={[styles.userRole, item.role === 'ADMIN' && styles.userRoleAdmin]}>{item.role}</Text>
                </View>
                <Text numberOfLines={1} style={styles.userEmail}>{item.email || 'No email'}</Text>
                <Text style={styles.userDate}>Joined {formatDate(item.createdAt)}</Text>
                <View style={styles.userStats}>
                  <Text style={styles.userStat}>{item._count.playlists} playlists</Text>
                  <Text style={styles.userStat}>{item._count.favoriteTracks} likes</Text>
                  <Text style={styles.userStat}>{item._count.audioFiles} MP3</Text>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.headerShell}>
        <View style={styles.headerTop}>
          <AnimatedLogo lang={lang} />
          <View style={styles.language}>
            <Pressable onPress={() => setLang('ru')}>
              <Text style={[styles.languageText, lang === 'ru' && styles.languageActive]}>
                {isRu ? 'РУ' : 'RU'}
              </Text>
            </Pressable>
            <Pressable onPress={() => setLang('en')}>
              <Text style={[styles.languageText, lang === 'en' && styles.languageActive]}>
                {isRu ? 'АНГ' : 'ENG'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {user ? (
          <>
            <View style={styles.heroCard}>
              {user.avatarStorageUrl ? (
                <Image source={{ uri: user.avatarStorageUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{getInitial(user.displayName)}</Text>
                </View>
              )}

              <View style={styles.heroText}>
                <Text style={styles.role}>{isAdmin ? labels.roleAdmin : labels.roleUser}</Text>
                <Text numberOfLines={1} style={styles.name}>{user.displayName}</Text>
                <Text numberOfLines={1} style={styles.email}>{user.email || 'No email'}</Text>
              </View>
            </View>

            {isAdmin ? (
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>{labels.releases}</Text>
                  <Text style={styles.statValue}>{stats?.releasesCount ?? '—'}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>{labels.tracks}</Text>
                  <Text style={styles.statValue}>{stats?.tracksCount ?? '—'}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>{labels.playlists}</Text>
                  <Text style={styles.statValue}>{stats?.playlistsCount ?? '—'}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <SlidersHorizontal size={18} color={colors.accent} strokeWidth={2.5} />
                <Text style={styles.sectionTitle}>{labels.settings}</Text>
              </View>

              {isAdmin ? (
                <>
                  <ActionRow
                    icon={<Users size={18} color={colors.accent} strokeWidth={2.5} />}
                    title={labels.users}
                    subtitle={`${users.length} accounts`}
                    onPress={() => setView('users')}
                  />
                  <ActionRow
                    icon={<UploadCloud size={18} color={colors.muted} strokeWidth={2.5} />}
                    title={labels.upload}
                    subtitle={labels.uploadHint}
                  />
                  <ActionRow
                    icon={<RefreshCcw size={18} color={colors.accent} strokeWidth={2.5} />}
                    title={busyAction === 'discogs' ? 'Syncing...' : labels.sync}
                    subtitle={isRu ? 'Подтянуть новые релизы из Discogs' : 'Import new releases from Discogs'}
                    onPress={runDiscogsSync}
                    disabled={Boolean(busyAction)}
                  />
                  <ActionRow
                    icon={<Shield size={18} color={isRegistrationInviteRequired ? colors.accent : colors.muted} strokeWidth={2.5} />}
                    title={labels.registrationInvite}
                    subtitle={labels.registrationInviteHint}
                    valueText={isRegistrationInviteRequired ? 'ON' : 'OFF'}
                    active={isRegistrationInviteRequired}
                    onPress={() => void toggleRegistrationInvite()}
                    disabled={Boolean(busyAction)}
                  />
                  <ActionRow
                    icon={<Activity size={18} color={colors.accent} strokeWidth={2.5} />}
                    title={busyAction === 'waveform' ? `Waveform ${waveformPercent}%` : labels.waveform}
                    subtitle={isRu ? 'Пересчитать длительность и волну треков' : 'Rebuild duration and waveform data'}
                    onPress={() => void runAudioJob('waveform', startAudioWaveformBackfill, getAudioWaveformBackfillStatus)}
                    disabled={Boolean(busyAction)}
                    progress={waveformPercent}
                  />
                  <ActionRow
                    icon={<Database size={18} color={colors.accent} strokeWidth={2.5} />}
                    title={busyAction === 'normalize' ? `MP3 ${normalizePercent}%` : labels.prepare}
                    subtitle={isRu ? 'Подготовить MP3 для стабильного стриминга' : 'Prepare MP3 for stable streaming'}
                    onPress={() => void runAudioJob('normalize', startAudioNormalizeBackfill, getAudioNormalizeBackfillStatus)}
                    disabled={Boolean(busyAction)}
                    progress={normalizePercent}
                  />
                </>
              ) : (
                <ActionRow
                  icon={<Shield size={18} color={colors.accent} strokeWidth={2.5} />}
                  title={isRu ? 'Аккаунт активен' : 'Account active'}
                  subtitle={isRu ? 'Можно лайкать треки и собирать плейлисты.' : 'You can like tracks and create playlists.'}
                />
              )}

              <ActionRow
                icon={<Activity size={18} color={showTrackMeta ? colors.accent : colors.muted} strokeWidth={2.5} />}
                title={labels.trackMeta}
                subtitle={showTrackMeta ? (isRu ? 'Включено' : 'Enabled') : (isRu ? 'Выключено' : 'Disabled')}
                valueText={showTrackMeta ? 'ON' : 'OFF'}
                active={showTrackMeta}
                onPress={() => onShowTrackMetaChange?.(!showTrackMeta)}
              />

              <ActionRow
                icon={<LogOut size={18} color={colors.muted} strokeWidth={2.5} />}
                title={labels.logout}
                subtitle={user.email || ''}
                onPress={handleLogout}
                disabled={isLoading}
              />
            </View>

            {message ? <Text style={styles.message}>{message}</Text> : null}
          </>
        ) : (
          <View style={styles.card}>
            <Text style={styles.title}>{isRegister ? labels.register : labels.signIn}</Text>
            {isRegister ? (
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder={labels.displayName}
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
            ) : null}
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="email"
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={labels.password}
              placeholderTextColor={colors.muted}
              style={styles.input}
              secureTextEntry
            />
            {isRegister ? (
              <TextInput
                value={inviteCode}
                onChangeText={setInviteCode}
                placeholder="admin invite code (optional)"
                placeholderTextColor={colors.muted}
                style={styles.input}
                autoCapitalize="none"
              />
            ) : null}
            <Pressable style={styles.button} onPress={handleSubmit} disabled={isLoading}>
              <Text style={styles.buttonText}>
                {isLoading ? '...' : isRegister ? labels.submitRegister : labels.submitLogin}
              </Text>
            </Pressable>
            <Pressable
              style={styles.modeButton}
              onPress={() => {
                setMessage('');
                setMode((current) => (current === 'login' ? 'register' : 'login'));
              }}
            >
              <Text style={styles.modeText}>{isRegister ? labels.toLogin : labels.toRegister}</Text>
            </Pressable>
            {message ? <Text style={styles.message}>{message}</Text> : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ActionRow({
  icon,
  title,
  subtitle,
  onPress,
  disabled,
  progress,
  valueText,
  active,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  disabled?: boolean;
  progress?: number;
  valueText?: string;
  active?: boolean;
}) {
  return (
    <Pressable
      style={[styles.actionRow, disabled && styles.disabled]}
      onPress={onPress}
      disabled={!onPress || disabled}
    >
      {typeof progress === 'number' && progress > 0 ? (
        <View style={[styles.actionProgress, { width: `${Math.min(100, progress)}%` }]} />
      ) : null}
      <View style={styles.actionIcon}>{icon}</View>
      <View style={styles.actionText}>
        <Text style={styles.actionTitle}>{title}</Text>
        {subtitle ? <Text numberOfLines={2} style={styles.actionSubtitle}>{subtitle}</Text> : null}
      </View>
      {valueText ? (
        <Text style={[styles.actionValue, active && styles.actionValueActive]}>{valueText}</Text>
      ) : null}
      {onPress ? <Text style={styles.actionChevron}>›</Text> : null}
    </Pressable>
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
    top: -6,
    zIndex: 10,
    paddingHorizontal: 12,
    paddingTop: (StatusBar.currentHeight || 0) + 10,
    paddingBottom: 9,
    borderRadius: 24,
    backgroundColor: 'rgba(24,24,24,0.96)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.55,
    shadowRadius: 30,
  },
  headerTop: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.panelSoft,
  },
  usersCount: {
    width: 42,
    color: colors.accent,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
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
  content: {
    gap: 14,
    paddingHorizontal: spacing.md,
    paddingTop: (StatusBar.currentHeight || 0) + 118,
    paddingBottom: 170,
  },
  usersContent: {
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingTop: (StatusBar.currentHeight || 0) + 118,
    paddingBottom: 170,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: spacing.md,
    borderRadius: 26,
    backgroundColor: colors.panel,
  },
  heroText: {
    flex: 1,
  },
  card: {
    gap: 12,
    padding: spacing.md,
    borderRadius: 22,
    backgroundColor: colors.panel,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  input: {
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.panelSoft,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  button: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.panelSoft,
  },
  buttonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  modeButton: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  modeText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  message: {
    color: colors.accentStrong,
    fontSize: 13,
    fontWeight: '800',
  },
  avatar: {
    width: 82,
    height: 82,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 41,
    backgroundColor: colors.panelSoft,
  },
  avatarText: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  name: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  email: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  role: {
    marginBottom: 4,
    color: colors.accent,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    minHeight: 82,
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 20,
    backgroundColor: colors.panel,
  },
  statLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  statValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  section: {
    gap: 10,
    padding: spacing.md,
    borderRadius: 26,
    backgroundColor: colors.panel,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  actionRow: {
    minHeight: 62,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 20,
    backgroundColor: colors.panelSoft,
  },
  actionProgress: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(181,120,255,0.16)',
  },
  actionIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  actionText: {
    flex: 1,
    gap: 2,
  },
  actionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  actionSubtitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  actionChevron: {
    color: colors.muted,
    fontSize: 24,
    fontWeight: '800',
  },
  actionValue: {
    minWidth: 34,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'right',
  },
  actionValueActive: {
    color: colors.accent,
  },
  disabled: {
    opacity: 0.58,
  },
  userRow: {
    minHeight: 96,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 24,
    backgroundColor: colors.panel,
  },
  userAvatar: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 27,
    backgroundColor: colors.panelSoft,
  },
  userAvatarText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  userMain: {
    flex: 1,
    gap: 4,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  userRole: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    color: colors.muted,
    fontSize: 9,
    fontWeight: '900',
    backgroundColor: colors.panelSoft,
  },
  userRoleAdmin: {
    color: colors.accent,
  },
  userEmail: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  userDate: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  userStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 3,
  },
  userStat: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: 'hidden',
    color: colors.text,
    fontSize: 10,
    fontWeight: '800',
    backgroundColor: colors.panelSoft,
  },
});
