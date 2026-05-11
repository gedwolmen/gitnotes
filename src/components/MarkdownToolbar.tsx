import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, Text, View } from 'react-native';

import type { FormatAction } from '../utils/markdownFormatting';
import { getToolbarButtons } from '../utils/formatToolbarPresets';
import type { NoteFormat } from '../models/Note';

export type { FormatAction };

type Props = {
  onFormat: (action: FormatAction) => void;
  /** Active note format — picks the matching syntax preset (md / org / norg). */
  format?: NoteFormat;
};

export function MarkdownToolbar({ onFormat, format }: Props) {
  const buttons = getToolbarButtons(format);

  return (
    <View testID="markdown-toolbar.toolbar-action.press">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        {buttons.map(({ label, action, testID: btnTestID }) => (
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
