import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import SvgImage from './SvgImage';
import ImageCaption from './ImageCaption';
import ImageZoomRotate from './ImageZoomRotate';

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
  const isSvg = /\.svg$/i.test(uri);
  const captionText = (alt || caption || '').trim();

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
      <TouchableOpacity testID="note-image.button.tap" onPress={handlePress} activeOpacity={0.9}>
        {isSvg ? (
          <SvgImage uri={uri} isDark={isDark} />
        ) : (
          <Image
            source={{ uri }}
            style={styles.image}
            contentFit="cover"
            onError={() => setImageError(true)}
            accessibilityLabel={alt || undefined}
          />
        )}
      </TouchableOpacity>

      {captionText ? <ImageCaption text={captionText} mode="overlay" isDark={isDark} /> : null}

      <Modal visible={showFullscreen} transparent animationType="fade">
        <View style={styles.fullscreenContainer}>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <ImageZoomRotate>
            {isSvg ? (
              <SvgImage uri={uri} isDark={isDark} width={screenWidth} height={screenWidth * 0.8} />
            ) : (
              <Image
                source={{ uri }}
                style={styles.fullscreenImage}
                contentFit="contain"
                accessibilityLabel={alt || undefined}
              />
            )}
          </ImageZoomRotate>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    position: 'relative',
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
