import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, Platform, ActivityIndicator, View, Text, PermissionsAndroid } from 'react-native';
import { WebView } from 'react-native-webview';
import { useState, useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';

// Production URL (Render.com deployment)
const PROD_URL = 'https://smartagricare.onrender.com';
// Local dev URL (your computer's LAN IP)
const DEV_URL = 'http://192.168.55.104:8080';
// Auto-switch: use local in dev, production in release builds
const APP_URL = __DEV__ ? DEV_URL : PROD_URL;

export default function App() {
  const [serverReady, setServerReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [statusMsg, setStatusMsg] = useState('Connecting to server...');
  const webviewRef = useRef(null);
  const [nativeLoc, setNativeLoc] = useState(null);

  // Poll /api/health until server is awake (skips Render's interstitial page)
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const checkServer = async () => {
      while (!cancelled) {
        attempts++;
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          const res = await fetch(`${APP_URL}/api/health`, { signal: controller.signal });
          clearTimeout(timeout);

          if (res.ok) {
            const data = await res.json();
            if (data.status === 'ok') {
              if (!cancelled) {
                setStatusMsg('Loading app...');
                setServerReady(true);
              }
              return;
            }
          }
        } catch {
          // Server still waking up
        }

        if (cancelled) return;

        if (attempts <= 3) {
          setStatusMsg('Waking up server...');
        } else if (attempts <= 8) {
          setStatusMsg('Almost ready...');
        } else if (attempts > 15) {
          if (!cancelled) setError(true);
          return;
        }

        // Wait 3 seconds before retrying
        await new Promise(r => setTimeout(r, 3000));
      }
    };

    // In dev, server is usually already running — skip polling
    if (__DEV__) {
      setServerReady(true);
    } else {
      checkServer();
    }

    return () => { cancelled = true; };
  }, []);

  // Handle messages from WebView (TTS requests, etc.)
  const handleWebViewMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'NATIVE_TTS_SPEAK') {
        const langMap = { en: 'en-US', hi: 'hi-IN', te: 'te-IN' };
        Speech.stop();
        Speech.speak(data.text, {
          language: langMap[data.language] || 'en-US',
          rate: 0.95,
        });
      } else if (data.type === 'NATIVE_TTS_STOP') {
        Speech.stop();
      }
    } catch {
      // Not a JSON message, ignore
    }
  };

  const injectLocation = (loc) => {
    if (loc && webviewRef.current) {
      const jsCode = `
        window.postMessage(JSON.stringify({
          type: 'NATIVE_LOCATION',
          coords: {
            latitude: ${loc.coords.latitude},
            longitude: ${loc.coords.longitude}
          }
        }), '*');
      `;
      webviewRef.current.injectJavaScript(jsCode);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        // Request location permission
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          let location = await Location.getLastKnownPositionAsync({});
          if (location) setNativeLoc(location);

          location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (location) {
            setNativeLoc(location);
            injectLocation(location);
          }
        }
      } catch {
        // Location error — non-critical
      }

      // Request microphone permission (Android)
      if (Platform.OS === 'android') {
        try {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        } catch {
          // Mic permission error — non-critical
        }
      }
    })();
  }, []);

  if (error) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.splashEmoji}>🌱</Text>
        <Text style={styles.errorTitle}>Cannot connect</Text>
        <Text style={styles.errorMsg}>The server may be temporarily unavailable.{'\n'}Please try again in a moment.</Text>
        <Text style={styles.errorUrl}>{APP_URL}</Text>
      </SafeAreaView>
    );
  }

  // Show custom splash while server wakes up
  if (!serverReady) {
    return (
      <SafeAreaView style={styles.splash}>
        <StatusBar style="light" />
        <Text style={styles.splashEmoji}>🌱</Text>
        <Text style={styles.splashTitle}>SmartAgriCare</Text>
        <Text style={styles.splashSubtitle}>AI-Powered Agriculture</Text>
        <View style={styles.splashLoaderWrap}>
          <ActivityIndicator size="large" color="#8BC34A" />
          <Text style={styles.splashStatus}>{statusMsg}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      {loading && (
        <View style={styles.loader}>
          <Text style={styles.splashEmoji}>🌱</Text>
          <ActivityIndicator size="large" color="#6B8F3C" style={{ marginTop: 16 }} />
          <Text style={styles.loaderText}>Loading...</Text>
        </View>
      )}

      <WebView
        ref={webviewRef}
        source={{ uri: APP_URL }}
        style={styles.webview}
        originWhitelist={['*']}
        onMessage={handleWebViewMessage}
        injectedJavaScript={`window.__NATIVE_TTS__ = true; true;`}
        onLoadEnd={() => {
          setLoading(false);
          if (nativeLoc) injectLocation(nativeLoc);
        }}
        onError={(e) => {
          const msg = e.nativeEvent.description || "Unknown Error";
          if (msg.includes("ERR_CONNECTION_REFUSED") || msg.includes("ERR_CLEARTEXT_NOT_PERMITTED")) {
            setError(true);
          }
        }}
        onHttpError={() => {}}
        onRenderProcessGone={() => {}}
        // Grant WebView permissions for mic and location
        onPermissionRequest={(event) => {
          event.grant();
        }}
        // Android: enable geolocation in WebView
        geolocationEnabled={true}
        // Allow media capture (microphone)
        allowsInlineMediaPlayback={true}
        mediaCapturePermissionGrantType="grant"
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled={true}
        cacheMode="LOAD_DEFAULT"
        startInLoadingState={false}
        allowsBackForwardNavigationGestures
        mediaPlaybackRequiresUserAction={false}
        // Allow mixed content for any API calls
        mixedContentMode="compatibility"
        // User agent to avoid CORS issues (looks like a normal browser)
        userAgent="Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f3ef',
    paddingTop: Platform.OS === 'android' ? 25 : 0,
  },
  webview: {
    flex: 1,
  },
  // Custom splash screen (shown while Render wakes up)
  splash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2D6A2E',
  },
  splashEmoji: {
    fontSize: 72,
    marginBottom: 16,
  },
  splashTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  splashSubtitle: {
    fontSize: 15,
    color: '#A5D6A7',
    marginBottom: 48,
  },
  splashLoaderWrap: {
    alignItems: 'center',
  },
  splashStatus: {
    marginTop: 14,
    fontSize: 14,
    color: '#C8E6C9',
    fontWeight: '500',
  },
  // WebView loading overlay
  loader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f3ef',
    zIndex: 10,
  },
  loaderText: {
    marginTop: 12,
    fontSize: 14,
    color: '#3D5A1E',
    fontWeight: '600',
  },
  // Error screen
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2D6A2E',
    padding: 24,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  errorMsg: {
    fontSize: 14,
    color: '#C8E6C9',
    textAlign: 'center',
    lineHeight: 22,
  },
  errorUrl: {
    marginTop: 16,
    fontSize: 12,
    color: '#81C784',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
