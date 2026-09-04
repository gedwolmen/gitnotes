import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useMarkdown } from 'react-native-marked';
import { File } from 'expo-file-system';

import { Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import { GitFsService } from '@/services/git/GitFsService';
import { isBinaryPath } from '@/components/explore/exploreShared';
import { useRepoStore } from '@/stores/repoStore';
import { useTokens, useTheme } from '@/contexts/ThemeContext';
import type { RootStackParamList } from '@/navigation/types';
import { getMarkdownStyles } from '@/utils/preview';
import { useRenderStyle } from '@/stores/renderStyleStore';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ExploreFile'>;

type Mode = 'markdown' | 'code' | 'binary' | 'plain';

const CODE_EXTS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
  'c', 'cpp', 'cc', 'h', 'hpp',
  'cs', 'php', 'scala', 'lua', 'sh', 'bash', 'zsh',
  'css', 'scss', 'less', 'html', 'htm', 'xml', 'svg',
  'json', 'yaml', 'yml', 'toml', 'ini', 'conf', 'env',
  'sql', 'graphql', 'proto', 'dockerfile', 'gitignore',
]);

function detectMode(filename: string): Mode {
  const lower = filename.toLowerCase();
  const ext = lower.split('.').pop() ?? '';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (isBinaryPath(lower)) return 'binary';
  if (CODE_EXTS.has(ext)) return 'code';
  return 'plain';
}

function MarkdownBody({ value, styles: mdStyles }: { value: string; styles: ReturnType<typeof getMarkdownStyles> }) {
  const nodes = useMarkdown(value, { styles: mdStyles });
  return <>{React.Children.toArray(nodes)}</>;
}

/** View a single file from the local working tree.
 * Supports markdown rendering, syntax-highlighted code, and plain text.
 * Binary files show a placeholder. */
export default function ExploreFileScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<Route>();
  const { colors } = useTokens();
  const { isDark } = useTheme();
  const { repoId, path } = route.params;

  const storedRepo = useRepoStore((state) =>
    state.repositories.find((candidate) => candidate.id === repoId),
  );

  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fileName = useMemo(() => path.split('/').pop() ?? path, [path]);
  const mode: Mode = useMemo(() => detectMode(fileName), [fileName]);

  useEffect(() => {
    if (!storedRepo) return;
    let cancelled = false;
    setContent(null);
    setError(null);
    setLoading(true);
    (async () => {
      try {
        const workingTreeUri = GitFsService.workingTreeUri({ repoPath: storedRepo.path });
        const filePath = `${workingTreeUri}/${path}`;
        const file = new File(filePath);
        if (!file.exists) {
          if (!cancelled) setError('File not found in working tree.');
          return;
        }
        const result = await file.text();
        if (cancelled) return;
        setContent(result);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storedRepo, path]);

  const markdownOverrides = useRenderStyle('markdown');
  const markdownStyles = useMemo(
    () => getMarkdownStyles(colors, isDark, markdownOverrides),
    [colors, isDark, markdownOverrides],
  );

  if (!storedRepo) {
    return (
      <SafeAreaView className="flex-1" style={{ flex: 1, backgroundColor: colors.background }}>
        <View className="flex-1 items-center justify-center px-8" style={{ flex: 1 }}>
          <Text style={{ color: colors.textSecondary }}>Repository not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1" style={{ flex: 1, backgroundColor: colors.background }} testID="explore-file.root">
      <View
        className="flex-row items-center gap-2 px-4 py-3"
        style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="explore-file.back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Heading className="text-lg" style={{ color: colors.text }} numberOfLines={1}>
            {fileName}
          </Heading>
          <Text className="text-xs font-mono" style={{ color: colors.textSecondary }} numberOfLines={1}>
            {path}
          </Text>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center gap-2" style={{ flex: 1 }}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={{ color: colors.textSecondary }}>Reading file…</Text>
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-8" style={{ flex: 1 }}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.error} />
          <Text className="mt-2 text-center text-sm" style={{ color: colors.error }}>{error}</Text>
        </View>
      ) : content == null ? (
        <View className="flex-1 items-center justify-center px-8" style={{ flex: 1 }}>
          <Ionicons name="document-outline" size={40} color={colors.textSecondary} />
          <Text className="mt-2 text-center text-sm" style={{ color: colors.textSecondary }}>
            Empty file.
          </Text>
        </View>
      ) : mode === 'binary' ? (
        <View className="flex-1 items-center justify-center px-8" style={{ flex: 1 }}>
          <Ionicons name="cube-outline" size={44} color={colors.textSecondary} />
          <Text className="mt-2 text-center" style={{ color: colors.textSecondary }}>
            Binary file — no textual preview available.
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="p-4 pb-10"
          showsVerticalScrollIndicator
        >
          {mode === 'markdown' ? (
            <MarkdownBody value={content} styles={markdownStyles} />
          ) : (
            <Text
              className={mode === 'code' ? 'text-[13px] leading-[18px] font-mono' : 'text-sm leading-5'}
              style={{ color: colors.text }}
              selectable
            >
              {content}
            </Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
