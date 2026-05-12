import { useEffect, useState } from 'react';
import { Image, Pressable, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { AnimatedLogo } from '../components/AnimatedLogo';
import { getCurrentUser, login, logout, register } from '../lib/api';
import { colors, radius, spacing } from '../theme';
import { AuthUser } from '../types';

type ProfileScreenProps = {
  onAuthChange?: (user: AuthUser | null) => void;
};

export function ProfileScreen({ onAuthChange }: ProfileScreenProps) {
  const [lang, setLang] = useState<'ru' | 'en'>('en');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const isRu = lang === 'ru';
  const isRegister = mode === 'register';

  function applyUser(nextUser: AuthUser | null) {
    setUser(nextUser);
    onAuthChange?.(nextUser);
  }

  async function loadUser() {
    setIsLoading(true);
    setMessage('');

    try {
      applyUser(await getCurrentUser());
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
            inviteCode: inviteCode.trim(),
          })
        : await login(email.trim(), password);

      applyUser(nextUser);
      setPassword('');
      setInviteCode('');
    } catch {
      setMessage(
        isRegister
          ? isRu
            ? 'Не удалось зарегистрироваться. Проверь invite code и поля.'
            : 'Could not register. Check invite code and fields.'
          : isRu
            ? 'Не удалось войти. Проверь почту и пароль.'
            : 'Could not sign in.',
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
    } catch {
      setMessage(isRu ? 'Не удалось выйти.' : 'Could not log out.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadUser();
  }, []);

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

      <View style={styles.content}>
        {user ? (
          <View style={styles.card}>
            {user.avatarStorageUrl ? (
              <Image source={{ uri: user.avatarStorageUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{user.displayName?.[0]?.toUpperCase() || 'M'}</Text>
              </View>
            )}
            <Text style={styles.name}>{user.displayName}</Text>
            <Text style={styles.email}>{user.email}</Text>
            <Text style={styles.role}>{user.role}</Text>
            <Pressable style={styles.button} onPress={handleLogout} disabled={isLoading}>
              <Text style={styles.buttonText}>{isRu ? 'Выйти' : 'Log out'}</Text>
            </Pressable>
            {message ? <Text style={styles.message}>{message}</Text> : null}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.title}>
              {isRegister ? (isRu ? 'Регистрация' : 'Create account') : isRu ? 'Вход' : 'Sign in'}
            </Text>
            {isRegister ? (
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder={isRu ? 'имя' : 'display name'}
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
              placeholder={isRu ? 'пароль' : 'password'}
              placeholderTextColor={colors.muted}
              style={styles.input}
              secureTextEntry
            />
            {isRegister ? (
              <TextInput
                value={inviteCode}
                onChangeText={setInviteCode}
                placeholder="invite code"
                placeholderTextColor={colors.muted}
                style={styles.input}
                autoCapitalize="none"
              />
            ) : null}
            <Pressable style={styles.button} onPress={handleSubmit} disabled={isLoading}>
              <Text style={styles.buttonText}>
                {isLoading
                  ? '...'
                  : isRegister
                    ? isRu
                      ? 'Зарегистрироваться'
                      : 'Register'
                    : isRu
                      ? 'Войти'
                      : 'Sign in'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.modeButton}
              onPress={() => {
                setMessage('');
                setMode((current) => (current === 'login' ? 'register' : 'login'));
              }}
            >
              <Text style={styles.modeText}>
                {isRegister
                  ? isRu
                    ? 'Уже есть аккаунт? Войти'
                    : 'Already have an account? Sign in'
                  : isRu
                    ? 'Нет аккаунта? Зарегистрироваться'
                    : 'No account? Create one'}
              </Text>
            </Pressable>
            {message ? <Text style={styles.message}>{message}</Text> : null}
          </View>
        )}
      </View>
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
    borderRadius: 24,
    backgroundColor: 'rgba(24,24,24,0.96)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.55,
    shadowRadius: 30,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: (StatusBar.currentHeight || 0) + 92,
    paddingBottom: 160,
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
    fontWeight: '700',
  },
  avatar: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    borderRadius: 48,
    backgroundColor: colors.panelSoft,
  },
  avatarText: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
  },
  name: {
    textAlign: 'center',
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  email: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  role: {
    alignSelf: 'center',
    color: colors.accent,
    fontSize: 12,
    fontWeight: '900',
  },
});
