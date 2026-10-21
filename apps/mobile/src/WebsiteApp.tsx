import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Linking, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { attachPublisher, ensurePlayer, playerCommand, playerSnapshot, serialize, SITE_URL } from './web-player/controller';

function internal(url: string) {
  try { return new URL(url).origin === SITE_URL; } catch { return false; }
}
function openExternal(url: string) {
  if (/^(https?:|mailto:)/i.test(url)) void Linking.openURL(url).catch(() => undefined);
}

export default function WebsiteApp() {
  const web = useRef<WebView>(null);
  const canGoBack = useRef(false);
  const trusted = useRef(true);
  const publishing = useRef(false);
  const fullSnapshotRequested = useRef(false);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [playerError, setPlayerError] = useState('');

  useEffect(() => {
    let disposed = false;
    const publish = async (full = false) => {
      fullSnapshotRequested.current ||= full;
      if (publishing.current || !trusted.current || disposed) return;
      publishing.current = true;
      try {
        const includeQueue = fullSnapshotRequested.current;
        fullSnapshotRequested.current = false;
        const state = await playerSnapshot(includeQueue);
        const payload = JSON.stringify({ channel: 'vinyl-player', version: 1, type: 'state', state });
        if (!disposed && trusted.current) web.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent('vinyl-native-player',{detail:${payload}}));true;`);
      } catch { /* The service may still be initializing. */ }
      finally { publishing.current = false; }
      if (fullSnapshotRequested.current && !disposed) void publish(true);
    };
    attachPublisher(publish);
    void ensurePlayer().then(() => publish(true)).catch(() => setPlayerError('Не удалось запустить аудиоплеер. Перезапустите приложение.'));
    const timer = setInterval(() => { if (AppState.currentState === 'active') void publish(); }, 1000);
    const appState = AppState.addEventListener('change', state => { if (state === 'active') void publish(true); });
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack.current) return false;
      web.current?.goBack(); return true;
    });
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      void PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    }
    return () => { disposed = true; attachPublisher(); clearInterval(timer); appState.remove(); back.remove(); };
  }, []);

  return <SafeAreaProvider><SafeAreaView style={styles.root} edges={['top', 'bottom']}>
    <StatusBar style="dark" />
    <WebView ref={web} source={{ uri: SITE_URL }} style={styles.web}
      injectedJavaScriptObject={{ vinylPlayer: 1 }}
      applicationNameForUserAgent="VinylAndroid/0.2"
      originWhitelist={['https://mityadima.ru']}
      sharedCookiesEnabled thirdPartyCookiesEnabled={false}
      mixedContentMode="never" allowFileAccess={false} allowUniversalAccessFromFileURLs={false}
      mediaPlaybackRequiresUserAction allowsInlineMediaPlayback
      onShouldStartLoadWithRequest={request => {
        if (internal(request.url)) return true;
        openExternal(request.url); return false;
      }}
      onOpenWindow={event => openExternal(event.nativeEvent.targetUrl)}
      onNavigationStateChange={navigation => { canGoBack.current = navigation.canGoBack; trusted.current = internal(navigation.url); }}
      onLoadStart={() => { setLoading(true); setPageError(''); }}
      onLoadEnd={() => { setLoading(false); }}
      onError={() => { setLoading(false); setPageError('Не удалось открыть сайт. Проверьте подключение к интернету.'); }}
      onHttpError={event => { if (event.nativeEvent.url === SITE_URL || event.nativeEvent.url === `${SITE_URL}/`) setPageError('Сайт временно недоступен. Попробуйте ещё раз.'); }}
      onRenderProcessGone={() => web.current?.reload()}
      onMessage={event => {
        if (!internal(event.nativeEvent.url) || event.nativeEvent.data.length > 8_000_000) return;
        try {
          const message = JSON.parse(event.nativeEvent.data);
          if (message?.channel !== 'vinyl-player' || message.version !== 1) return;
          void serialize(() => playerCommand(message)).then(() => setPlayerError('')).catch(() => setPlayerError('Не удалось включить трек. Проверьте интернет и вход в аккаунт.'));
        } catch { /* Ignore messages that are not part of the player protocol. */ }
      }}
    />
    {loading && <View style={styles.loading} pointerEvents="none"><ActivityIndicator color="#555" /></View>}
    {pageError ? <View style={styles.error}><Text style={styles.text}>{pageError}</Text><Pressable accessibilityRole="button" style={styles.button} onPress={() => web.current?.reload()}><Text>Повторить</Text></Pressable></View> : null}
    {playerError ? <Pressable accessibilityRole="button" style={styles.notice} onPress={() => setPlayerError('')}><Text style={styles.text}>{playerError}</Text></Pressable> : null}
  </SafeAreaView></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' }, web: { flex: 1, backgroundColor: '#fff' },
  loading: { position: 'absolute', top: 12, right: 12, padding: 10, backgroundColor: '#fff', borderRadius: 24 },
  error: { ...StyleSheet.absoluteFillObject, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', padding: 30, gap: 20 },
  text: { color: '#222', textAlign: 'center', fontSize: 15 },
  button: { paddingVertical: 14, paddingHorizontal: 28, backgroundColor: '#eee', borderRadius: 8 },
  notice: { padding: 14, backgroundColor: '#fff3cd' },
});
