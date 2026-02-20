import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, Platform, ActivityIndicator, View, Text } from 'react-native';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const webviewRef = useRef(null);
  const SHOW_DEBUG = false; // Set to true to show debug overlay on device
  const [nativeLoc, setNativeLoc] = useState(null);

  const addLog = (msg) => {
    console.log(msg);
  };

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
      addLog(`Injecting: ${loc.coords.latitude.toFixed(4)}`);
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
      addLog("App Started. Asking Perms...");
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        addLog("Perm Status: " + status);

        if (status !== 'granted') {
          addLog("DENIED");
          return;
        }

        addLog("Fetching LastKnown...");
        let location = await Location.getLastKnownPositionAsync({});
        if (location) {
          addLog("Got LastKnown");
          setNativeLoc(location);
        }

        addLog("Fetching Current...");
        // Use high accuracy but with timeout
        location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (location) {
          addLog("Got Current GPS");
          setNativeLoc(location);
          injectLocation(location);
        } else {
          addLog("Current GPS returned null");
        }
      } catch (e) {
        addLog("ERR: " + e.message);
      }
    })();
  }, []);

  if (error) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorTitle}>Cannot connect</Text>
        <Text style={styles.errorMsg}>Check npm run dev</Text>
        <Text style={styles.errorUrl}>{APP_URL}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#6B8F3C" />
          <Text style={styles.loaderText}>Loading...</Text>
        </View>
      )}

      {/* DEBUG OVERLAY — disabled by default, flip SHOW_DEBUG to true */}
      {SHOW_DEBUG && (
        <View pointerEvents="none" style={styles.debugOverlay}>
          <Text style={styles.debugText}>Debug enabled</Text>
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
          addLog("WebView Loaded");
          if (nativeLoc) injectLocation(nativeLoc);
        }}
        onError={(e) => {
          const msg = e.nativeEvent.description || "Unknown Error";
          addLog("WebView Err: " + msg);
          if (msg.includes("ERR_CONNECTION_REFUSED") || msg.includes("ERR_CLEARTEXT_NOT_PERMITTED")) {
            setError(true);
          }
        }}
        onHttpError={(e) => {
          addLog("HTTP Err: " + e.nativeEvent.statusCode);
        }}
        onRenderProcessGone={() => addLog("WebView Crashed (Render Process Gone)")}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState={false}
        allowsBackForwardNavigationGestures
        mediaPlaybackRequiresUserAction={false}
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
  debugOverlay: {
    position: 'absolute',
    bottom: 20,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 9999,
    padding: 10,
    borderRadius: 8,
  },
  debugText: {
    color: '#00FF00',
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 2
  },
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f3ef',
    padding: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#3D5A1E',
    marginBottom: 8,
  },
  errorMsg: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  errorUrl: {
    marginTop: 12,
    fontSize: 12,
    color: '#999',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
