import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { HapticService } from '../utils/haptics';
import { PositionMemoryService } from '../services/PositionMemoryService';

function encodeRepoPath(path: string): string {
  return path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

const PDF_INVERT_STORAGE_KEY = '@gitnotes:pdf_invert';

export default function PdfViewerScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'PdfViewer'>>();
  const { owner, repo, branch, path, title } = route.params;
  const { colors } = useTheme();
  const { authState } = useAuth();

  const [localUri, setLocalUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inverted, setInverted] = useState(false);
  const cancelledRef = useRef(false);
  const downloadedUriRef = useRef<string | null>(null);
  const memoryKey = PositionMemoryService.pdfKey(owner, repo, branch, path);
  const [restoredY, setRestoredY] = useState<number | null>(null);
  const lastYRef = useRef(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webViewRef = useRef<WebView | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(PDF_INVERT_STORAGE_KEY).then((v) => {
      if (v === '1') setInverted(true);
    });
  }, []);

  const toggleInvert = useCallback(() => {
    HapticService.light();
    setInverted((prev) => {
      const next = !prev;
      AsyncStorage.setItem(PDF_INVERT_STORAGE_KEY, next ? '1' : '0').catch(() => undefined);
      return next;
    });
  }, []);

  useEffect(() => {
    PositionMemoryService.load(memoryKey).then((y) => {
      setRestoredY(y ?? 0);
    });
  }, [memoryKey]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (lastYRef.current > 0) {
        PositionMemoryService.save(memoryKey, lastYRef.current);
      }
    };
  }, [memoryKey]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (typeof data?.scrollY === 'number') {
        lastYRef.current = data.scrollY;
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
          PositionMemoryService.save(memoryKey, lastYRef.current);
        }, 400);
      }
    } catch (error) {
      console.warn('PDF message parse error:', error);
    }
  };

  const injectedJavaScript = restoredY != null ? `
(function() {
  var RESTORE_Y = ${restoredY};
  var pending = null;
  var restoreTimers = [];
  function restore() {
    try { window.scrollTo(0, RESTORE_Y); } catch (error) { void error; }
  }
  function send() {
    try {
      var y = window.scrollY || document.documentElement.scrollTop || 0;
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ scrollY: y }));
      }
    } catch (error) { void error; }
  }
  function onScroll() {
    if (pending) return;
    pending = setTimeout(function() { send(); pending = null; }, 350);
  }
  if (document.readyState === 'complete') restore();
  else window.addEventListener('load', restore);
  restoreTimers.push(setTimeout(restore, 250));
  restoreTimers.push(setTimeout(restore, 800));
  window.addEventListener('scroll', onScroll, { passive: true });

  // #550: clear timers + listeners on pagehide so a stale JS context doesn't
  // keep firing after the WebView unmounts.
  window.addEventListener('pagehide', function() {
    if (pending) { clearTimeout(pending); pending = null; }
    for (var i = 0; i < restoreTimers.length; i++) clearTimeout(restoreTimers[i]);
    restoreTimers = [];
    window.removeEventListener('scroll', onScroll);
  });
  true;
})();
  ` : undefined;

  useEffect(() => {
    cancelledRef.current = false;
    setLocalUri(null);
    setError(null);

    // Drop any prior download from a previous param tuple before starting a new one.
    const previous = downloadedUriRef.current;
    if (previous) {
      downloadedUriRef.current = null;
      FileSystem.deleteAsync(previous, { idempotent: true }).catch(() => undefined);
    }

    (async () => {
      try {
        const ref = branch || 'main';
        const url =
          `https://api.github.com/repos/${owner}/${repo}/contents/${encodeRepoPath(path)}` +
          `?ref=${encodeURIComponent(ref)}`;

        const fileName = path.split('/').pop() ?? 'document.pdf';
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const target = `${FileSystem.cacheDirectory}${Date.now()}-${safeName}`;

        const headers: Record<string, string> = {
          Accept: 'application/vnd.github.raw',
        };
        if (authState.token) {
          headers.Authorization = `Bearer ${authState.token}`;
        }

        const result = await FileSystem.downloadAsync(url, target, { headers });
        if (cancelledRef.current) {
          // Effect was cancelled while we were downloading. Drop the file.
          FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => undefined);
          return;
        }

        if (result.status !== 200) {
          // Failed download — still drop whatever was written.
          FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => undefined);
          setError(`Download failed (HTTP ${result.status})`);
          return;
        }
        downloadedUriRef.current = result.uri;
        setLocalUri(result.uri);
      } catch (e) {
        if (cancelledRef.current) return;
        setError(e instanceof Error ? e.message : 'Unknown error');
      }
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, [owner, repo, branch, path, authState.token]);

  useEffect(() => {
    return () => {
      const uri = downloadedUriRef.current;
      if (uri) {
        downloadedUriRef.current = null;
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
      }
      // #550: stop any in-flight WebView load before navigation pops the
      // screen. Without this, react-native-webview can leave the JS
      // context spinning, leading to an unresponsive UI on return.
      try {
        webViewRef.current?.stopLoading?.();
      } catch (error) { void error; }
    };
  }, []);

  const handleOpenExternal = async () => {
    if (!localUri) return;
    try {
      await Linking.openURL(localUri);
    } catch (error) {
      console.warn('Failed to open PDF externally:', error);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <TouchableOpacity
          onPress={() => { HapticService.light(); navigation.goBack(); }}
          style={styles.iconButton}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {title || path.split('/').pop()}
        </Text>
        <TouchableOpacity
          onPress={toggleInvert}
          style={styles.iconButton}
          disabled={!localUri}
          accessibilityLabel={inverted ? 'Restore PDF colors' : 'Invert PDF colors'}
        >
          <Ionicons
            name={inverted ? 'sunny-outline' : 'contrast-outline'}
            size={22}
            color={localUri ? colors.primary : colors.textSecondary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleOpenExternal}
          style={styles.iconButton}
          disabled={!localUri}
        >
          <Ionicons
            name="open-outline"
            size={22}
            color={localUri ? colors.primary : colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        </View>
      ) : !localUri ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading PDF…</Text>
        </View>
      ) : (
        // Wrapper acts as the blend stacking context for the invert overlay.
        // WKWebView renders PDFs via PDFKit (a native view, not the DOM), so
        // CSS injected into `document` never reaches the PDF pixels. Compose
        // an inverted look by layering a white View on top with
        // `mixBlendMode: 'difference'` — at the iOS / Android compositor
        // level this produces |255 − pdf_pixel|, i.e. true colour inversion.
        <View style={{ flex: 1 }}>
          <WebView
            ref={webViewRef}
            source={{ uri: localUri }}
            style={{ flex: 1, backgroundColor: colors.background }}
            originWhitelist={['file://']}
            allowsInlineMediaPlayback
            allowFileAccess
            allowFileAccessFromFileURLs={false}
            allowUniversalAccessFromFileURLs={false}
            injectedJavaScript={injectedJavaScript}
            onMessage={handleMessage}
          />
          {inverted ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: '#FFFFFF',
                mixBlendMode: 'difference',
              }}
            />
          ) : null}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: {
    padding: 8,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    textAlign: 'center',
  },
});
