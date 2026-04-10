import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NeorgContentBlock, NeorgHeading, NeorgListItem, NeorgChecklistItem } from '../models/NeorgContent';
import { useTheme } from '../contexts/ThemeContext';

interface NeorgRendererProps {
  blocks: NeorgContentBlock[];
}

export default function NeorgRenderer({ blocks }: NeorgRendererProps) {
  const { colors } = useTheme();

  const cleanInline = (text: string): string => {
    return text
      .replace(/\{([^}]+)\}(?:\[([^\]]+)\])?/g, (_, target, label) => label || target)
      .replace(/\[\[([^\]]+)\]\[([^\]]+)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/\/([^/]+)\//g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/-([^-\s][^-]*)-/g, '$1')
      .replace(/\^([^^]+)\^/g, '$1')
      .replace(/,([^,]+),/g, '$1');
  };

  const renderHeading = (heading: NeorgHeading, blockIndex: number) => {
    const fontSize = 32 - (heading.level - 1) * 4;
    return (
      <Text
        key={`heading-${blockIndex}`}
        style={[
          styles.heading,
          { fontSize, color: colors.text, marginTop: heading.level === 1 ? 16 : 12 },
        ]}
      >
        {cleanInline(heading.text)}
      </Text>
    );
  };

  const renderListItem = (item: NeorgListItem, blockIndex: number, itemIndex: number) => {
    const indent = item.indentLevel * 16;
    let prefix = '- ';
    if (item.type === 'ordered') {
      prefix = `${itemIndex + 1}. `;
    } else if (item.type === 'task') {
      prefix = item.status === 'done' ? '[x] ' : '[ ] ';
    }
    return (
      <View key={`list-${blockIndex}-${itemIndex}`} style={[styles.listItem, { marginLeft: indent }]}>
        <Text style={[styles.listText, { color: colors.text }]}>
          {prefix}{cleanInline(item.text)}
        </Text>
      </View>
    );
  };

  const renderChecklistItem = (item: NeorgChecklistItem, blockIndex: number, itemIndex: number) => {
    const indent = item.indentLevel * 16;
    return (
      <View key={`check-${blockIndex}-${itemIndex}`} style={[styles.listItem, { marginLeft: indent }]}>
        <Text style={[styles.listText, { color: colors.text }]}>
          {item.checked ? '✓' : '○'} {cleanInline(item.text)}
        </Text>
      </View>
    );
  };

  const renderParagraph = (text: string, blockIndex: number) => (
    <Text key={`para-${blockIndex}`} style={[styles.paragraph, { color: colors.text }]}>
      {cleanInline(text)}
    </Text>
  );

  const renderCodeBlock = (code: { language?: string; content: string }, blockIndex: number) => (
    <View key={`code-${blockIndex}`} style={[styles.codeBlock, { backgroundColor: colors.surfaceSecondary }]}>
      {code.language && (
        <Text style={[styles.codeLanguage, { color: colors.textSecondary }]}>{code.language}</Text>
      )}
      <Text style={[styles.codeContent, { color: colors.text }]}>{code.content}</Text>
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
                  style={[
                    styles.tableCell,
                    { color: colors.text },
                    isHeader && styles.tableHeaderCell,
                  ]}
                >
                  {cleanInline(cell)}
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
      <Text style={[styles.quoteText, { color: colors.text }]}>{cleanInline(text)}</Text>
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
