import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import CookieManager from '@react-native-cookies/cookies';
import * as FileSystem from 'expo-file-system/legacy';
import { getCurrentUser } from '../lib/api';
import { ADMIN_DOWNLOAD_BRIDGE, ADMIN_SITE_ORIGIN, isAdminPageUrl, isAdminSiteUrl, recoveryDownloadText } from '../lib/admin-site';
import { adaptiveStyles, colors, getActiveThemeMode } from '../theme';
import type { AuthUser, LanguageProps } from '../types';

type Props = LanguageProps & {
  onClose: () => void; onAuthChange: (user: AuthUser | null) => void;
  showTrackMeta: boolean; onShowTrackMetaChange?: (enabled: boolean) => void;
};

export function AdminSitePanel({ lang, onLanguageChange, onClose, onAuthChange, showTrackMeta, onShowTrackMetaChange }: Props) {
  const web = useRef<WebView>(null);
  const canGoBack = useRef(false);
  const mounted = useRef(true);
  const checkingAuth = useRef(false);
  const saving = useRef(false);
  const callbacks = useRef({ onClose, onAuthChange, onLanguageChange });
  callbacks.current = { onClose, onAuthChange, onLanguageChange };
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const ru = lang === 'ru';
  const [theme] = useState(getActiveThemeMode);

  useEffect(() => {
    mounted.current = true;
    // Android fetch and WebView share android.webkit.CookieManager. Never copy the session into JS or URLs.
    void CookieManager.set(ADMIN_SITE_ORIGIN, { name: 'site-lang', value: lang, path: '/', secure: true })
      .then(() => { if (mounted.current) setReady(true); })
      .catch(() => { if (mounted.current) setError(true); });
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack.current) web.current?.goBack(); else callbacks.current.onClose();
      return true;
    });
    return () => { mounted.current = false; back.remove(); };
  }, []);

  async function syncAccount() {
    if (checkingAuth.current) return;
    checkingAuth.current = true;
    try {
      const next = await getCurrentUser();
      if (mounted.current) callbacks.current.onAuthChange(next);
      const cookies = await CookieManager.get(ADMIN_SITE_ORIGIN);
      const value = cookies['site-lang']?.value;
      if (mounted.current && (value === 'ru' || value === 'en')) callbacks.current.onLanguageChange(value);
    } catch { /* A connection failure is not a logout. */ }
    finally { checkingAuth.current = false; }
  }

  async function saveRecovery(text: string) {
    if (saving.current) return;
    saving.current = true;
    try {
      const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permission.granted) return;
      const uri = await FileSystem.StorageAccessFramework.createFileAsync(permission.directoryUri, 'mityadima-recovery-codes.txt', 'text/plain');
      await FileSystem.writeAsStringAsync(uri, text);
      if (mounted.current) Alert.alert(ru ? 'Коды сохранены' : 'Codes saved', ru ? 'Храните файл отдельно от телефона.' : 'Keep this file separately from your phone.');
    } catch { if (mounted.current) Alert.alert(ru ? 'Не удалось сохранить файл' : 'Unable to save file'); }
    finally { saving.current = false; }
  }

  return <View style={styles.root}>
    <View style={styles.toolbar}>
      <Pressable onPress={onClose} accessibilityRole="button"><Text style={styles.text}>{ru ? '← В приложение' : '← Back to app'}</Text></Pressable>
      {loading && !error ? <ActivityIndicator size="small" color={colors.muted} /> : null}
    </View>
    <Text style={styles.hint}>{ru ? 'Настройки сайта. Изменения сохраняются на сервере.' : 'Site settings. Changes are saved on the server.'}</Text>
    {onShowTrackMetaChange ? <Pressable style={styles.appSetting} onPress={() => onShowTrackMetaChange(!showTrackMeta)} accessibilityRole="switch" accessibilityState={{ checked: showTrackMeta }}>
      <Text style={styles.text}>{ru ? 'BPM / Key в приложении' : 'BPM / Key in app'}</Text><Text style={styles.text}>{showTrackMeta ? 'ON' : 'OFF'}</Text>
    </Pressable> : null}
    <View style={styles.browser}>
      {ready ? <WebView ref={web} source={{ uri: `${ADMIN_SITE_ORIGIN}/profile` }} style={styles.root}
        originWhitelist={['*']} sharedCookiesEnabled thirdPartyCookiesEnabled={false}
        mixedContentMode="never" allowFileAccess={false} allowUniversalAccessFromFileURLs={false}
        mediaPlaybackRequiresUserAction javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows
        injectedJavaScriptBeforeContentLoaded={`try{localStorage.setItem('mityadima-shelf-theme',${JSON.stringify(theme)});}catch(e){}true;`}
        injectedJavaScript={ADMIN_DOWNLOAD_BRIDGE}
        onShouldStartLoadWithRequest={request => {
          if (isAdminPageUrl(request.url)) return true;
          if (isAdminSiteUrl(request.url)) { callbacks.current.onClose(); return false; }
          if (/^https:\/\//i.test(request.url)) void Linking.openURL(request.url).catch(() => undefined);
          return false;
        }}
        onOpenWindow={event => { if (/^https:\/\//i.test(event.nativeEvent.targetUrl) && !isAdminSiteUrl(event.nativeEvent.targetUrl)) void Linking.openURL(event.nativeEvent.targetUrl).catch(() => undefined); }}
        onNavigationStateChange={navigation => { canGoBack.current = navigation.canGoBack; }}
        onLoadStart={() => { setLoading(true); setError(false); }}
        onLoadEnd={() => { setLoading(false); void syncAccount(); }}
        onError={() => { setLoading(false); setError(true); }}
        onHttpError={event => { if (isAdminPageUrl(event.nativeEvent.url) && event.nativeEvent.statusCode >= 400) { setLoading(false); setError(true); } }}
        onMessage={event => {
          if (!isAdminSiteUrl(event.nativeEvent.url)) return;
          const text = recoveryDownloadText(event.nativeEvent.data);
          if (text) void saveRecovery(text);
        }}
      /> : null}
      {error ? <View style={styles.error}>
        <Text style={styles.text}>{ru ? 'Не удалось открыть админку. Нужен интернет.' : 'Unable to open admin settings. An internet connection is required.'}</Text>
        <Pressable onPress={() => { setError(false); if (ready) web.current?.reload(); else setReady(true); }}><Text style={styles.text}>{ru ? 'Повторить' : 'Retry'}</Text></Pressable>
      </View> : null}
    </View>
  </View>;
}

const styles = adaptiveStyles(StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: '6%', paddingVertical: 12 },
  text: { color: colors.text, fontSize: 14 },
  hint: { color: colors.muted, fontSize: 12, marginHorizontal: '6%', marginBottom: 12 },
  appSetting: { marginHorizontal: '6%', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between' },
  browser: { flex: 1 },
  error: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background, padding: 24, justifyContent: 'center', gap: 20 },
}));
