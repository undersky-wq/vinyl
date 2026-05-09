import { useEffect, useState } from 'react';
import { Image, Pressable, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { AnimatedLogo } from '../components/AnimatedLogo';
import { getCurrentUser, login, logout } from '../lib/api';
import { colors, radius, spacing } from '../theme';
import { AuthUser } from '../types';

export function ProfileScreen() {
  const [lang, setLang] = useState<'ru' | 'en'>('en');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function loadUser() {
    setIsLoading(true);
    setMessage('');

    try {
      setUser(await getCurrentUser());
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogin() {
    setIsLoading(true);
    setMessage('');

    try {
      setUser(await login(email.trim(), password));
      setPassword('');
    } catch {
      setMessage(lang === 'ru' ? 'Не удалось войти. Проверь почту и пароль.' : 'Could not sign in.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    setIsLoading(true);
    setMessage('');

    try {
      await logout();
      setUser(null);
    } catch {
      setMessage(lang === 'ru' ? 'Не удалось выйти.' : 'Could not log out.');
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
                {lang === 'ru' ? 'РУ' : 'RU'}
              </Text>
            </Pressable>
            <Pressable onPress={() => setLang('en')}>
              <Text style={[styles.languageText, lang === 'en' && styles.languageActive]}>
                {lang === 'ru' ? 'АНГ' : 'ENG'}
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
              <Text style={styles.buttonText}>{lang === 'ru' ? 'Выйти' : 'Log out'}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.title}>{lang === 'ru' ? 'Вход' : 'Sign in'}</Text>
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
              placeholder={lang === 'ru' ? 'пароль' : 'password'}
              placeholderTextColor={colors.muted}
              style={styles.input}
              secureTextEntry
            />
            <Pressable style={styles.button} onPress={handleLogin} disabled={isLoading}>
              <Text style={styles.buttonText}>{isLoading ? '...' : lang === 'ru' ? 'Войти' : 'Sign in'}</Text>
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
