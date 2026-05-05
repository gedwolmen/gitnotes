import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Alert, Linking, ScrollView } from 'react-native';
import { NeorgContentBlock, NeorgHeading, NeorgListItem, NeorgChecklistItem, NeorgDefinitionItem } from '../models/NeorgContent';
import { useTheme } from '../contexts/ThemeContext';
import { useRenderStyle } from '../stores/renderStyleStore';
import type { RenderFormat } from '../types/RenderStyle';
import { classifyHref } from '../utils/linkClassifier';

interface StructuredRendererProps {
  blocks: NeorgContentBlock[];
  format?: RenderFormat;
  onOpenNote?: (path: string, fragment?: string) => boolean;
  currentNotePath?: string;
  headingPositions?: { current: Map<string, number> };
  scrollRef?: React.RefObject<ScrollView | null>;
}

type InlineSegment =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: string }
  | { type: 'italic'; content: string }
  | { type: 'underline'; content: string }
  | { type: 'strikethrough'; content: string }
  | { type: 'code'; content: string }
  | { type: 'superscript'; content: string }
  | { type: 'subscript'; content: string }
  | { type: 'verbatim'; content: string }
  | { type: 'org-code'; content: string }
  | { type: 'org-strike'; content: string }
  | { type: 'footnote-ref'; label: string; content: string }
  | { type: 'link'; label: string; target: string }
  | { type: 'tag'; name: string };

type InlinePattern = {
  regex: RegExp;
  handler: (match: RegExpMatchArray) => InlineSegment | null;
  validate?: (source: string, match: RegExpMatchArray) => boolean;
};

const URL_SHAPED_REGEX = /https?:\/\/[^\s<>()]+/g;
const WORD_CHAR_REGEX = /[A-Za-z0-9]/;

