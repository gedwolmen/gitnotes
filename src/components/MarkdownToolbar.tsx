import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, Text } from 'react-native';

import type { FormatAction } from '../utils/markdownFormatting';

export type { FormatAction };

type ToolbarButton = {
  label: string;
  action: FormatAction;
};

const BUTTONS: ToolbarButton[] = [
  { label: 'H1', action: { type: 'line', before: '# ' } },
  { label: 'H2', action: { type: 'line', before: '## ' } },
  { label: 'B', action: { type: 'wrap', before: '**', after: '**' } },
  { label: 'I', action: { type: 'wrap', before: '*', after: '*' } },
  { label: 'Link', action: { type: 'insert', before: '[text](url)' } },
  { label: 'UL', action: { type: 'line', before: '- ' } },
  { label: 'OL', action: { type: 'line', before: '1. ' } },
  { label: 'Checklist', action: { type: 'line', before: '- [ ] ' } },
  { label: 'Code', action: { type: 'wrap', before: '`', after: '`' } },
  { label: 'Quote', action: { type: 'line', before: '> ' } },
  { label: 'Tab', action: { type: 'insert', before: '  ' } },
];

type Props = {
  onFormat: (action: FormatAction) => void;
};

export function MarkdownToolbar({ onFormat }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {BUTTONS.map(({ label, action }) => (
        <TouchableOpacity
          key={label}
          onPress={() => onFormat(action)}
          style={styles.button}
          accessibilityLabel={label}
        >
          <Text style={styles.buttonText}>{label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
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
