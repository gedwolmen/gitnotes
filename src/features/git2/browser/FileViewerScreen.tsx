/**
 * FileViewerScreen — view and edit a single file from a Git2 repository.
 *
 * Supports: text files (with edit mode), images (read-only), binary (error state).
 * Bounded viewer: MAX_FILE_SIZE limit, binary detection, missing file error.
 *
 * Repository-aware deep links: gitnotes://repo/:repoId/file/:path
 *
 * GPL-3.0 derivative of GitSync.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image, ImageLoadEventData } from 'expo-image';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';

import { useFileTreeStore } from './fileTreeStore';
import { useTheme } from '../../../contexts/ThemeContext';
import { SafeAreaView } from '../../../components/ui/SafeAreaView';
import { HapticService } from '../../../utils/haptics';

// ─── Navigation types ──────────────────────────────────────────────────────────

type FileViewerRouteProp = RouteProp<{
  FileViewer: { repoId: string; repoPath: string; branch: string; path: string };
}, 'FileViewer'>;

type FileViewerStackParamList = {
  FileViewer: { repoId: string; repoPath: string; branch: string; path: string };
  Diff: { repoId: string; repoPath: string; branch: string; commitOid?: string; path?: string };
};

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_TEXT_SIZE = 10 * 1024 * 1024; // 10 MB for text
const MAX_IMAGE_SIZE = 50 * 1024 * 1024; // 50 MB for images

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico']);
const BINARY_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'ttf', 'otf', 'woff', 'woff2',
  'eot', 'pdf', 'zip', 'tar', 'gz', 'rar', '7z', 'dmg', 'exe', 'app',
  'a', 'o', 'so', 'dylib', 'class', 'pyc', 'parquet',
]);

const CODE_EXTS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
  'c', 'cpp', 'cc', 'h', 'hpp',
  'cs', 'php', 'scala', 'lua', 'sh', 'bash', 'zsh',
  'css', 'scss', 'less', 'html', 'htm', 'xml', 'svg',
  'json', 'yaml', 'yml', 'toml', 'ini', 'conf', 'env',
  'sql', 'graphql', 'proto', 'dockerfile', 'makefile', 'gitignore',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFileExt(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function isImage(ext: string): boolean {
  return IMAGE_EXTS.has(ext.toLowerCase());
}

function isBinary(ext: string): boolean {
  return BINARY_EXTS.has(ext.toLowerCase());
}

function isCode(ext: string): boolean {
  return CODE_EXTS.has(ext.toLowerCase());
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function getLanguageFromExt(ext: string): string {
  const map: Record<string, string> = {
    ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
    py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust', java: 'Java',
    kt: 'Kotlin', swift: 'Swift', c: 'C', cpp: 'C++', h: 'C/Header',
    cs: 'C#', php: 'PHP', lua: 'Lua', sh: 'Shell', bash: 'Bash',
    css: 'CSS', scss: 'SCSS', less: 'Less', html: 'HTML', xml: 'XML',
    json: 'JSON', yaml: 'YAML', yml: 'YAML', toml: 'TOML',
    sql: 'SQL', graphql: 'GraphQL', md: 'Markdown',
  };
  return map[ext.toLowerCase()] ?? ext.toUpperCase();
}

// ─── Error states ─────────────────────────────────────────────────────────────

interface FileErrorProps {
  icon: string;
  title: string;
  message: string;
  colors: { error: string; textSecondary: string };
}

function FileErrorState({ icon, title, message, colors }: FileErrorProps) {
  return (
    <View style={errorStyles.container}>
      <Ionicons name={icon as any} size={48} color={colors.error} />
      <Text style={[errorStyles.title, { color: colors.error }]}>{title}</Text>
      <Text style={[errorStyles.message, { color: colors.textSecondary }]}>{message}</Text>
    </View>
  );
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    marginTop: 8,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});

// ─── Image viewer ─────────────────────────────────────────────────────────────

interface ImageViewerContentProps {
  localUri: string;
  fileName: string;
  fileSize?: number;
  dimensions: { width: number; height: number } | null;
  colors: { textSecondary: string };
}

function ImageViewerContent({ localUri, fileName, fileSize, dimensions, colors }: ImageViewerContentProps) {
  const metaLine = [
    formatBytes(fileSize),
    dimensions ? `${dimensions.width}×${dimensions.height}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
      maximumZoomScale={4}
      minimumZoomScale={1}
      centerContent
    >
      <Image
        source={{ uri: localUri }}
        style={{ width: '100%', height: 300 }}
        contentFit="contain"
        accessibilityLabel={fileName}
        onLoad={(e: ImageLoadEventData) => {
          // Dimensions tracked internally if needed
        }}
      />
      {metaLine ? (
        <Text style={[styles.imageMeta, { color: colors.textSecondary }]}>{metaLine}</Text>
      ) : null}
    </ScrollView>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────

export function FileViewerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<FileViewerStackParamList>>();
  const route = useRoute<FileViewerRouteProp>();
  const { repoId, repoPath, branch, path } = route.params;
  const { colors } = useTheme();

  const loadFileContent = useFileTreeStore((s) => s.loadFileContent);
  const stageFile = useFileTreeStore((s) => s.stageFile);

  const [content, setContent] = useState<string | null>(null);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [imageDims, setImageDims] = useState<{ width: number; height: number } | null>(null);
  const [fileSize, setFileSize] = useState<number | undefined>();

  const cancelledRef = useRef(false);

  const fileName = useMemo(() => path.split('/').pop() ?? path, [path]);
  const fileExt = useMemo(() => getFileExt(fileName), [fileName]);
  const isImageFile = useMemo(() => isImage(fileExt), [fileExt]);
  const isBinaryFile = useMemo(() => isBinary(fileExt), [fileExt]);
  const isCodeFile = useMemo(() => isCode(fileExt), [fileExt]);

  useEffect(() => {
    cancelledRef.current = false;
    setIsLoading(true);
    setError(null);
    setContent(null);
    setLocalUri(null);

    (async () => {
      try {
        const fullPath = `${repoPath}/${path}`;
        let size: number | undefined;
        try {
          const info = await FileSystem.getInfoAsync(fullPath);
          if (info.exists && 'size' in info) {
            size = (info as { size?: number }).size;
          }
        } catch {
          // Size check not available on this platform
        }

        if (size !== undefined) {
          setFileSize(size);
        }

        if (isImageFile) {
          if (size !== undefined && size > MAX_IMAGE_SIZE) {
            setError(`Image too large (${formatBytes(size)}). Maximum supported size is ${formatBytes(MAX_IMAGE_SIZE)}.`);
            setIsLoading(false);
            return;
          }
          // Images: use local path directly
          if (!cancelledRef.current) {
            setLocalUri(fullPath);
            setIsLoading(false);
          }
          return;
        }

        if (isBinaryFile) {
          if (!cancelledRef.current) {
            setError('Binary file. Cannot display content.');
            setIsLoading(false);
          }
          return;
        }

        // Text files: check size
        if (size !== undefined && size > MAX_TEXT_SIZE) {
          if (!cancelledRef.current) {
            setError(`File too large (${formatBytes(size)}). Maximum supported text size is ${formatBytes(MAX_TEXT_SIZE)}.`);
            setIsLoading(false);
          }
          return;
        }

        // Read text content
        const text = await FileSystem.readAsStringAsync(fullPath);
        if (!cancelledRef.current) {
          setContent(text);
          setEditContent(text);
          setIsLoading(false);
        }
      } catch (e) {
        if (!cancelledRef.current) {
          setError(e instanceof Error ? e.message : 'Failed to load file');
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, [repoPath, path, isImageFile, isBinaryFile]);

  const handleBack = useCallback(() => {
    HapticService.light();
    navigation.goBack();
  }, [navigation]);

  const handleEdit = useCallback(() => {
    HapticService.light();
    setIsEditing(true);
  }, []);

  const handleCancelEdit = useCallback(() => {
    HapticService.light();
    setEditContent(content ?? '');
    setIsEditing(false);
  }, [content]);

  const handleSave = useCallback(async () => {
    HapticService.medium();
    try {
      const fullPath = `${repoPath}/${path}`;
      await FileSystem.writeAsStringAsync(fullPath, editContent);
      setContent(editContent);
      setIsEditing(false);
      // Refresh staging status
      await stageFile(path);
    } catch (e) {
      Alert.alert('Save Failed', e instanceof Error ? e.message : 'Unknown error');
    }
  }, [repoPath, path, editContent, stageFile]);

  const handleViewDiff = useCallback(() => {
    navigation.navigate('Diff', { repoId, repoPath, branch, path });
  }, [navigation, repoId, repoPath, branch, path]);

  const metaLine = useMemo(() => {
    const parts = [
      isImageFile ? 'Image' : isCodeFile ? getLanguageFromExt(fileExt) : 'Text',
      formatBytes(fileSize),
      branch,
    ].filter(Boolean);
    return parts.join(' · ');
  }, [isImageFile, isCodeFile, fileExt, fileSize, branch]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            { borderBottomColor: colors.border, backgroundColor: colors.surface },
          ]}
        >
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.primary} />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
              {fileName}
            </Text>
            {metaLine ? (
              <Text style={[styles.headerMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                {metaLine}
              </Text>
            ) : null}
          </View>
          {!isImageFile && !error && (
            <View style={styles.headerActions}>
              {isEditing ? (
                <>
                  <TouchableOpacity onPress={handleCancelEdit} style={styles.headerButton}>
                    <Ionicons name="close" size={22} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSave} style={styles.headerButton}>
                    <Ionicons name="checkmark" size={22} color="#34c759" />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity onPress={handleViewDiff} style={styles.headerButton}>
                    <Ionicons name="git-compare-outline" size={22} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleEdit} style={styles.headerButton}>
                    <Ionicons name="create-outline" size={22} color={colors.primary} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>

        {/* Content */}
        {error ? (
          <FileErrorState
            icon="alert-circle-outline"
            title="Cannot Display File"
            message={error}
            colors={colors}
          />
        ) : isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Loading file...
            </Text>
          </View>
        ) : isImageFile && localUri ? (
          <ImageViewerContent
            localUri={localUri}
            fileName={fileName}
            fileSize={fileSize}
            dimensions={imageDims}
            colors={colors}
          />
        ) : content !== null ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.textContent}
            showsVerticalScrollIndicator
          >
            {isEditing ? (
              <TextInput
                style={[
                  styles.textInput,
                  {
                    color: colors.text,
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                value={editContent}
                onChangeText={setEditContent}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                textAlignVertical="top"
              />
            ) : (
              <Text
                style={[
                  styles.textContent,
                  isCodeFile ? styles.codeText : undefined,
                  { color: colors.text },
                ]}
                selectable
              >
                {content}
              </Text>
            )}
          </ScrollView>
        ) : (
          <FileErrorState
            icon="document-outline"
            title="Empty File"
            message="This file has no content."
            colors={colors}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: 6,
    marginRight: 4,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 4,
  },
  headerButton: {
    padding: 6,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  textContent: {
    padding: 16,
    paddingBottom: 32,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 200,
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 18,
  },
  imageMeta: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
  },
});
