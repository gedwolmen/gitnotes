import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/text';
import { useTokens } from '@/contexts/ThemeContext';
import type { Palette } from '@/theme/tokens';
import type { DiffLine } from '@/services/git/engine/GitEngine';

function linePrefix(line: DiffLine): string {
  switch (line.origin) {
    case 'Addition':
    case 'AdditionEof':
      return '+';
    case 'Deletion':
    case 'DeletionEof':
      return '-';
    default:
      return ' ';
  }
}

interface LineStyle {
  backgroundColor: string;
  color: string;
}

function lineStyle(colors: Palette, origin: DiffLine['origin']): LineStyle | null {
  switch (origin) {
    case 'Addition':
    case 'AdditionEof':
      return { backgroundColor: `${colors.success}26`, color: colors.success };
    case 'Deletion':
    case 'DeletionEof':
      return { backgroundColor: `${colors.error}26`, color: colors.error };
    default:
      return null;
  }
}

function isChangedLine(line: DiffLine): boolean {
  return line.origin !== 'Context' && line.origin !== 'ContextEof';
}

interface DiffLineListProps {
  lines: DiffLine[];
  showLineNumbers?: boolean;
  /** When provided, changed lines become tappable multi-select rows. */
  selectedIndices?: ReadonlySet<number>;
  onToggleLine?: (line: DiffLine) => void;
}

/**
 * Line-level diff renderer shared by the Changes/Staging previews and the
 * full diff screen. Monospaced, git-colored, horizontal scroll for long lines.
 * With `onToggleLine`, addition/deletion rows turn into a multi-select line
 * picker feeding line-level partial staging (`stageFileLines`).
 */
export function DiffLineList({ lines, showLineNumbers = false, selectedIndices, onToggleLine }: DiffLineListProps) {
  const { colors } = useTokens();
  return (
    <View className="overflow-hidden rounded" style={{ backgroundColor: colors.surfaceSecondary }}>
      {lines.map((line) => {
        const selectable = Boolean(onToggleLine) && isChangedLine(line);
        const selected = selectable && (selectedIndices?.has(line.index ?? 0) ?? false);
        const tone = lineStyle(colors, line.origin);
        const row = (
          <View
            className={`flex-row items-center px-1.5 py-0.5 ${selected ? 'border-l-4' : ''}`}
            style={{
              backgroundColor: selected
                ? `${colors.accent}33`
                : tone?.backgroundColor,
              borderLeftColor: selected ? colors.accent : 'transparent',
              borderLeftWidth: selected ? 4 : 0,
            }}
          >
            {selectable && (
              <Ionicons
                name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                size={14}
                color={selected ? colors.accent : colors.textSecondary}
                style={{ marginRight: 4 }}
              />
            )}
            {showLineNumbers && (
              <Text className="w-10 pr-2 text-right text-[10px]" style={{ color: colors.textSecondary }}>
                {line.newLineno ?? line.oldLineno ?? ''}
              </Text>
            )}
            <Text className="w-3 text-[11px] font-mono" style={{ color: tone?.color ?? colors.textSecondary }}>
              {linePrefix(line)}
            </Text>
            <Text className="flex-1 text-[11px] font-mono" style={{ color: tone?.color ?? colors.text }} numberOfLines={1}>
              {line.content}
            </Text>
          </View>
        );
        if (!selectable) {
          return (
            <View key={`${line.index}-${line.oldLineno ?? 'o'}-${line.newLineno ?? 'n'}`}>
              {row}
            </View>
          );
        }
        return (
          <Pressable
            key={`${line.index}-${line.oldLineno ?? 'o'}-${line.newLineno ?? 'n'}`}
            onPress={() => onToggleLine?.(line)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            testID={`explore.diff.line.${line.index}`}
          >
            {row}
          </Pressable>
        );
      })}
    </View>
  );
}

/** First `limit` diff lines, preferring added/deleted so previews show the
 * actual change even when it sits below context lines. */
export function previewLines(lines: DiffLine[], limit = 6): DiffLine[] {
  const changed = lines.filter((line) => line.origin !== 'Context' && line.origin !== 'ContextEof');
  const source = changed.length > 0 ? changed : lines;
  return source.slice(0, limit);
}
