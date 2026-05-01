import React, { useEffect, useRef, useState } from 'react';
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

export default function PdfViewerScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'PdfViewer'>>();
  const { owner, repo, branch, path, title } = route.params;
  const { colors } = useTheme();
  const { authState } = useAuth();

  const [localUri, setLocalUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const downloadedUriRef = useRef<string | null>(null);
  const memoryKey = PositionMemoryService.pdfKey(owner, repo, branch, path);
  const [restoredY, setRestoredY] = useState<number | null>(null);
  const lastYRef = useRef(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    } catch {
      // ignore parse errors
    }
  };

  const injectedJavaScript = restoredY != null ? `
(function() {
  var RESTORE_Y = ${restoredY};
  function restore() {
    try { window.scrollTo(0, RESTORE_Y); } catch (_) {}
  }
  function send() {
    try {
      var y = window.scrollY || document.documentElement.scrollTop || 0;
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ scrollY: y }));
      }
    } catch (_) {}
  }
  if (document.readyState === 'complete') restore();
  else window.addEventListener('load', restore);
  setTimeout(restore, 250);
  setTimeout(restore, 800);
  var pending = null;
  window.addEventListener('scroll', function() {
    if (pending) return;
    pending = setTimeout(function() { send(); pending = null; }, 350);
  }, { passive: true });
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
    };
  }, []);

  const handleOpenExternal = async () => {
    if (!localUri) return;
    try {
      await Linking.openURL(localUri);
    } catch {
      // ignore
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
        <WebView
          source={{ uri: localUri }}
          style={{ flex: 1, backgroundColor: colors.background }}
          // Local file PDF — restrict origin to file:// (was '*'). The
          // injected JS only needs to read scrollY and post a message
          // back, no cross-origin file access required.
          originWhitelist={['file://']}
          allowsInlineMediaPlayback
          allowFileAccess
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          injectedJavaScript={injectedJavaScript}
          onMessage={handleMessage}
        />
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
