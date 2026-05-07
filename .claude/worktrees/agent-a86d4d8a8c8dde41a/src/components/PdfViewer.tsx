import React from 'react';
import { Linking, StyleProp, TouchableOpacity, View, ViewStyle, Text, StyleSheet } from 'react-native';

interface PdfViewerProps {
  uri: string;
  token?: string | null;
  style?: StyleProp<ViewStyle>;
  onError?: (message: string) => void;
}

export default function PdfViewer({ uri, style, onError }: PdfViewerProps) {
  return (
    <View style={style}>
      <TouchableOpacity
        style={styles.openButton}
        onPress={async () => {
          try {
            await Linking.openURL(uri);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError?.(message);
          }
        }}
      >
        <Text style={styles.openButtonText}>Open PDF</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  openButton: {
    alignSelf: 'center',
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#007AFF',
  },
  openButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
