import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Activity, ChevronLeft, Database, LogOut, RefreshCcw, Shield, SlidersHorizontal, UploadCloud, Users } from 'lucide-react-native';
import { AdminSitePanel } from '../components/AdminSitePanel';
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
import { colors, adaptiveStyles } from '../theme';
import { LanguageProps } from '../types';
import { AuthUser, ProfileStats, UserProfile } from '../types';

type ProfileScreenProps = LanguageProps & {
  onOpenCollection: () => void;
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

export function ProfileScreen({ lang, onLanguageChange: setLang, onOpenCollection, onAuthChange, showTrackMeta = true, onShowTrackMetaChange }: ProfileScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [view, setView] = useState<ProfileView>('main');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
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
        : await login(email.trim(), password, twoFactorCode.trim() || undefined);

      applyUser(nextUser);
      await loadProfile(nextUser);
      setPassword('');
      setTwoFactorCode('');
      setNeedsTwoFactor(false);
      setInviteCode('');
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'TWO_FACTOR_REQUIRED') {
        setNeedsTwoFactor(true);
        setMessage(isRu ? 'Введи код аутентификатора или одноразовый резервный код.' : 'Enter an authenticator or recovery code.');
        return;
      }
      if (code === 'TWO_FACTOR_INVALID' || code === 'TWO_FACTOR_LOCKED') {
        setMessage(code === 'TWO_FACTOR_LOCKED' ? isRu ? 'Слишком много попыток. Подожди 15 минут.' : 'Too many attempts. Wait 15 minutes.' : isRu ? 'Неверный или уже использованный код.' : 'Invalid or already used code.');
        return;
      }
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

  if (isAdmin) {
    return <AdminSitePanel lang={lang} onLanguageChange={setLang} onClose={onOpenCollection} onAuthChange={applyUser} showTrackMeta={showTrackMeta} onShowTrackMetaChange={onShowTrackMetaChange} />;
  }

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
          <Text style={styles.brand}>{isRu ? 'Коллекция винила' : 'Vinyl collection'}</Text>
          <View style={styles.language}>
            <Pressable onPress={() => setLang(isRu ? 'en' : 'ru')} hitSlop={10} accessibilityRole="button" accessibilityLabel={isRu ? 'Switch to English' : 'Переключить на русский'}>
              <Text style={styles.languageText}>{isRu ? 'RU' : 'ENG'}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <Text style={[styles.headerHint, { marginHorizontal: '6%' }]}>{isRu ? 'Профиль : настройки' : 'Profile : settings'}</Text>
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
                <SlidersHorizontal size={18} color={colors.text} strokeWidth={2.5} />
                <Text style={styles.sectionTitle}>{labels.settings}</Text>
              </View>

              {isAdmin ? (
                <>
                  <ActionRow
                    icon={<Users size={18} color={colors.text} strokeWidth={2.5} />}
                    title={labels.users}
                    subtitle={`${users.length} ${isRu ? 'аккаунтов' : 'accounts'}`}
                    onPress={() => setView('users')}
                  />
                  <ActionRow
                    icon={<UploadCloud size={18} color={colors.muted} strokeWidth={2.5} />}
                    title={labels.upload}
                    subtitle={labels.uploadHint}
                  />
                  <ActionRow
                    icon={<RefreshCcw size={18} color={colors.text} strokeWidth={2.5} />}
                    title={busyAction === 'discogs' ? 'Syncing...' : labels.sync}
                    subtitle={isRu ? 'Подтянуть новые релизы из Discogs' : 'Import new releases from Discogs'}
                    onPress={runDiscogsSync}
                    disabled={Boolean(busyAction)}
                  />
                  <ActionRow
                    icon={<Shield size={18} color={isRegistrationInviteRequired ? colors.text : colors.muted} strokeWidth={2.5} />}
                    title={labels.registrationInvite}
                    subtitle={labels.registrationInviteHint}
                    valueText={isRegistrationInviteRequired ? 'ON' : 'OFF'}
                    active={isRegistrationInviteRequired}
                    onPress={() => void toggleRegistrationInvite()}
                    disabled={Boolean(busyAction)}
                  />
                  <ActionRow
                    icon={<Activity size={18} color={colors.text} strokeWidth={2.5} />}
                    title={busyAction === 'waveform' ? `Waveform ${waveformPercent}%` : labels.waveform}
                    subtitle={isRu ? 'Пересчитать длительность и волну треков' : 'Rebuild duration and waveform data'}
                    onPress={() => void runAudioJob('waveform', startAudioWaveformBackfill, getAudioWaveformBackfillStatus)}
                    disabled={Boolean(busyAction)}
                    progress={waveformPercent}
                  />
                  <ActionRow
                    icon={<Database size={18} color={colors.text} strokeWidth={2.5} />}
                    title={busyAction === 'normalize' ? `MP3 ${normalizePercent}%` : labels.prepare}
                    subtitle={isRu ? 'Подготовить MP3 для стабильного стриминга' : 'Prepare MP3 for stable streaming'}
                    onPress={() => void runAudioJob('normalize', startAudioNormalizeBackfill, getAudioNormalizeBackfillStatus)}
                    disabled={Boolean(busyAction)}
                    progress={normalizePercent}
                  />
                </>
              ) : (
                <ActionRow
                  icon={<Shield size={18} color={colors.text} strokeWidth={2.5} />}
                  title={isRu ? 'Аккаунт активен' : 'Account active'}
                  subtitle={isRu ? 'Можно лайкать треки и собирать плейлисты.' : 'You can like tracks and create playlists.'}
                />
              )}

              <ActionRow
                icon={<Activity size={18} color={showTrackMeta ? colors.text : colors.muted} strokeWidth={2.5} />}
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
            {!isRegister && needsTwoFactor ? <TextInput
              value={twoFactorCode} onChangeText={setTwoFactorCode}
              placeholder={isRu ? 'Код аутентификатора или резервный код' : 'Authenticator or recovery code'}
              placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="characters"
              autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={64}
            /> : null}
            <Pressable style={styles.button} onPress={handleSubmit} disabled={isLoading}>
              <Text style={styles.buttonText}>
                {isLoading ? '...' : isRegister ? labels.submitRegister : labels.submitLogin}
              </Text>
            </Pressable>
            <Pressable
              style={styles.modeButton}
              onPress={() => {
                setMessage('');
                setNeedsTwoFactor(false);
                setTwoFactorCode('');
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

const styles = adaptiveStyles(StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  headerShell: { paddingHorizontal: '6%', paddingTop: 18, paddingBottom: 0, backgroundColor: colors.background },
  headerTop: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brand: { color: colors.text, fontSize: 14, fontWeight: '600', letterSpacing: -.4 },
  headerHint: { color: colors.muted, fontSize: 14, marginTop: 14 },
  headerTitle: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  backButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  usersCount: { color: colors.text, fontSize: 24, fontWeight: '400' },
  language: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  languageText: { color: colors.muted, fontSize: 11, fontWeight: '400' },
  languageActive: { color: colors.text },
  content: { gap: 30, paddingHorizontal: '6%', paddingTop: 30, paddingBottom: 100 },
  usersContent: { paddingHorizontal: '6%', paddingTop: 24, paddingBottom: 100 },
  heroCard: { alignItems: 'flex-start', gap: 14 },
  heroText: { width: '100%' },
  card: { gap: 16 },
  title: { color: colors.text, fontSize: 24, fontWeight: '600' },
  input: { minHeight: 46, paddingHorizontal: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, color: colors.text, fontSize: 14 },
  button: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.text },
  buttonText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  modeButton: { alignItems: 'center', paddingVertical: 8 },
  modeText: { color: colors.muted, fontSize: 13, fontWeight: '400' },
  message: { color: colors.text, fontSize: 13, lineHeight: 18 },
  avatar: { width: 180, height: 180, alignItems: 'center', justifyContent: 'center', borderRadius: 90, backgroundColor: colors.panelSoft },
  avatarText: { color: colors.text, fontSize: 48, fontWeight: '400' },
  name: { color: colors.text, fontSize: 28, fontWeight: '600', letterSpacing: -.7 },
  email: { marginTop: 4, color: colors.muted, fontSize: 14 },
  role: { marginBottom: 6, color: colors.muted, fontSize: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  statCard: { width: '44%', gap: 6 },
  statLabel: { color: colors.muted, fontSize: 12 },
  statValue: { color: colors.text, fontSize: 32, fontWeight: '400' },
  section: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.text },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14 },
  sectionTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  actionRow: { minHeight: 46, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  actionProgress: { position: 'absolute', bottom: 0, left: 0, height: 1, backgroundColor: colors.text },
  actionIcon: { width: 22, height: 24, alignItems: 'center', justifyContent: 'center' },
  actionText: { flex: 1, minWidth: 0, gap: 4 },
  actionTitle: { color: colors.text, fontSize: 14, fontWeight: '400' },
  actionSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  actionChevron: { color: colors.muted, fontSize: 20, fontWeight: '400' },
  actionValue: { minWidth: 34, color: colors.muted, fontSize: 12, fontWeight: '600', textAlign: 'right' },
  actionValueActive: { color: colors.text },
  disabled: { opacity: .45 },
  userRow: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  userAvatar: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.panelSoft },
  userAvatarText: { color: colors.text, fontSize: 16, fontWeight: '400' },
  userMain: { flex: 1, minWidth: 0, gap: 4 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userName: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  userRole: { color: colors.muted, fontSize: 10 },
  userRoleAdmin: { color: colors.text },
  userEmail: { color: colors.muted, fontSize: 12 },
  userDate: { color: colors.muted, fontSize: 12 },
  userStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 3 },
  userStat: { color: colors.muted, fontSize: 11 },
}));
