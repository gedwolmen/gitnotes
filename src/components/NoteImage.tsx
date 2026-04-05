import React, { useState, useCallback } from 'react';
import { View, Image, Text, StyleSheet, TouchableOpacity, Modal, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

const { width: screenWidth } = Dimensions.get('window');

interface NoteImageProps {
  uri: string;
  alt?: string;
  caption?: string;
}

export default function NoteImage({ uri, alt = '', caption }: NoteImageProps) {
  const { colors, isDark } = useTheme();
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [imageError, setImageError] = useState(false);

  const handlePress = useCallback(() => {
    setShowFullscreen(true);
  }, []);

  const handleClose = useCallback(() => {
    setShowFullscreen(false);
  }, []);

  if (imageError) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="image-outline" size={32} color={colors.textSecondary} />
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>
          Failed to load image
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.9}>
        <Image
          source={{ uri }}
          style={styles.image}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />
      </TouchableOpacity>

      {caption && (
        <Text style={[styles.caption, { color: colors.textSecondary }]}>
          {caption}
        </Text>
      )}

      <Modal visible={showFullscreen} transparent animationType="fade">
        <View style={styles.fullscreenContainer}>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Image
            source={{ uri }}
            style={styles.fullscreenImage}
            resizeMode="contain"
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  image: {
    width: screenWidth - 32,
    height: 200,
    borderRadius: 8,
  },
  caption: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  errorContainer: {
    padding: 20,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 8,
  },
  errorText: {
    fontSize: 12,
    marginTop: 8,
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: screenWidth,
    height: '80%',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 1,
    padding: 8,
  },
});