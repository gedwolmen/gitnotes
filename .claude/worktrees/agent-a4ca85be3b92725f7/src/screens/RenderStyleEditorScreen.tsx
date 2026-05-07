import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { useTheme } from '../contexts/ThemeContext';
import { useRenderStyleStore } from '../stores/renderStyleStore';
import NeorgRenderer from '../components/NeorgRenderer';
import HexColorPickerModal from '../components/HexColorPickerModal';
import { NeorgContentParser } from '../services/NeorgContentParser';
import { getMarkdownStyles } from '../utils/preview';
import type { FormatRenderStyle, RenderFormat } from '../types/RenderStyle';
import { formatLabel } from '../types/RenderStyle';
import { useMarkdown } from 'react-native-marked';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'RenderStyleEditor'>;
type RouteParams = RouteProp<RootStackParamList, 'RenderStyleEditor'>;

const SAMPLE_MARKDOWN = `# Heading 1\n## Heading 2\n### Heading 3\n\nBody text with a [link](https://example.com) and \`inline code\`.\n\n> Blockquote line.\n\n\`\`\`\nfenced code block\nlet x = 42;\n\`\`\`\n\n---\n`;
const SAMPLE_NEORG = `* Heading 1\n** Heading 2\n*** Heading 3\n\nBody text with a {https://example.com}[link] and \`inline code\`.\n\n> Blockquote line.\n\n@code\nfenced code block\nlet x = 42;\n@end\n\n___\n`;
const SAMPLE_ORG = `* Heading 1\n** Heading 2\n*** Heading 3\n\nBody text with a [[https://example.com][link]] and =inline code=.\n\n#+BEGIN_QUOTE\nBlockquote line.\n#+END_QUOTE\n\n#+BEGIN_SRC\nfenced code block\nlet x = 42;\n#+END_SRC\n\n-----\n`;

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
    <View style={styles.fieldRow}>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
      <View style={styles.fieldRight}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`pick color for ${label}`}
          onPress={() => setPickerOpen(true)}
          style={({ pressed }) => [
            styles.swatch,
            {
              backgroundColor: value || colors.background,
              borderColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        />
        <TextInput
          style={[styles.fieldInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
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
  const parsed = NeorgContentParser.parseContent(value);
  if (!parsed.success || !parsed.blocks) {
    return <Text style={{ color: colors.textSecondary }}>(preview unavailable)</Text>;
  }
  return <NeorgRenderer blocks={parsed.blocks} format={format} />;
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
    <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{formatLabel(format)}</Text>
        <TouchableOpacity onPress={handleSave} disabled={isSaving || !dirty}>
          {isSaving ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={[styles.headerAction, { color: dirty ? colors.primary : colors.textSecondary }]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Live preview</Text>
        <View style={[styles.preview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MarkdownPreview value={sample} format={format} overrides={localOverrides} />
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Headings</Text>
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
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

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Body</Text>
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
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

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Code</Text>
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
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

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Blockquote / divider</Text>
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
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

        <TouchableOpacity style={[styles.resetButton, { borderColor: colors.border }]} onPress={handleReset}>
          <Ionicons name="refresh-outline" size={16} color={colors.error} />
          <Text style={[styles.resetButtonText, { color: colors.error }]}>Reset {formatLabel(format)} to defaults</Text>
        </TouchableOpacity>

        {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>
          Save pushes settings/render.json to {binding ? `${binding.owner}/${binding.name}` : 'the bound repo'}. Other devices pick it up on next launch.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  headerAction: { fontSize: 15, fontWeight: '600' },
  scrollContent: { paddingBottom: 32 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  section: { borderRadius: 12, marginHorizontal: 12, paddingVertical: 4 },
  preview: { borderRadius: 12, marginHorizontal: 12, padding: 16, borderWidth: 1 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  fieldLabel: { fontSize: 14, flex: 1 },
  fieldRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 22, height: 22, borderRadius: 6, borderWidth: 1 },
  fieldInput: { width: 110, fontSize: 13, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  resetButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 12, marginTop: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  resetButtonText: { fontSize: 14, fontWeight: '600' },
  helperText: { fontSize: 12, lineHeight: 18, paddingHorizontal: 16, paddingTop: 12 },
  error: { fontSize: 12, paddingHorizontal: 16, paddingTop: 8 },
});
