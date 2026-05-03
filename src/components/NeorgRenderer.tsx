import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NeorgContentBlock, NeorgHeading, NeorgListItem, NeorgChecklistItem, NeorgDefinitionItem } from '../models/NeorgContent';
import { useTheme } from '../contexts/ThemeContext';

interface NeorgRendererProps {
  blocks: NeorgContentBlock[];
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
  | { type: 'link'; label: string; target: string }
  | { type: 'tag'; name: string };

export default function NeorgRenderer({ blocks }: NeorgRendererProps) {
  const { colors } = useTheme();

  const parseInline = (text: string): InlineSegment[] => {
    const segments: InlineSegment[] = [];
    const patterns: { regex: RegExp; handler: (m: RegExpMatchArray) => InlineSegment | null }[] = [
      {
        regex: /\{([a-z0-9_.:]+)\}(?:\[([^\]]+)\])?/g,
        handler: (m) => {
          const target = m[1];
          if (/^[a-z0-9_.:-]+$/.test(target)) {
            if (m[2]) return { type: 'link', label: m[2], target };
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
        regex: /\*([^*]+)\*/g,
        handler: (m) => ({ type: 'bold', content: m[1] }),
      },
      {
        regex: /\/([^/]+)\//g,
        handler: (m) => ({ type: 'italic', content: m[1] }),
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
    ];

    let remaining = text;
    while (remaining.length > 0) {
      let earliestMatch: { index: number; length: number; segment: InlineSegment } | null = null;

      for (const { regex, handler } of patterns) {
        regex.lastIndex = 0;
        const match = regex.exec(remaining);
        if (match && match.index >= 0) {
          if (!earliestMatch || match.index < earliestMatch.index) {
            const seg = handler(match);
            if (seg) {
              earliestMatch = { index: match.index, length: match[0].length, segment: seg };
            }
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
  };

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
              return <Text key={k} selectable style={styles.bold}>{seg.content}</Text>;
            case 'italic':
              return <Text key={k} selectable style={styles.italic}>{seg.content}</Text>;
            case 'underline':
              return <Text key={k} selectable style={styles.underline}>{seg.content}</Text>;
            case 'strikethrough':
              return <Text key={k} selectable style={styles.strikethrough}>{seg.content}</Text>;
            case 'code':
              return (
                <Text key={k} selectable style={[styles.inlineCode, { backgroundColor: colors.surfaceSecondary }]}>
                  {seg.content}
                </Text>
              );
            case 'superscript':
              return <Text key={k} selectable style={styles.superscript}>{seg.content}</Text>;
            case 'subscript':
              return <Text key={k} selectable style={styles.subscript}>{seg.content}</Text>;
            case 'link':
              return (
                <Text key={k} selectable style={[styles.link, { color: colors.primary }]}>
                  {seg.label}
                </Text>
              );
            case 'tag':
              return (
                <Text key={k} selectable style={[styles.tagBadge, { backgroundColor: colors.primary + '20', color: colors.primary }]}>
                  {seg.name}
                </Text>
              );
            default:
              return <Text key={k} selectable>{seg.content}</Text>;
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
    return (
      <Text
        key={`heading-${blockIndex}`}
        selectable
        style={[
          styles.heading,
          { fontSize, color: colors.text, marginTop: heading.level === 1 ? 16 : 12 },
        ]}
      >
        {renderInline(heading.text)}
      </Text>
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
    <Text key={`para-${blockIndex}`} selectable style={[styles.paragraph, { color: colors.text }]}>
      {renderInline(text)}
    </Text>
  );

  const renderCodeBlock = (code: { language?: string; content: string }, blockIndex: number) => (
      <View key={`code-${blockIndex}`} style={[styles.codeBlock, { backgroundColor: colors.surfaceSecondary }]}>
        {code.language && (
          <Text selectable style={[styles.codeLanguage, { color: colors.textSecondary }]}>{code.language}</Text>
        )}
        <Text selectable style={[styles.codeContent, { color: colors.text }]}>{code.content}</Text>
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
      style={[styles.quoteBlock, { backgroundColor: colors.primary + '15', borderLeftColor: colors.primary }]}
    >
      <Text selectable style={[styles.quoteText, { color: colors.text }]}>{renderInline(text)}</Text>
    </View>
  );

  const renderDivider = (blockIndex: number) => (
    <View key={`hr-${blockIndex}`} style={[styles.divider, { backgroundColor: colors.border }]} />
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
});
