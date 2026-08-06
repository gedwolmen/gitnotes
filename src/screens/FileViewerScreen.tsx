import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useMarkdown } from 'react-native-marked';

import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { GitHubService } from '../services/GitHubService';
import { NeorgContentParser } from '../services/NeorgContentParser';
import { OrgContentParser } from '../services/OrgContentParser';
import StructuredRenderer from '../components/StructuredRenderer';
import { JsonRenderer } from '../components/JsonRenderer';
import { HapticService } from '../utils/haptics';
import { getMarkdownStyles, stripTopMetadata } from '../utils/preview';
import { useRenderStyle } from '../stores/renderStyleStore';

type Mode = 'markdown' | 'neorg' | 'org' | 'json' | 'code' | 'plain';

const MARKDOWN_EXTS = ['md', 'markdown'];
const NEORG_EXTS = ['norg'];
const ORG_EXTS = ['org'];
const CODE_EXTS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
  'c', 'cpp', 'cc', 'h', 'hpp',
  'cs', 'php', 'scala', 'lua', 'sh', 'bash', 'zsh',
  'css', 'scss', 'less', 'html', 'htm', 'xml', 'svg',
  'json', 'yaml', 'yml', 'toml', 'ini', 'conf', 'env',
  'sql', 'graphql', 'proto', 'dockerfile', 'makefile', 'gitignore',
]);

function detectMode(filename: string): Mode {
  const lower = filename.toLowerCase();
  const ext = lower.split('.').pop() ?? '';
  if (MARKDOWN_EXTS.includes(ext)) return 'markdown';
  if (NEORG_EXTS.includes(ext)) return 'neorg';
  if (ORG_EXTS.includes(ext)) return 'org';
  if (ext === 'json') return 'json';
  if (CODE_EXTS.has(ext)) return 'code';
  return 'plain';
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

function MarkdownBody({ value, styles: mdStyles }: { value: string; styles: ReturnType<typeof getMarkdownStyles> }) {
  const nodes = useMarkdown(value, { styles: mdStyles });
  return <>{React.Children.toArray(nodes)}</>;
}

export default function FileViewerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'FileViewer'>>();
  const route = useRoute<RouteProp<RootStackParamList, 'FileViewer'>>();
  const { owner, repo, branch, path, title, size } = route.params;
  const { colors, isDark } = useTheme();

  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileName = useMemo(() => path.split('/').pop() ?? path, [path]);
  const mode: Mode = useMemo(() => detectMode(fileName), [fileName]);

  useEffect(() => {
    let cancelled = false;
    setContent(null);
    setError(null);
    (async () => {
      const result = await GitHubService.getFileContent(owner, repo, path, branch);
      if (cancelled) return;
      if (result === null) {
        setError('Could not load file content from GitHub.');
        return;
      }
      setContent(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, repo, branch, path]);

  const renderContent = useMemo(() => {
    if (!content) return '';
    if (mode === 'markdown') return stripTopMetadata(content, 'markdown');
    if (mode === 'neorg') return stripTopMetadata(content, 'neorg');
    if (mode === 'org') return stripTopMetadata(content, 'org');
    return content;
  }, [content, mode]);

  const parsedNeorg = useMemo(() => {
    if (!renderContent) return null;
    if (mode !== 'neorg' && mode !== 'org') return null;
    const parser = mode === 'org' ? OrgContentParser : NeorgContentParser;
    const parsed = parser.parseContent(renderContent);
    return parsed.success && parsed.blocks ? parsed.blocks : null;
  }, [renderContent, mode]);

  const markdownOverrides = useRenderStyle('markdown');
  const markdownStyles = useMemo(
    () => getMarkdownStyles(colors, isDark, markdownOverrides),
    [colors, isDark, markdownOverrides],
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1" style={{ backgroundColor: colors.background }}>
      <View
        className="flex-row items-center px-2 py-2 border-b"
        style={{ borderBottomWidth: 0.5, borderBottomColor: colors.border, backgroundColor: colors.surface }}
      >
        <TouchableOpacity
          testID="file-viewer.icon-button.back"
          onPress={() => { HapticService.light(); navigation.goBack(); }}
          className="p-2 w-10"
        >
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <View className="flex-1 px-1">
          <Text className="text-base font-semibold" style={{ color: colors.text }} numberOfLines={1}>
            {title || fileName}
          </Text>
          <Text className="text-[11px] mt-0.5" style={{ color: colors.textSecondary }} numberOfLines={1}>
            {[mode.toUpperCase(), formatBytes(size), branch ?? 'main'].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View className="p-2 w-10" />
      </View>

      {error ? (
        <View className="flex-1 items-center justify-center p-6 gap-3">
          <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
          <Text className="text-sm text-center" style={{ color: colors.error }}>{error}</Text>
        </View>
      ) : content == null ? (
        <View className="flex-1 items-center justify-center p-6 gap-3">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="p-4 pb-10"
          showsVerticalScrollIndicator
        >
          {mode === 'markdown' ? (
            <MarkdownBody value={renderContent} styles={markdownStyles} />
          ) : mode === 'json' ? (
            <JsonRenderer content={renderContent} />
          ) : (mode === 'neorg' || mode === 'org') && parsedNeorg ? (
            <StructuredRenderer
              blocks={parsedNeorg}
              format={mode === 'org' ? 'org' : 'neorg'}
              currentNotePath={path}
              onOpenNote={(targetPath: string, _fragment?: string) => {
                const targetTitle = targetPath.split('/').pop() ?? targetPath;
                navigation.navigate('FileViewer', {
                  owner,
                  repo,
                  branch,
                  path: targetPath,
                  title: targetTitle,
                });
                return true;
              }}
            />
          ) : (
            <Text
              className={mode === 'code' ? 'text-[13px] leading-[18px] font-mono' : 'text-sm leading-5'}
              style={{ color: colors.text }}
              selectable
            >
              {renderContent}
            </Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
