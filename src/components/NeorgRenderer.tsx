import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NeorgContentBlock, NeorgHeading, NeorgListItem, NeorgChecklistItem } from '../models/NeorgContent';
import { useTheme } from '../contexts/ThemeContext';

interface NeorgRendererProps {
  blocks: NeorgContentBlock[];
}

export default function NeorgRenderer({ blocks }: NeorgRendererProps) {
  const { colors, isDark } = useTheme();

  const renderHeading = (heading: NeorgHeading) => {
    const fontSize = 32 - (heading.level - 1) * 4;
    return (
      <Text
        key={`heading-${heading.text}`}
        style={[
          styles.heading,
          { fontSize, color: colors.text, marginTop: heading.level === 1 ? 16 : 12 },
        ]}
      >
        {heading.text}
      </Text>
    );
  };

  const renderListItem = (item: NeorgListItem, index: number) => {
    const indent = item.indentLevel * 16;
    let prefix = '- ';
    
    if (item.type === 'ordered') {
      prefix = `${index + 1}. `;
    } else if (item.type === 'task') {
      prefix = item.status === 'done' ? '[x] ' : '[ ] ';
    }

    return (
      <View key={`list-${index}`} style={[styles.listItem, { marginLeft: indent }]}>
        <Text style={[styles.listText, { color: colors.text }]}>
          {prefix}{item.text}
        </Text>
      </View>
    );
  };

  const renderChecklistItem = (item: NeorgChecklistItem, index: number) => {
    const indent = item.indentLevel * 16;
    return (
      <View key={`check-${index}`} style={[styles.listItem, { marginLeft: indent }]}>
        <Text style={[styles.listText, { color: colors.text }]}>
          {item.checked ? '✓' : '○'} {item.text}
        </Text>
      </View>
    );
  };

  const renderParagraph = (text: string) => (
    <Text key={`para-${text.slice(0, 10)}`} style={[styles.paragraph, { color: colors.text }]}>
      {text}
    </Text>
  );

  const renderCodeBlock = (code: { language?: string; content: string }) => (
    <View key={`code-${code.content.slice(0, 10)}`} style={[styles.codeBlock, { backgroundColor: isDark ? '#2c2c2e' : '#f0f0f0' }]}>
      {code.language && (
        <Text style={[styles.codeLanguage, { color: colors.textSecondary }]}>{code.language}</Text>
      )}
      <Text style={[styles.codeContent, { color: colors.text }]}>{code.content}</Text>
    </View>
  );

  const renderBlock = (block: NeorgContentBlock, index: number) => {
    switch (block.type) {
      case 'heading':
        return block.heading ? renderHeading(block.heading) : null;
      case 'list':
        return block.listItems?.map((item, i) => renderListItem(item, i));
      case 'checklist':
        return block.checklistItems?.map((item, i) => renderChecklistItem(item, i));
      case 'paragraph':
        return block.text ? renderParagraph(block.text) : null;
      case 'code':
        return block.code ? renderCodeBlock(block.code) : null;
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
    flex: 1,
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
});
