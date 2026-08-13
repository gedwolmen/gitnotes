import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { useTheme } from '../contexts/ThemeContext';
import { useRenderStyleStore } from '../stores/renderStyleStore';
import StructuredRenderer from '../components/StructuredRenderer';
import { SafeAreaView } from '../components/ui/SafeAreaView';
import { SavingOverlay } from '../components/ui/SavingOverlay';
import HexColorPickerModal from '../components/HexColorPickerModal';
import { NeorgContentParser } from '../services/NeorgContentParser';
import { OrgContentParser } from '../services/OrgContentParser';
import { getMarkdownStyles } from '../utils/preview';
import type { FormatRenderStyle, RenderFormat } from '../types/RenderStyle';
import { formatLabel } from '../types/RenderStyle';
import { useMarkdown } from 'react-native-marked';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'RenderStyleEditor'>;
type RouteParams = RouteProp<RootStackParamList, 'RenderStyleEditor'>;

const SAMPLE_MARKDOWN = `# Heading 1\n## Heading 2\n### Heading 3\n\nBody text with a [link](https://example.com) and \`inline code\`.\n\n> Blockquote line.\n\n\`\`\`\nfenced code block\nlet x = 42;\n\`\`\`\n\n---\n`;
const SAMPLE_NEORG = `* Heading 1\n** Heading 2\n*** Heading 3\n\nBody text with a {https://example.com}[link] and \`inline code\`.\n\n- Unordered item\n- Another item\n\n> Blockquote line.\n\n@code\nfenced code block\nlet x = 42;\n@end\n\n___\n`;
const SAMPLE_ORG = `* TODO Heading 1\n** DONE Heading 2\n*** Heading 3\n\nBody text with a [[https://example.com][link]] and =inline code= and +strikethrough+.\n\n- Unordered item\n- Another item\n\n#+BEGIN_QUOTE\nBlockquote line.\n#+END_QUOTE\n\n#+BEGIN_SRC javascript\nfenced code block\nlet x = 42;\n#+END_SRC\n\nSCHEDULED: <2025-01-15>\n[fn:1] A footnote definition.\n\n-----\n`;

function sampleFor(format: RenderFormat): string {
  if (format === 'markdown') return SAMPLE_MARKDOWN;
  if (format === 'org') return SAMPLE_ORG;
  return SAMPLE_NEORG;
}

interface ColorFieldProps {
  label: string;
  value?: string;
  onChange: (next?: string) => void;
}

function ColorField({ label, value, onChange }: ColorFieldProps) {
  const { colors } = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <View className="flex-row items-center justify-between px-4 py-2.5 gap-3">
      <Text className="text-sm flex-1" style={{ color: colors.text }}>{label}</Text>
      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`pick color for ${label}`}
          onPress={() => setPickerOpen(true)}
          style={({ pressed }) => ({
            width: 22,
            height: 22,
            borderRadius: 6,
            borderWidth: 1,
            backgroundColor: value || colors.background,
            borderColor: colors.border,
            opacity: pressed ? 0.7 : 1,
          })}
        />
        <TextInput
          className="w-[110px] text-[13px] border rounded-lg px-2.5 py-1.5"
          style={{ color: colors.text, borderColor: colors.border, backgroundColor: colors.background }}
          placeholder="#rrggbb"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          value={value ?? ''}
          onChangeText={(t) => onChange(t.trim() ? t.trim() : undefined)}
        />
      </View>
      <HexColorPickerModal
        visible={pickerOpen}
        title={label}
        initialColor={value}
        allowClear
        onClose={() => setPickerOpen(false)}
        onSelect={(hex) => onChange(hex ?? undefined)}
      />
    </View>
  );
}

function MarkdownPreview({ value, format, overrides }: { value: string; format: RenderFormat; overrides: FormatRenderStyle }) {
  const { colors, isDark } = useTheme();
  const styles2 = useMemo(() => getMarkdownStyles(colors, isDark, overrides), [colors, isDark, overrides]);
  if (format === 'markdown') {
    return <MarkdownNodes value={value} styles2={styles2} />;
  }
  const parser = format === 'org' ? OrgContentParser : NeorgContentParser;
  const parsed = parser.parseContent(value);
  if (!parsed.success || !parsed.blocks) {
    return <Text style={{ color: colors.textSecondary }}>(preview unavailable)</Text>;
  }
  return <StructuredRenderer blocks={parsed.blocks} format={format} />;
}

