import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, Text, View } from 'react-native';

import type { FormatAction } from '../utils/markdownFormatting';

export type { FormatAction };

type ToolbarButton = {
  label: string;
  action: FormatAction;
  testID: string;
};

const BUTTONS: ToolbarButton[] = [
  { label: 'H1', action: { type: 'line', before: '# ' }, testID: 'editor-toolbar.toolbar-action.heading' },
  { label: 'H2', action: { type: 'line', before: '## ' }, testID: 'editor-toolbar.toolbar-action.heading' },
  { label: 'B', action: { type: 'wrap', before: '**', after: '**' }, testID: 'editor-toolbar.toolbar-action.bold' },
  { label: 'I', action: { type: 'wrap', before: '*', after: '*' }, testID: 'editor-toolbar.toolbar-action.italic' },
  { label: 'Link', action: { type: 'insert', before: '[text](url)' }, testID: 'editor-toolbar.toolbar-action.link' },
  { label: 'UL', action: { type: 'line', before: '- ' }, testID: 'editor-toolbar.toolbar-action.list' },
  { label: 'OL', action: { type: 'line', before: '1. ' }, testID: 'editor-toolbar.toolbar-action.list' },
  { label: 'Checklist', action: { type: 'line', before: '- [ ] ' }, testID: 'editor-toolbar.toolbar-action.list' },
  { label: 'Code', action: { type: 'wrap', before: '`', after: '`' }, testID: 'editor-toolbar.toolbar-action.code' },
  { label: 'Quote', action: { type: 'line', before: '> ' }, testID: 'editor-toolbar.toolbar-action.heading' },
  { label: 'Tab', action: { type: 'insert', before: '  ' }, testID: 'editor-toolbar.toolbar-action.heading' },
];

type Props = {
  onFormat: (action: FormatAction) => void;
};

export function MarkdownToolbar({ onFormat }: Props) {
  return (
    <View testID="markdown-toolbar.toolbar-action.press">
      <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {BUTTONS.map(({ label, action, testID: btnTestID }) => (
        <TouchableOpacity
          key={label}
          testID={btnTestID}
          onPress={() => onFormat(action)}
          style={styles.button}
          accessibilityLabel={label}
        >
          <Text style={styles.buttonText}>{label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 0,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  button: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
