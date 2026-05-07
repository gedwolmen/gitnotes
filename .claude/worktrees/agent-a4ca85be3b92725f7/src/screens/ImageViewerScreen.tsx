import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Image, ImageLoadEventData } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';

import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { HapticService } from '../utils/haptics';

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

export default function ImageViewerScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'ImageViewer'>>();
  const { owner, repo, branch, path, title, size } = route.params;
  const { colors } = useTheme();
  const { authState } = useAuth();

  const [localUri, setLocalUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const cancelledRef = useRef(false);

  const fileName = useMemo(() => path.split('/').pop() ?? path, [path]);

  useEffect(() => {
    cancelledRef.current = false;
    setLocalUri(null);
    setError(null);
    setDimensions(null);

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

  const metaLine = [
    formatBytes(size),
    dimensions ? `${dimensions.width}×${dimensions.height}` : null,
    branch ?? 'main',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <TouchableOpacity
          onPress={() => { HapticService.light(); navigation.goBack(); }}
          style={styles.iconButton}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {title || fileName}
          </Text>
          {metaLine ? (
            <Text style={[styles.metaLine, { color: colors.textSecondary }]} numberOfLines={1}>
              {metaLine}
            </Text>
          ) : null}
        </View>
        <View style={styles.iconButton} />
      </View>

      {error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        </View>
      ) : !localUri ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
          <Image
            source={{ uri: localUri }}
            style={styles.image}
            contentFit="contain"
            accessibilityLabel={title || fileName}
            onLoad={(e: ImageLoadEventData) => {
              if (!cancelledRef.current && e.source) {
                setDimensions({ width: e.source.width, height: e.source.height });
              }
            }}
          />
        </ScrollView>
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
  iconButton: { padding: 8, width: 40 },
  headerTextContainer: { flex: 1, paddingHorizontal: 4 },
  title: { fontSize: 16, fontWeight: '600' },
  metaLine: { fontSize: 11, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  errorText: { fontSize: 14, textAlign: 'center' },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%', minHeight: 300 },
});