function MarkdownNodes({ value, styles2 }: { value: string; styles2: ReturnType<typeof getMarkdownStyles> }) {
  const nodes = useMarkdown(value, { styles: styles2 });
  return <>{React.Children.toArray(nodes)}</>;
}

export default function RenderStyleEditorScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteParams>();
  const { format } = route.params;
  const { colors } = useTheme();
  const settings = useRenderStyleStore((s) => s.settings);
  const updateFormat = useRenderStyleStore((s) => s.updateFormat);
  const resetFormat = useRenderStyleStore((s) => s.resetFormat);
  const save = useRenderStyleStore((s) => s.save);
  const isSaving = useRenderStyleStore((s) => s.isSaving);
  const binding = useRenderStyleStore((s) => s.binding);
  const error = useRenderStyleStore((s) => s.error);

  const overrides: FormatRenderStyle = settings.formats[format] ?? {};
  const [localOverrides, setLocalOverrides] = useState<FormatRenderStyle>(overrides);
  const [dirty, setDirty] = useState(false);

  const setToken = useCallback(<K extends keyof FormatRenderStyle>(key: K, value: FormatRenderStyle[K]) => {
    setLocalOverrides((prev) => {
      const next = { ...prev, [key]: value };
      // Strip empty token objects so reset is meaningful
      if (value && typeof value === 'object' && Object.values(value).every((v) => v === undefined || v === '')) {
        delete next[key];
      }
      updateFormat(format, next);
      return next;
    });
    setDirty(true);
  }, [format, updateFormat]);

  const handleSave = useCallback(async () => {
    if (!binding) {
      Alert.alert('Pick a repo first', 'Render styles need a repo to save to. Go back and pick one in Note rendering settings.');
      return;
    }
    const ok = await save();
    if (ok) {
      setDirty(false);
      Alert.alert('Saved', `Render styles pushed to ${binding.owner}/${binding.name}/settings/render.json`);
    }
  }, [binding, save]);

  const handleReset = useCallback(() => {
    Alert.alert(
      'Reset overrides?',
      `Clear custom render styles for ${formatLabel(format)} and fall back to theme defaults.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            resetFormat(format);
            setLocalOverrides({});
            setDirty(true);
          },
        },
      ],
    );
  }, [format, resetFormat]);

  const sample = useMemo(() => sampleFor(format), [format]);

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1" style={{ backgroundColor: colors.background }}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text className="text-[17px] font-semibold" style={{ color: colors.text }}>{formatLabel(format)}</Text>
        <TouchableOpacity onPress={handleSave} disabled={isSaving || !dirty}>
          <Text
            className="text-[15px] font-semibold"
            style={{ color: dirty ? colors.primary : colors.textSecondary, opacity: isSaving ? 0.5 : 1 }}
          >
            Save
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerClassName="pb-8">
        <Text className="text-xs font-semibold uppercase tracking-wide px-4 mt-4 mb-2" style={{ color: colors.textSecondary, letterSpacing: 0.5 }}>Live preview</Text>
        <View className="rounded-sm mx-3 p-4 border" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
          <MarkdownPreview value={sample} format={format} overrides={localOverrides} />
        </View>

        <Text className="text-xs font-semibold uppercase tracking-wide px-4 mt-4 mb-2" style={{ color: colors.textSecondary, letterSpacing: 0.5 }}>Headings</Text>
        <View className="rounded-sm mx-3 py-1" style={{ backgroundColor: colors.surface }}>
          <ColorField
            label="H1 color"
            value={localOverrides.h1?.color}
            onChange={(c) => setToken('h1', { ...localOverrides.h1, color: c })}
          />
          <ColorField
            label="H2 color"
            value={localOverrides.h2?.color}
            onChange={(c) => setToken('h2', { ...localOverrides.h2, color: c })}
          />
          <ColorField
            label="H3 color"
            value={localOverrides.h3?.color}
            onChange={(c) => setToken('h3', { ...localOverrides.h3, color: c })}
          />
        </View>

        <Text className="text-xs font-semibold uppercase tracking-wide px-4 mt-4 mb-2" style={{ color: colors.textSecondary, letterSpacing: 0.5 }}>Body</Text>
        <View className="rounded-sm mx-3 py-1" style={{ backgroundColor: colors.surface }}>
          <ColorField
            label="Body text color"
            value={localOverrides.body?.color}
            onChange={(c) => setToken('body', { color: c })}
          />
          <ColorField
            label="Link color"
            value={localOverrides.link?.color}
            onChange={(c) => setToken('link', { color: c })}
          />
        </View>

        <Text className="text-xs font-semibold uppercase tracking-wide px-4 mt-4 mb-2" style={{ color: colors.textSecondary, letterSpacing: 0.5 }}>Code</Text>
        <View className="rounded-sm mx-3 py-1" style={{ backgroundColor: colors.surface }}>
          <ColorField
            label="Code block bg"
            value={localOverrides.codeBlock?.background}
            onChange={(c) => setToken('codeBlock', { ...localOverrides.codeBlock, background: c })}
          />
          <ColorField
            label="Code block text (Neorg only)"
            value={localOverrides.codeBlock?.text}
            onChange={(c) => setToken('codeBlock', { ...localOverrides.codeBlock, text: c })}
          />
          <ColorField
            label="Inline code bg"
            value={localOverrides.inlineCode?.background}
            onChange={(c) => setToken('inlineCode', { ...localOverrides.inlineCode, background: c })}
          />
          <ColorField
            label="Inline code text"
            value={localOverrides.inlineCode?.text}
            onChange={(c) => setToken('inlineCode', { ...localOverrides.inlineCode, text: c })}
          />
        </View>

        <Text className="text-xs font-semibold uppercase tracking-wide px-4 mt-4 mb-2" style={{ color: colors.textSecondary, letterSpacing: 0.5 }}>Blockquote / divider</Text>
        <View className="rounded-sm mx-3 py-1" style={{ backgroundColor: colors.surface }}>
          <ColorField
            label="Blockquote bar color"
            value={localOverrides.blockquote?.bar}
            onChange={(c) => setToken('blockquote', { ...localOverrides.blockquote, bar: c })}
          />
          <ColorField
            label="Blockquote text color"
            value={localOverrides.blockquote?.text}
            onChange={(c) => setToken('blockquote', { ...localOverrides.blockquote, text: c })}
          />
          <ColorField
            label="Divider color"
            value={localOverrides.divider?.color}
            onChange={(c) => setToken('divider', { color: c })}
          />
        </View>

        <Text className="text-xs font-semibold uppercase tracking-wide px-4 mt-4 mb-2" style={{ color: colors.textSecondary, letterSpacing: 0.5 }}>Table</Text>
        <View className="rounded-sm mx-3 py-1" style={{ backgroundColor: colors.surface }}>
          <ColorField
            label="Border color"
            value={localOverrides.table?.border}
            onChange={(c) => setToken('table', { ...localOverrides.table, border: c })}
          />
          <ColorField
            label="Header background"
            value={localOverrides.table?.headerBg}
            onChange={(c) => setToken('table', { ...localOverrides.table, headerBg: c })}
          />
          <ColorField
            label="Cell background"
            value={localOverrides.table?.cellBg}
            onChange={(c) => setToken('table', { ...localOverrides.table, cellBg: c })}
          />
        </View>

        <Text className="text-xs font-semibold uppercase tracking-wide px-4 mt-4 mb-2" style={{ color: colors.textSecondary, letterSpacing: 0.5 }}>Math</Text>
        <View className="rounded-sm mx-3 py-1" style={{ backgroundColor: colors.surface }}>
          <ColorField
            label="Text color"
            value={localOverrides.math?.textColor}
            onChange={(c) => setToken('math', { ...localOverrides.math, textColor: c })}
          />
          <ColorField
            label="Block background"
            value={localOverrides.math?.blockBg}
            onChange={(c) => setToken('math', { ...localOverrides.math, blockBg: c })}
          />
        </View>

        <Text className="text-xs font-semibold uppercase tracking-wide px-4 mt-4 mb-2" style={{ color: colors.textSecondary, letterSpacing: 0.5 }}>Frontmatter</Text>
        <View className="rounded-sm mx-3 py-1" style={{ backgroundColor: colors.surface }}>
          <ColorField
            label="Background"
            value={localOverrides.frontmatter?.bg}
            onChange={(c) => setToken('frontmatter', { ...localOverrides.frontmatter, bg: c })}
          />
          <ColorField
            label="Text color"
            value={localOverrides.frontmatter?.text}
            onChange={(c) => setToken('frontmatter', { ...localOverrides.frontmatter, text: c })}
          />
          <ColorField
            label="Key color"
            value={localOverrides.frontmatter?.keyColor}
            onChange={(c) => setToken('frontmatter', { ...localOverrides.frontmatter, keyColor: c })}
          />
        </View>

        <Text className="text-xs font-semibold uppercase tracking-wide px-4 mt-4 mb-2" style={{ color: colors.textSecondary, letterSpacing: 0.5 }}>Checkbox</Text>
        <View className="rounded-sm mx-3 py-1" style={{ backgroundColor: colors.surface }}>
          <ColorField
            label="Checked color"
            value={localOverrides.checkbox?.checkedColor}
            onChange={(c) => setToken('checkbox', { ...localOverrides.checkbox, checkedColor: c })}
          />
          <ColorField
            label="Unchecked color"
            value={localOverrides.checkbox?.uncheckedColor}
            onChange={(c) => setToken('checkbox', { ...localOverrides.checkbox, uncheckedColor: c })}
          />
          <ColorField
            label="Strikethrough color"
            value={localOverrides.checkbox?.strikethroughColor}
            onChange={(c) => setToken('checkbox', { ...localOverrides.checkbox, strikethroughColor: c })}
          />
        </View>

        <Text className="text-xs font-semibold uppercase tracking-wide px-4 mt-4 mb-2" style={{ color: colors.textSecondary, letterSpacing: 0.5 }}>Image caption</Text>
        <View className="rounded-sm mx-3 py-1" style={{ backgroundColor: colors.surface }}>
          <ColorField
            label="Caption color"
            value={localOverrides.imageCaption?.color}
            onChange={(c) => setToken('imageCaption', { ...localOverrides.imageCaption, color: c })}
          />
          <ColorField
            label="Overlay background"
            value={localOverrides.imageCaption?.overlayBg}
            onChange={(c) => setToken('imageCaption', { ...localOverrides.imageCaption, overlayBg: c })}
          />
        </View>

        <Text className="text-xs font-semibold uppercase tracking-wide px-4 mt-4 mb-2" style={{ color: colors.textSecondary, letterSpacing: 0.5 }}>Wiki link</Text>
        <View className="rounded-sm mx-3 py-1" style={{ backgroundColor: colors.surface }}>
          <ColorField
            label="Link color"
            value={localOverrides.wikiLink?.color}
            onChange={(c) => setToken('wikiLink', { color: c })}
          />
        </View>

        <Text className="text-xs font-semibold uppercase tracking-wide px-4 mt-4 mb-2" style={{ color: colors.textSecondary, letterSpacing: 0.5 }}>Syntax highlight</Text>
        <View className="rounded-sm mx-3 py-1" style={{ backgroundColor: colors.surface }}>
          <ColorField
            label="Keyword"
            value={localOverrides.syntaxHighlight?.keyword}
            onChange={(c) => setToken('syntaxHighlight', { ...localOverrides.syntaxHighlight, keyword: c })}
          />
          <ColorField
            label="String"
            value={localOverrides.syntaxHighlight?.string}
            onChange={(c) => setToken('syntaxHighlight', { ...localOverrides.syntaxHighlight, string: c })}
          />
          <ColorField
            label="Comment"
            value={localOverrides.syntaxHighlight?.comment}
            onChange={(c) => setToken('syntaxHighlight', { ...localOverrides.syntaxHighlight, comment: c })}
          />
          <ColorField
            label="Number"
            value={localOverrides.syntaxHighlight?.number}
            onChange={(c) => setToken('syntaxHighlight', { ...localOverrides.syntaxHighlight, number: c })}
          />
          <ColorField
            label="Function"
            value={localOverrides.syntaxHighlight?.function}
            onChange={(c) => setToken('syntaxHighlight', { ...localOverrides.syntaxHighlight, function: c })}
          />
        </View>

        <TouchableOpacity
          className="flex-row items-center justify-center gap-2 mx-3 mt-4 py-3 rounded-sm border"
          style={{ borderColor: colors.border }}
          onPress={handleReset}
        >
          <Ionicons name="refresh-outline" size={16} color={colors.error} />
          <Text className="text-sm font-semibold" style={{ color: colors.error }}>Reset {formatLabel(format)} to defaults</Text>
        </TouchableOpacity>

        {error ? <Text className="text-xs px-4 pt-2" style={{ color: colors.error }}>{error}</Text> : null}
        <Text className="text-xs leading-[18px] px-4 pt-3" style={{ color: colors.textSecondary }}>
          Save pushes settings/render.json to {binding ? `${binding.owner}/${binding.name}` : 'the bound repo'}. Other devices pick it up on next launch.
        </Text>
      </ScrollView>

      {isSaving ? <SavingOverlay visible label="Saving…" /> : null}
    </SafeAreaView>
  );
}
