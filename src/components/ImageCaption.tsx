import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../contexts/ThemeContext';

export interface ImageCaptionProps {
  text: string;
  mode: 'overlay' | 'inline';
  isDark: boolean;
}

export default function ImageCaption({ text, mode, isDark }: ImageCaptionProps) {
  const { colors } = useTheme();
  const caption = text.trim();

  if (!caption) {
    return null;
  }

  const containerStyle = mode === 'overlay' ? styles.overlayContainer : styles.inlineContainer;
  const textStyle = [styles.text, { color: isDark ? colors.text : colors.textSecondary }];

  return (
    <View
      testID={mode === 'overlay' ? 'image-caption-overlay' : 'image-caption-inline'}
      style={[containerStyle, mode === 'overlay' ? styles.overlayBackground : null]}
    >
      <Text testID="image-caption-text" style={textStyle}>
        {caption}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  overlayBackground: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  inlineContainer: {
    position: 'relative',
    marginTop: 4,
  },
  text: {
    fontSize: 12,
    lineHeight: 16,
  },
});
