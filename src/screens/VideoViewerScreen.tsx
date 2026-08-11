import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';

import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { HapticService } from '../utils/haptics';
import { SafeAreaView } from '../components/ui/SafeAreaView';

function encodeRepoPath(path: string): string {
  return path.split('/').map((seg) => encodeURIComponent(seg)).join('/');
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[u]}`;
}

function videoMime(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'mp4':
    case 'm4v':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    case 'webm':
      return 'video/webm';
    default:
      return 'video/mp4';
  }
}

export default function VideoViewerScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'VideoViewer'>>();
  const { owner, repo, branch, path, title, size } = route.params;
  const { colors } = useTheme();
  const { authState } = useAuth();

  const [localUri, setLocalUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const fileName = useMemo(() => path.split('/').pop() ?? path, [path]);

  useEffect(() => {
    cancelledRef.current = false;
    setLocalUri(null);
    setError(null);

    (async () => {
      try {
        const ref = branch || 'main';
        const url =
          `https://api.github.com/repos/${owner}/${repo}/contents/${encodeRepoPath(path)}` +
          `?ref=${encodeURIComponent(ref)}`;
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const target = `${FileSystem.cacheDirectory}${Date.now()}-${safeName}`;
        const headers: Record<string, string> = {
          Accept: 'application/vnd.github.raw',
        };
        if (authState.token) headers.Authorization = `Bearer ${authState.token}`;

        const result = await FileSystem.downloadAsync(url, target, { headers });
        if (cancelledRef.current) return;
        if (result.status !== 200) {
          setError(`Download failed (HTTP ${result.status})`);
          return;
        }
        setLocalUri(result.uri);
      } catch (e) {
        if (cancelledRef.current) return;
        setError(e instanceof Error ? e.message : 'Unknown error');
      }
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, [owner, repo, branch, path, authState.token, fileName]);

  const html = useMemo(() => {
    if (!localUri) return '';
    const mime = videoMime(fileName);
    // Escape any " in the URI so a crafted filename can't break out of the
    // attribute and inject script. (mime is whitelisted in videoMime.)
    const safeUri = localUri.replace(/"/g, '%22');
    const safeMime = mime.replace(/[^a-zA-Z0-9/.+-]/g, '');
    return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src file: blob:; style-src 'unsafe-inline'">
<style>
  html, body { margin: 0; height: 100%; background: #000; }
  video { width: 100%; height: 100%; object-fit: contain; }
</style>
</head>
<body>
  <video src="${safeUri}" type="${safeMime}" controls autoplay playsinline></video>
</body>
</html>`;
  }, [localUri, fileName]);

  const metaLine = [formatBytes(size), branch ?? 'main'].filter(Boolean).join(' · ');

  return (
    <SafeAreaView edges={['top']} className="flex-1" style={{ backgroundColor: colors.background }}>
      <View
        className="flex-row items-center px-2 py-2 border-b"
        style={{ borderBottomWidth: 0.5, borderBottomColor: colors.border, backgroundColor: colors.surface }}
      >
        <TouchableOpacity
          testID="video-viewer.icon-button.back"
          onPress={() => { HapticService.light(); navigation.goBack(); }}
          className="p-2 w-10"
        >
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <View className="flex-1 px-1">
          <Text className="text-base font-semibold" style={{ color: colors.text }} numberOfLines={1}>
            {title || fileName}
          </Text>
          {metaLine ? (
            <Text className="text-[11px] mt-0.5" style={{ color: colors.textSecondary }} numberOfLines={1}>
              {metaLine}
            </Text>
          ) : null}
        </View>
        <View className="p-2 w-10" />
      </View>

      {error ? (
        <View className="flex-1 items-center justify-center p-6 gap-3">
          <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
          <Text className="text-sm text-center" style={{ color: colors.error }}>{error}</Text>
        </View>
      ) : !localUri ? (
        <View className="flex-1 items-center justify-center p-6 gap-3">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <WebView
          source={{ html, baseUrl: 'file:///' }}
          style={{ flex: 1, backgroundColor: '#000' }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          originWhitelist={['file://']}
          allowFileAccess
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          javaScriptEnabled={false}
          domStorageEnabled={false}
        />
      )}
    </SafeAreaView>
  );
}