const inlinePatterns: InlinePattern[] = [
  {
    regex: /\{([*a-z0-9_.:]+)\}(?:\[([^\]]+)\])?/g,
    handler: (m) => {
      const target = m[1];
      if (/^[*a-z0-9_.:-]+$/.test(target)) {
        if (m[2]) return { type: 'link', label: m[2], target };
        if (/^https?:\/\//i.test(target)) return { type: 'link', label: target, target };
        if (/^:.+:$/.test(target)) {
          const filePath = target.slice(1, -1);
          return { type: 'link', label: filePath, target: filePath };
        }
        if (/^\*/.test(target)) {
          const headingName = target.slice(1);
          const slug = headingName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          return { type: 'link', label: headingName, target: `#${slug}` };
        }
        return { type: 'tag', name: target };
      }
      return null;
    },
  },
  {
    regex: /\[\[([^\]]+)\]\[([^\]]+)\]\]/g,
    handler: (m) => ({ type: 'link', label: m[2], target: m[1] }),
  },
  {
    regex: /\[\[([^\]]+)\]\]/g,
    handler: (m) => ({ type: 'link', label: m[1], target: m[1] }),
  },
  {
    regex: /\[([^\]]+)\]\(([^)]+)\)/g,
    handler: (m) => ({ type: 'link', label: m[1], target: m[2] }),
  },
  {
    regex: /`([^`]+)`/g,
    handler: (m) => ({ type: 'code', content: m[1] }),
  },
  {
    regex: /\*(\S[^*]*?)\*/g,
    handler: (m) => ({ type: 'bold', content: m[1] }),
  },
  {
    regex: /\/(\S[^/]*?)\//g,
    handler: (m) => ({ type: 'italic', content: m[1] }),
    validate: (source, match) => {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      const prev = start > 0 ? source[start - 1] : '';
      const next = end < source.length ? source[end] : '';
      return (!prev || !WORD_CHAR_REGEX.test(prev)) && (!next || !WORD_CHAR_REGEX.test(next));
    },
  },
  {
    regex: /_([^_]+)_/g,
    handler: (m) => ({ type: 'underline', content: m[1] }),
  },
  {
    regex: /-([^-\s][^-]*)-/g,
    handler: (m) => ({ type: 'strikethrough', content: m[1] }),
  },
  {
    regex: /\^([^^]+)\^/g,
    handler: (m) => ({ type: 'superscript', content: m[1] }),
  },
  {
    regex: /,([^,]+),/g,
    handler: (m) => ({ type: 'subscript', content: m[1] }),
  },
  { regex: /\+([^+\s][^+]*[^+\s]?)\+/g, handler: (m) => ({ type: 'org-strike', content: m[1] }) },
  { regex: /=([^=\s][^=]*[^=\s]?)=/g, handler: (m) => ({ type: 'verbatim', content: m[1] }) },
  { regex: /~([^~\s][^~]*[^~\s]?)~/g, handler: (m) => ({ type: 'org-code', content: m[1] }) },
];

function findOuterDelimitedMatch(text: string, delimiter: '*' | '/'): { length: number; segment: InlineSegment } | null {
  if (!text.startsWith(delimiter)) return null;

  const closingIndex = text.lastIndexOf(delimiter);
  if (closingIndex <= 0) return null;

  const content = text.slice(1, closingIndex);
  if (!content || !content.includes(delimiter)) return null;
  if (!/^\S/.test(content)) return null;

  return {
    length: closingIndex + 1,
    segment: delimiter === '*'
      ? { type: 'bold', content }
      : { type: 'italic', content },
  };
}

export function parseNeorgInlineSegments(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    let earliestMatch: { index: number; length: number; segment: InlineSegment } | null = null;

    const urlMatch = remaining.match(URL_SHAPED_REGEX);
    if (urlMatch?.index !== undefined) {
      earliestMatch = {
        index: urlMatch.index,
        length: urlMatch[0].length,
        segment: { type: 'link', label: urlMatch[0], target: urlMatch[0] },
      };
    }

    const nestedBold = findOuterDelimitedMatch(remaining, '*');
    if (nestedBold) {
      earliestMatch = {
        index: 0,
        length: nestedBold.length,
        segment: nestedBold.segment,
      };
    }

    const nestedItalic = findOuterDelimitedMatch(remaining, '/');
    if (nestedItalic && (!earliestMatch || earliestMatch.index > 0 || nestedItalic.length > earliestMatch.length)) {
      earliestMatch = {
        index: 0,
        length: nestedItalic.length,
        segment: nestedItalic.segment,
      };
    }

    for (const { regex, handler, validate } of inlinePatterns) {
      regex.lastIndex = 0;
      const match = regex.exec(remaining);
      if (match && match.index >= 0 && (!validate || validate(remaining, match))) {
        const seg = handler(match);
        if (seg && (!earliestMatch || match.index < earliestMatch.index)) {
          earliestMatch = { index: match.index, length: match[0].length, segment: seg };
        }
      }
    }

    if (earliestMatch) {
      if (earliestMatch.index > 0) {
        segments.push({ type: 'text', content: remaining.slice(0, earliestMatch.index) });
      }
      segments.push(earliestMatch.segment);
      remaining = remaining.slice(earliestMatch.index + earliestMatch.length);
    } else {
      segments.push({ type: 'text', content: remaining });
      break;
    }
  }

  return segments;
}

export function createMemoizedNeorgInlineParser(
  parser: (text: string) => InlineSegment[] = parseNeorgInlineSegments,
): (text: string) => InlineSegment[] {
  const cache = new Map<string, InlineSegment[]>();

  return (text: string): InlineSegment[] => {
    const cached = cache.get(text);
    if (cached) return cached;
    const parsed = parser(text);
    cache.set(text, parsed);
    return parsed;
  };
}

export default function StructuredRenderer({ blocks, format = 'neorg', onOpenNote, currentNotePath, headingPositions, scrollRef }: StructuredRendererProps) {
  const { colors } = useTheme();
  const overrides = useRenderStyle(format);

  const headingColorFor = (level: number): string => {
    if (level === 1) return overrides.h1?.color ?? colors.text;
    if (level === 2) return overrides.h2?.color ?? colors.text;
    if (level === 3) return overrides.h3?.color ?? colors.text;
    return colors.text;
  };
  const headingWeightFor = (level: number): '400' | '500' | '600' | '700' | 'bold' | 'normal' | undefined => {
    if (level === 1) return overrides.h1?.fontWeight;
    if (level === 2) return overrides.h2?.fontWeight;
    if (level === 3) return overrides.h3?.fontWeight;
    return undefined;
  };
  const bodyColor = overrides.body?.color ?? colors.text;
  const codeBg = overrides.codeBlock?.background ?? colors.surfaceSecondary;
  const codeText = overrides.codeBlock?.text ?? colors.text;
  const inlineBg = overrides.inlineCode?.background;
  const inlineText = overrides.inlineCode?.text;
  const linkColor = overrides.link?.color ?? colors.primary;
  const quoteBar = overrides.blockquote?.bar ?? colors.primary;
  const quoteText = overrides.blockquote?.text ?? colors.text;
  const dividerColor = overrides.divider?.color ?? colors.border;

  const todoColor = (state: string): string => {
    switch (state) {
      case 'TODO': return '#F97316';
      case 'DONE': return '#22C55E';
      case 'IN-PROGRESS': return '#3B82F6';
      case 'WAITING': return '#EAB308';
      default: return '#9CA3AF';
    }
  };
  const priorityColor = (p: string): string => {
    switch (p) {
      case 'A': return '#EF4444';
      case 'B': return '#F59E0B';
      case 'C': return '#22C55E';
      default: return '#9CA3AF';
    }
  };

  const handleLinkPress = (target: string) => {
    const classified = classifyHref(target, currentNotePath);
    if (!classified) {
      Alert.alert("Can't open link", target);
      return;
    }

    if (classified.kind === 'web') {
      Linking.openURL(classified.target).catch(() => {
        Alert.alert("Can't open link", classified.target);
      });
      return;
    }

    if (classified.kind === 'mailto') {
      Linking.openURL(`mailto:${classified.target}`).catch(() => {
        Alert.alert("Can't open link", classified.target);
      });
      return;
    }

    if (classified.kind === 'note') {
      const opened = onOpenNote?.(classified.target, classified.fragment) ?? false;
      if (!opened) {
        Alert.alert('Link target not found');
      }
      return;
    }

    if (classified.kind === 'anchor') {
      const slug = classified.target;
      const measuredY = headingPositions?.current.get(slug);
      if (measuredY != null && scrollRef?.current) {
        scrollRef.current.scrollTo({ y: measuredY, animated: true });
        return;
      }
      Alert.alert('Heading not found', `No heading matches #${slug} in this note.`);
      return;
    }
  };

  const parseInline = useMemo(() => createMemoizedNeorgInlineParser(), []);

  const segKey = (seg: InlineSegment, i: number): string =>
    `${i}-${seg.type}-${'content' in seg ? seg.content : 'name' in seg ? seg.name : seg.type}`;

  const renderInline = (text: string): React.ReactNode => {
    const segments = parseInline(text);
    if (segments.length === 0) return null;

    return (
      <React.Fragment>
        {segments.map((seg, i) => {
          const k = segKey(seg, i);
          switch (seg.type) {
            case 'bold':
              return <Text key={k} selectable style={styles.bold}>{renderInline(seg.content)}</Text>;
            case 'italic':
              return <Text key={k} selectable style={styles.italic}>{renderInline(seg.content)}</Text>;
            case 'underline':
              return <Text key={k} selectable style={styles.underline}>{renderInline(seg.content)}</Text>;
            case 'strikethrough':
              return <Text key={k} selectable style={styles.strikethrough}>{renderInline(seg.content)}</Text>;
            case 'verbatim':
              return <Text key={k} selectable style={[styles.inlineCode, { backgroundColor: inlineBg ?? colors.surfaceSecondary }]}>{seg.content}</Text>;
            case 'org-code':
              return <Text key={k} selectable style={[styles.inlineCode, { backgroundColor: inlineBg ?? colors.surfaceSecondary }, inlineText ? { color: inlineText } : null]}>{seg.content}</Text>;
            case 'org-strike':
              return <Text key={k} selectable style={styles.strikethrough}>{seg.content}</Text>;
            case 'code':
              return (
                <Text
                  key={k}
                  selectable
                  style={[
                    styles.inlineCode,
                    { backgroundColor: inlineBg ?? colors.surfaceSecondary },
                    inlineText ? { color: inlineText } : null,
                  ]}
                >
                  {seg.content}
                </Text>
              );
            case 'superscript':
              return <Text key={k} selectable style={styles.superscript}>{renderInline(seg.content)}</Text>;
            case 'subscript':
              return <Text key={k} selectable style={styles.subscript}>{renderInline(seg.content)}</Text>;
            case 'link':
              return (
                <Text
                  key={k}
                  selectable
                  style={[styles.link, { color: linkColor }]}
                  onPress={() => handleLinkPress(seg.target)}
                >
                  {seg.label}
                </Text>
              );
            case 'tag':
              return (
                <Text key={k} selectable style={[styles.tagBadge, { backgroundColor: colors.primary + '20', color: colors.primary }]}> 
                  {seg.name}
                </Text>
              );
            case 'footnote-ref':
              return <Text key={k} selectable style={{ fontSize: 11, lineHeight: 14, color: linkColor }}>{seg.label}</Text>;
            default:
              return 'content' in seg ? <Text key={k} selectable>{seg.content}</Text> : null;
          }
        })}
      </React.Fragment>
    );
  };

  const taskStatusIcon = (status?: string): string => {
    switch (status) {
      case 'done': return '✓';
      case 'important': return '!';
      case 'uncertain': return '?';
      case 'in-progress': return '◐';
      case 'urgent': return '⏰';
      case 'cancelled': return '✗';
      case 'on-hold': return '⏸';
      case 'recurring': return '↻';
      default: return '○';
    }
  };

  const renderHeading = (heading: NeorgHeading, blockIndex: number) => {
    const fontSize = 32 - (heading.level - 1) * 4;
    const fontWeight = headingWeightFor(heading.level);
    return (
      <View key={`heading-${blockIndex}`} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: heading.level === 1 ? 16 : 12, marginBottom: 8 }}>
        {format === 'org' && heading.todoState && (
          <Text style={[styles.todoBadge, { backgroundColor: todoColor(heading.todoState) + '20', color: todoColor(heading.todoState) }]}>
            {heading.todoState}
          </Text>
        )}
        {format === 'org' && heading.priority && (
          <Text style={[styles.priorityBadge, { backgroundColor: priorityColor(heading.priority) + '30', color: priorityColor(heading.priority) }]}>
            #{heading.priority}
          </Text>
        )}
        <Text
          selectable
          style={[
            styles.heading,
            { fontSize, color: headingColorFor(heading.level) },
            fontWeight ? { fontWeight } : null,
          ]}
        >
          {renderInline(heading.text)}
        </Text>
        {format === 'org' && heading.tags && heading.tags.map((tag, ti) => (
          <Text key={`tag-${ti}`} style={[styles.tagChip, { backgroundColor: colors.primary + '15', color: colors.primary }]}>
            {tag}
          </Text>
        ))}
      </View>
    );
  };

  const renderListItem = (item: NeorgListItem, blockIndex: number, itemIndex: number) => {
    const indent = item.indentLevel * 16;
    let prefix = '- ';
    if (item.type === 'ordered') {
      prefix = `${itemIndex + 1}. `;
    } else if (item.type === 'task') {
      prefix = `${taskStatusIcon(item.status)} `;
    }
    return (
      <View key={`list-${blockIndex}-${itemIndex}`} style={[styles.listItem, { marginLeft: indent }]}> 
        <Text selectable style={[styles.listText, { color: colors.text }]}>
          {prefix}{renderInline(item.text)}
        </Text>
      </View>
    );
  };

  const renderChecklistItem = (item: NeorgChecklistItem, blockIndex: number, itemIndex: number) => {
    const indent = item.indentLevel * 16;
    return (
      <View key={`check-${blockIndex}-${itemIndex}`} style={[styles.listItem, { marginLeft: indent }]}> 
        <Text selectable style={[styles.listText, { color: colors.text }]}>
          {item.checked ? '✓' : '○'} {renderInline(item.text)}
        </Text>
      </View>
    );
  };

  const renderDefinitionItem = (item: NeorgDefinitionItem, blockIndex: number, itemIndex: number) => {
    const indent = item.indentLevel * 16;
    return (
      <View key={`def-${blockIndex}-${itemIndex}`} style={[styles.definitionItem, { marginLeft: indent }]}> 
        <Text selectable style={[styles.definitionTerm, { color: colors.primary }]}> 
          {item.term}
        </Text>
        {item.definition ? (
          <Text selectable style={[styles.definitionText, { color: colors.text }]}>
            {renderInline(item.definition)}
          </Text>
        ) : null}
      </View>
    );
  };

  const renderParagraph = (text: string, blockIndex: number) => (
    <Text key={`para-${blockIndex}`} selectable style={[styles.paragraph, { color: bodyColor }]}>
      {renderInline(text)}
    </Text>
  );

  const renderCodeBlock = (code: { language?: string; content: string }, blockIndex: number) => (
    <View key={`code-${blockIndex}`} style={[styles.codeBlock, { backgroundColor: codeBg }]}>
      {code.language && (
        <Text selectable style={[styles.codeLanguage, { color: colors.textSecondary }]}>{code.language}</Text>
      )}
      <Text selectable style={[styles.codeContent, { color: codeText }]}>{code.content}</Text>
    </View>
  );

  const renderTable = (block: NeorgContentBlock, blockIndex: number) => {
    if (!block.tableRows || block.tableRows.length === 0) return null;
    return (
      <View key={`table-${blockIndex}`} style={[styles.tableContainer, { borderColor: colors.border }]}>
        {block.tableRows.map((row, rowIdx) => {
          const isHeader = block.isHeaderRow?.[rowIdx] || rowIdx === 0;
          return (
            <View
              key={`tr-${blockIndex}-${rowIdx}`}
              style={[
                styles.tableRow,
                { borderBottomColor: colors.border },
                isHeader && { backgroundColor: colors.surfaceSecondary },
              ]}
            >
              {row.cells.map((cell, cellIdx) => (
                <Text
                  key={`tc-${blockIndex}-${rowIdx}-${cellIdx}`}
                  selectable
                  style={[
                    styles.tableCell,
                    { color: colors.text },
                    isHeader && styles.tableHeaderCell,
                  ]}
                >
                  {renderInline(cell)}
                </Text>
              ))}
            </View>
          );
        })}
      </View>
    );
  };

  const renderQuote = (text: string, blockIndex: number) => (
    <View
      key={`quote-${blockIndex}`}
      style={[styles.quoteBlock, { backgroundColor: quoteBar + '15', borderLeftColor: quoteBar }]}
    >
      <Text selectable style={[styles.quoteText, { color: quoteText }]}>{renderInline(text)}</Text>
    </View>
  );

  const renderDivider = (blockIndex: number) => (
    <View key={`hr-${blockIndex}`} style={[styles.divider, { backgroundColor: dividerColor }]} />
  );

  const renderBlock = (block: NeorgContentBlock, index: number) => {
    switch (block.type) {
      case 'heading':
        return block.heading ? renderHeading(block.heading, index) : null;
      case 'list':
        return block.listItems?.map((item, i) => renderListItem(item, index, i));
      case 'checklist':
        return block.checklistItems?.map((item, i) => renderChecklistItem(item, index, i));
      case 'definition':
        return block.definitionItems?.map((item, i) => renderDefinitionItem(item, index, i));
      case 'paragraph':
        return block.text ? renderParagraph(block.text, index) : null;
      case 'code':
        return block.code ? renderCodeBlock(block.code, index) : null;
      case 'table':
        return renderTable(block, index);
      case 'quote':
        return block.text ? renderQuote(block.text, index) : null;
      case 'divider':
        return renderDivider(index);
      case 'timestamp':
        return block.timestamp ? (
          <View key={`ts-${index}`} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <Text selectable style={{ fontSize: 14, color: colors.textSecondary }}>
              {block.timestamp.type === 'scheduled' ? '📅 SCHEDULED' :
               block.timestamp.type === 'deadline' ? '⏰ DEADLINE' :
               block.timestamp.type === 'closed' ? '✅ CLOSED' :
               block.timestamp.type === 'active' ? '📆' : '📋'} {block.timestamp.date}
              {block.timestamp.time ? ` ${block.timestamp.time}` : ''}
            </Text>
          </View>
        ) : null;
      case 'footnote':
        return block.footnote ? (
          <View key={`fn-${index}`} style={{ marginBottom: 8, paddingLeft: 16 }}>
            <Text selectable style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>
              [^{block.footnote.label}]
            </Text>
            <Text selectable style={{ fontSize: 14, lineHeight: 20, marginLeft: 16, marginTop: 2, color: colors.textSecondary }}>
              {block.footnote.content}
            </Text>
          </View>
        ) : null;
      case 'drawer':
        return block.drawer ? (
          <View key={`dr-${index}`} style={{ padding: 8, borderRadius: 4, marginVertical: 4, backgroundColor: colors.surfaceSecondary, opacity: 0.7 }}>
            <Text selectable style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 }}>
              :{block.drawer.name}:
            </Text>
            {Object.entries(block.drawer.properties).map(([key, value]) => (
              <Text key={key} selectable style={{ fontSize: 12, fontFamily: 'monospace', color: colors.textSecondary }}>
                :{key}: {value}
              </Text>
            ))}
          </View>
        ) : null;
      case 'fixed-width':
        return block.text ? (
          <Text key={`fw-${index}`} selectable style={{ fontFamily: 'monospace', fontSize: 14, paddingVertical: 2, color: colors.text }}>
            {block.text}
          </Text>
        ) : null;
      case 'image':
        return block.image ? (
          <View key={`img-${index}`} style={{ padding: 8, borderRadius: 4, marginVertical: 4, backgroundColor: colors.surfaceSecondary, alignItems: 'center' }}>
            <Text selectable style={{ fontSize: 14, color: colors.text }}>📷 {block.image.path}</Text>
            {block.image.caption ? <Text selectable style={{ fontSize: 12, color: colors.textSecondary }}>{block.image.caption}</Text> : null}
          </View>
        ) : null;
      case 'math':
        return block.math ? (
          <View key={`math-${index}`} style={[styles.codeBlock, { backgroundColor: codeBg }]}>
            <Text selectable style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 }}>MATH</Text>
            <Text selectable style={{ fontFamily: 'monospace', fontSize: 14, color: codeText }}>{block.math.content}</Text>
          </View>
        ) : null;
      case 'comment':
        return null;
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {blocks.map((block, index) => renderBlock(block, index))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  heading: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  bold: {
    fontWeight: 'bold',
  },
  italic: {
    fontStyle: 'italic',
  },
  underline: {
    textDecorationLine: 'underline',
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  inlineCode: {
    fontFamily: 'monospace',
    fontSize: 13,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  superscript: {
    fontSize: 11,
    lineHeight: 14,
  },
  subscript: {
    fontSize: 11,
    lineHeight: 14,
  },
  link: {
    textDecorationLine: 'underline',
  },
  tagBadge: {
    fontSize: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  footnoteRef: {
    fontSize: 12,
    lineHeight: 16,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 12,
  },
  listItem: {
    marginBottom: 4,
  },
  listText: {
    fontSize: 16,
    lineHeight: 24,
  },
  definitionItem: {
    marginBottom: 6,
  },
  definitionTerm: {
    fontSize: 16,
    fontWeight: '600',
  },
  definitionText: {
    fontSize: 14,
    lineHeight: 20,
    marginLeft: 16,
    marginTop: 2,
  },
  codeBlock: {
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
  },
  codeLanguage: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  codeContent: {
    fontFamily: 'monospace',
    fontSize: 14,
  },
  tableContainer: {
    borderWidth: 1,
    borderRadius: 6,
    marginVertical: 8,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  tableCell: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  tableHeaderCell: {
    fontWeight: '600',
  },
  quoteBlock: {
    borderLeftWidth: 4,
    paddingLeft: 12,
    paddingVertical: 8,
    marginVertical: 8,
  },
  quoteText: {
    fontSize: 16,
    lineHeight: 24,
    fontStyle: 'italic',
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  todoBadge: { fontSize: 12, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  priorityBadge: { fontSize: 11, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, overflow: 'hidden' },
  tagChip: { fontSize: 11, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
});
