import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useState, useRef } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const APP_URL = 'https://thedeadnotesapp.duckdns.org';
const BG = '#0d0b12';
const ACCENT = '#e8156a';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const webViewRef = useRef(null);

  const reload = () => {
    setError(false);
    setLoading(true);
    webViewRef.current?.reload();
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" backgroundColor={BG} />

        <WebView
          ref={webViewRef}
          source={{ uri: APP_URL }}
          style={styles.webview}
          onLoadStart={() => { setLoading(true); setError(false); }}
          onLoadEnd={() => setLoading(false)}
          onError={() => { setLoading(false); setError(true); }}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          allowsFullscreenVideo
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          cacheEnabled
        />

        {loading && !error && (
          <View style={styles.splash}>
            <Text style={styles.splashIcon}>🎸</Text>
            <Text style={styles.splashTitle}>BandPilot</Text>
            <ActivityIndicator color={ACCENT} size="large" style={{ marginTop: 20 }} />
          </View>
        )}

        {error && (
          <View style={styles.splash}>
            <Text style={styles.splashIcon}>📡</Text>
            <Text style={styles.splashTitle}>Keine Verbindung</Text>
            <Text style={styles.splashSub}>Bitte Internet prüfen</Text>
            <Text style={styles.reloadBtn} onPress={reload}>Neu laden</Text>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  webview: {
    flex: 1,
    backgroundColor: BG,
  },
  splash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashIcon: {
    fontSize: 64,
    marginBottom: 12,
  },
  splashTitle: {
    color: '#f0ecf8',
    fontSize: 30,
    fontWeight: 'bold',
  },
  splashSub: {
    color: '#7a6e8a',
    fontSize: 15,
    marginTop: 8,
  },
  reloadBtn: {
    marginTop: 24,
    backgroundColor: ACCENT,
    color: '#fff',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 10,
    fontSize: 16,
    fontWeight: '600',
    overflow: 'hidden',
  },
});
